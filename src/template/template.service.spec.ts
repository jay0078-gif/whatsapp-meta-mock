import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TemplateService } from './template.service';
import {
  TemplateMessage,
  TemplateStatus,
  TemplateType,
} from './entities/template-message.entity';
import { WhatsAppProviderFactory } from 'src/whatsapp/factory/whatsapp-provider.factory';

const mockTemplatePayload = {
  patientName: 'Jay Patel',
  doctorName: 'Dr. Sharma',
  appointmentDate: '2026-05-15',
  appointmentTime: '10:30 AM',
  hospitalName: 'City Hospital',
  phoneNumber: '919999999999',
};

const mockMetaTemplateResponse = {
  success: true,
  provider: 'META_WHATSAPP',
  messageId: 'meta-tmpl-uuid-001',
  to: '919999999999',
  templateName: 'appointment_confirmation',
  status: 'SENT',
  sentAt: '2026-05-15T10:00:00.000Z',
};

const mockTemplateRepo = {
  create: jest.fn().mockImplementation((dto) => dto),
  save: jest.fn().mockResolvedValue({}),
  findOne: jest.fn(),
};

const mockProviderFactory = {
  getProvider: jest.fn(),
  getFallbackProvider: jest.fn(),
};

describe('TemplateService', () => {
  let service: TemplateService;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockProviderFactory.getProvider.mockReturnValue({
      sendTemplateMessage: jest
        .fn()
        .mockResolvedValue(mockMetaTemplateResponse),
    });

    mockProviderFactory.getFallbackProvider.mockReturnValue({
      sendTemplateMessage: jest
        .fn()
        .mockResolvedValue(mockMetaTemplateResponse),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplateService,
        { provide: WhatsAppProviderFactory, useValue: mockProviderFactory },
        {
          provide: getRepositoryToken(TemplateMessage),
          useValue: mockTemplateRepo,
        },
      ],
    }).compile();

    service = module.get<TemplateService>(TemplateService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendConfirmation', () => {
    it('should send confirmation template and return SENT status', async () => {
      const result = await service.sendConfirmation({
        ...mockTemplatePayload,
        templateName: TemplateType.CONFIRMATION,
      });
      expect(result.success).toBe(true);
      expect(result.status).toBe('SENT');
      expect(result.messageId).toBeDefined();
    });

    it('should persist the template message to the repository', async () => {
      await service.sendConfirmation({
        ...mockTemplatePayload,
        templateName: TemplateType.CONFIRMATION,
      });
      expect(mockTemplateRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('sendReminder', () => {
    it('should send reminder template and return SENT status', async () => {
      const result = await service.sendReminder({
        ...mockTemplatePayload,
        templateName: TemplateType.REMINDER,
      });
      expect(result.success).toBe(true);
      expect(result.status).toBe('SENT');
    });
  });

  describe('sendCancellation', () => {
    it('should send cancellation template and return SENT status', async () => {
      const result = await service.sendCancellation({
        ...mockTemplatePayload,
        templateName: TemplateType.CANCELLATION,
      });
      expect(result.success).toBe(true);
      expect(result.status).toBe('SENT');
    });
  });

  describe('retry logic', () => {
    it('should retry up to 3 times on failure then use fallback', async () => {
      const mockSend = jest
        .fn()
        .mockRejectedValue(new Error('Network timeout'));
      const mockFallbackSend = jest
        .fn()
        .mockRejectedValue(new Error('Fallback also failed'));

      mockProviderFactory.getProvider.mockReturnValue({
        sendTemplateMessage: mockSend,
      });
      mockProviderFactory.getFallbackProvider.mockReturnValue({
        sendTemplateMessage: mockFallbackSend,
      });

      const result = await service.sendConfirmation({
        ...mockTemplatePayload,
        templateName: TemplateType.CONFIRMATION,
      });

      expect(mockSend).toHaveBeenCalledTimes(3);
      expect(mockFallbackSend).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(false);
      expect(result.status).toBe(TemplateStatus.FAILED);
      expect(result.failureReason).toBe('Network timeout');
    });

    it('should use fallback provider when primary fails all retries', async () => {
      const mockSend = jest.fn().mockRejectedValue(new Error('Primary down'));
      const mockFallbackSend = jest.fn().mockResolvedValue({
        ...mockMetaTemplateResponse,
        provider: 'MESSAGE_BIRD',
        messageId: 'mb-fallback-001',
      });

      mockProviderFactory.getProvider.mockReturnValue({
        sendTemplateMessage: mockSend,
      });
      mockProviderFactory.getFallbackProvider.mockReturnValue({
        sendTemplateMessage: mockFallbackSend,
      });

      const result = await service.sendConfirmation({
        ...mockTemplatePayload,
        templateName: TemplateType.CONFIRMATION,
      });

      expect(mockSend).toHaveBeenCalledTimes(3);
      expect(mockFallbackSend).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect((result as any).usedFallback).toBe(true);
    });

    it('should succeed on second attempt if first fails', async () => {
      const mockSend = jest
        .fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce(mockMetaTemplateResponse);

      mockProviderFactory.getProvider.mockReturnValue({
        sendTemplateMessage: mockSend,
      });

      const result = await service.sendConfirmation({
        ...mockTemplatePayload,
        templateName: TemplateType.CONFIRMATION,
      });

      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(1);
    });
  });

  describe('handleDeliveryEvent', () => {
    it('should update status to DELIVERED', async () => {
      mockTemplateRepo.findOne.mockResolvedValue({
        messageId: 'meta-tmpl-uuid-001',
        status: TemplateStatus.SENT,
      });

      const result = await service.handleDeliveryEvent({
        messageId: 'meta-tmpl-uuid-001',
        status: TemplateStatus.DELIVERED,
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe(TemplateStatus.DELIVERED);
    });

    it('should update status to FAILED with failureReason', async () => {
      mockTemplateRepo.findOne.mockResolvedValue({
        messageId: 'meta-tmpl-uuid-001',
        status: TemplateStatus.SENT,
      });

      const result = await service.handleDeliveryEvent({
        messageId: 'meta-tmpl-uuid-001',
        status: TemplateStatus.FAILED,
        failureReason: 'Number not registered',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe(TemplateStatus.FAILED);
    });

    it('should throw NotFoundException for unknown messageId', async () => {
      mockTemplateRepo.findOne.mockResolvedValue(null);

      await expect(
        service.handleDeliveryEvent({
          messageId: 'non-existent-id',
          status: TemplateStatus.DELIVERED,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getStatus', () => {
    it('should return status for a known messageId', async () => {
      mockTemplateRepo.findOne.mockResolvedValue({
        messageId: 'meta-tmpl-uuid-001',
        templateName: TemplateType.CONFIRMATION,
        provider: 'META_WHATSAPP',
        status: TemplateStatus.DELIVERED,
        retryCount: 0,
        failureReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.getStatus('meta-tmpl-uuid-001');
      expect(result.messageId).toBe('meta-tmpl-uuid-001');
      expect(result.status).toBe(TemplateStatus.DELIVERED);
    });

    it('should throw NotFoundException for unknown messageId', async () => {
      mockTemplateRepo.findOne.mockResolvedValue(null);

      await expect(service.getStatus('unknown-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
