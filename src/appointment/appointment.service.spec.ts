import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentService } from './appointment.service';
import { WhatsAppProviderFactory } from 'src/whatsapp/factory/whatsapp-provider.factory';

const appointmentPayload = {
  patientName: 'Jay Patel',
  phoneNumber: '919999999999',
  appointmentDate: '2026-05-15',
};

const mockMetaTemplateResponse = {
  success: true,
  provider: 'META_WHATSAPP',
  messageId: 'meta-tmpl-test-001',
  to: '919999999999',
  templateName: 'appointment_confirmation',
  status: 'SENT',
  sentAt: '2026-05-15T10:00:00.000Z',
};

const mockMessageBirdTemplateResponse = {
  success: true,
  provider: 'MESSAGE_BIRD',
  messageId: 'mb-tmpl-test-001',
  to: '919999999999',
  templateName: 'appointment_confirmation',
  status: 'SENT',
  sentAt: '2026-05-15T10:00:00.000Z',
};

describe('AppointmentService', () => {
  let service: AppointmentService;
  let mockFactory: { getProvider: jest.Mock };

  beforeEach(async () => {
    mockFactory = { getProvider: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentService,
        { provide: WhatsAppProviderFactory, useValue: mockFactory },
      ],
    }).compile();

    service = module.get<AppointmentService>(AppointmentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('provider switching', () => {
    it('should use MetaProvider when factory returns MetaProvider', async () => {
      mockFactory.getProvider.mockReturnValue({
        sendAppointmentMessage: jest.fn(),
        sendTemplateMessage: jest
          .fn()
          .mockResolvedValue(mockMetaTemplateResponse),
      });
      const result = await service.createAppointment(appointmentPayload);
      expect(result.whatsappResponse.provider).toBe('META_WHATSAPP');
      expect(result.whatsappResponse.success).toBe(true);
    });

    it('should use MessageBirdProvider when factory returns MessageBirdProvider', async () => {
      mockFactory.getProvider.mockReturnValue({
        sendAppointmentMessage: jest.fn(),
        sendTemplateMessage: jest
          .fn()
          .mockResolvedValue(mockMessageBirdTemplateResponse),
      });
      const result = await service.createAppointment(appointmentPayload);
      expect(result.whatsappResponse.provider).toBe('MESSAGE_BIRD');
      expect(result.whatsappResponse.success).toBe(true);
    });
  });

  describe('appointment notification flow', () => {
    it('should return appointment details and whatsapp response', async () => {
      mockFactory.getProvider.mockReturnValue({
        sendAppointmentMessage: jest.fn(),
        sendTemplateMessage: jest
          .fn()
          .mockResolvedValue(mockMetaTemplateResponse),
      });
      const result = await service.createAppointment(appointmentPayload);
      expect(result.success).toBe(true);
      expect(result.appointment.patientName).toBe('Jay Patel');
      expect(result.appointment.phoneNumber).toBe('919999999999');
      expect(result.appointment.appointmentDate).toBe('2026-05-15');
      expect(result.whatsappResponse.messageId).toBeDefined();
    });

    it('should call sendTemplateMessage with appointment_confirmation template', async () => {
      const mockSend = jest.fn().mockResolvedValue(mockMetaTemplateResponse);
      mockFactory.getProvider.mockReturnValue({
        sendAppointmentMessage: jest.fn(),
        sendTemplateMessage: mockSend,
      });
      await service.createAppointment(appointmentPayload);
      expect(mockSend).toHaveBeenCalledWith(
        'appointment_confirmation',
        expect.objectContaining({
          patientName: 'Jay Patel',
          phoneNumber: '919999999999',
          appointmentDate: '2026-05-15',
        }),
      );
    });
  });

  describe('failure scenarios', () => {
    it('should propagate error when provider receives invalid phone number', async () => {
      mockFactory.getProvider.mockReturnValue({
        sendAppointmentMessage: jest.fn(),
        sendTemplateMessage: jest
          .fn()
          .mockRejectedValue(new Error('Invalid phone number: 123')),
      });
      await expect(
        service.createAppointment({
          ...appointmentPayload,
          phoneNumber: '123',
        }),
      ).rejects.toThrow('Invalid phone number: 123');
    });

    it('should propagate error when provider throws network error', async () => {
      mockFactory.getProvider.mockReturnValue({
        sendAppointmentMessage: jest.fn(),
        sendTemplateMessage: jest
          .fn()
          .mockRejectedValue(new Error('Network timeout')),
      });
      await expect(
        service.createAppointment(appointmentPayload),
      ).rejects.toThrow('Network timeout');
    });
  });
});
