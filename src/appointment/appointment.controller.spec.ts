import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentController } from './appointment.controller';
import { AppointmentService } from './appointment.service';
import { WhatsAppProviderFactory } from 'src/whatsapp/factory/whatsapp-provider.factory';

describe('AppointmentController', () => {
  let controller: AppointmentController;

  const mockAppointmentService = {
    createAppointment: jest.fn().mockResolvedValue({
      success: true,
      appointment: {
        patientName: 'Jay Patel',
        phoneNumber: '919999999999',
        appointmentDate: '2026-05-15',
      },
      whatsappResponse: {
        success: true,
        provider: 'META_WHATSAPP',
        messageId: 'meta-wamid-test-001',
        to: '919999999999',
        body: 'Hello Jay Patel, your appointment is confirmed for 2026-05-15.',
        sentAt: '2026-05-15T10:00:00.000Z',
      },
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppointmentController],
      providers: [
        { provide: AppointmentService, useValue: mockAppointmentService },
        { provide: WhatsAppProviderFactory, useValue: {} },
      ],
    }).compile();

    controller = module.get<AppointmentController>(AppointmentController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should create appointment and return whatsapp response', async () => {
    const payload = {
      patientName: 'Jay Patel',
      phoneNumber: '919999999999',
      appointmentDate: '2026-05-15',
    };

    const result = await controller.create(payload);

    expect(result.success).toBe(true);
    expect(result.whatsappResponse.provider).toBe('META_WHATSAPP');
    expect(mockAppointmentService.createAppointment).toHaveBeenCalledWith(
      payload,
    );
  });
});
