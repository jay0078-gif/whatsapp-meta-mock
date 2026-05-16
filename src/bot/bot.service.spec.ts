import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BotService } from './bot.service';
import { BotSession } from './entities/bot-session.entity';
import { IntentRecognizerService } from './intent/intent-recognizer.service';
import { SlotManagerService } from './slots/slot-manager.service';
import { Intent } from './enums/intent.enum';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockSession = (overrides: Partial<BotSession> = {}): BotSession =>
  ({
    id: 'session-uuid-001',
    userId: 'user-test-1',
    lastIntent: null,
    lastMessage: null,
    context: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as BotSession;

const mockSessionRepo = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

const mockIntentRecognizer = {
  recognize: jest.fn(),
};

const mockSlotManager = {
  getAvailableSlots: jest.fn(),
  bookSlot: jest.fn(),
  cancelBooking: jest.fn(),
  getUserBookings: jest.fn(),
  resolveDate: jest.fn().mockReturnValue('2026-05-17'),
};

const mockSlotAvailability = {
  doctorId: 'doctor-uuid-001',
  doctorName: 'Rajesh Kumar',
  specialization: 'skin',
  date: '2026-05-17',
  availableSlots: ['09:00 AM', '10:00 AM', '11:00 AM'],
};

const mockBookingResult = {
  success: true,
  message:
    'Appointment confirmed with Dr. Rajesh Kumar on 2026-05-17 at 09:00 AM.',
  booking: {
    id: 'booking-uuid-001',
    doctorName: 'Dr. Rajesh Kumar',
    date: '2026-05-17',
    time: '09:00 AM',
    status: 'CONFIRMED',
  },
};

// ─── Setup ────────────────────────────────────────────────────────────────────

describe('BotService', () => {
  let service: BotService;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockSessionRepo.create.mockImplementation((dto) => ({
      id: 'session-uuid-new',
      ...dto,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    mockSessionRepo.save.mockImplementation((s) => Promise.resolve(s));
    mockSlotManager.resolveDate.mockReturnValue('2026-05-17');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BotService,
        { provide: getRepositoryToken(BotSession), useValue: mockSessionRepo },
        { provide: IntentRecognizerService, useValue: mockIntentRecognizer },
        { provide: SlotManagerService, useValue: mockSlotManager },
      ],
    }).compile();

    service = module.get<BotService>(BotService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── BOOK APPOINTMENT ───────────────────────────────────────────────────────

  describe('BOOK_APPOINTMENT intent', () => {
    it('should ask for specialization when none provided', async () => {
      mockSessionRepo.findOne.mockResolvedValue(null);
      mockIntentRecognizer.recognize.mockReturnValue({
        intent: Intent.BOOK_APPOINTMENT,
        entities: {},
        confidence: 0.6,
        rawMessage: 'book appointment',
      });

      const result = await service.handleMessage('user-1', 'book appointment');

      expect(result.intent).toBe(Intent.BOOK_APPOINTMENT);
      expect(result.message).toContain('Which type of doctor');
    });

    it('should ask for date when specialization provided but date missing', async () => {
      mockSessionRepo.findOne.mockResolvedValue(
        mockSession({ context: { specialization: 'skin' } }),
      );
      mockIntentRecognizer.recognize.mockReturnValue({
        intent: Intent.BOOK_APPOINTMENT,
        entities: { specialization: 'skin' },
        confidence: 0.7,
        rawMessage: 'I need a skin doctor',
      });

      const result = await service.handleMessage(
        'user-1',
        'I need a skin doctor',
      );

      expect(result.intent).toBe(Intent.BOOK_APPOINTMENT);
      expect(result.message).toContain('Which date');
    });

    it('should ask for time when specialization and date provided but time missing', async () => {
      mockSessionRepo.findOne.mockResolvedValue(
        mockSession({
          lastIntent: Intent.BOOK_APPOINTMENT,
          context: { specialization: 'skin', date: 'tomorrow' },
        }),
      );
      mockIntentRecognizer.recognize.mockReturnValue({
        intent: Intent.UNKNOWN,
        entities: { date: 'tomorrow' },
        confidence: 0,
        rawMessage: 'tomorrow',
      });

      const result = await service.handleMessage('user-1', 'tomorrow');

      expect(result.intent).toBe(Intent.BOOK_APPOINTMENT);
      expect(result.message).toContain('morning');
    });

    it('should confirm booking when all slots are filled', async () => {
      mockSessionRepo.findOne.mockResolvedValue(
        mockSession({
          lastIntent: Intent.BOOK_APPOINTMENT,
          context: {
            specialization: 'skin',
            date: 'tomorrow',
            time: 'morning',
          },
        }),
      );
      mockIntentRecognizer.recognize.mockReturnValue({
        intent: Intent.UNKNOWN,
        entities: { time: 'morning' },
        confidence: 0,
        rawMessage: 'morning',
      });
      mockSlotManager.getAvailableSlots.mockResolvedValue([
        mockSlotAvailability,
      ]);
      mockSlotManager.bookSlot.mockResolvedValue(mockBookingResult);

      const result = await service.handleMessage('user-1', 'morning');

      expect(result.intent).toBe(Intent.BOOK_APPOINTMENT);
      expect(result.message).toContain('Appointment confirmed');
      expect(result.message).toContain('Rajesh Kumar');
      expect(result.data?.bookingId).toBe('booking-uuid-001');
    });

    it('should return no slots message when no availability found', async () => {
      mockSessionRepo.findOne.mockResolvedValue(
        mockSession({
          context: {
            specialization: 'skin',
            date: 'tomorrow',
            time: 'morning',
          },
        }),
      );
      mockIntentRecognizer.recognize.mockReturnValue({
        intent: Intent.BOOK_APPOINTMENT,
        entities: { specialization: 'skin', date: 'tomorrow', time: 'morning' },
        confidence: 0.9,
        rawMessage: 'I need a skin doctor tomorrow morning',
      });
      mockSlotManager.getAvailableSlots.mockResolvedValue([]);

      const result = await service.handleMessage(
        'user-1',
        'I need a skin doctor tomorrow morning',
      );

      expect(result.intent).toBe(Intent.BOOK_APPOINTMENT);
      expect(result.message).toMatch(/no slots found|no.*slots|Sorry/i);
    });

    it('should show alternatives when doctor is fully booked', async () => {
      mockSessionRepo.findOne.mockResolvedValue(
        mockSession({
          context: {
            specialization: 'skin',
            date: 'tomorrow',
            time: 'morning',
          },
        }),
      );
      mockIntentRecognizer.recognize.mockReturnValue({
        intent: Intent.BOOK_APPOINTMENT,
        entities: { specialization: 'skin', date: 'tomorrow', time: 'morning' },
        confidence: 0.9,
        rawMessage: 'I need a skin doctor tomorrow morning',
      });
      mockSlotManager.getAvailableSlots.mockResolvedValue([
        mockSlotAvailability,
      ]);
      mockSlotManager.bookSlot.mockResolvedValue({
        success: false,
        message: 'Sorry, Dr. Rajesh Kumar is fully booked for 2026-05-17.',
        alternatives: [
          {
            doctorId: 'doctor-uuid-002',
            doctorName: 'Sneha Rao',
            specialization: 'skin',
            date: '2026-05-17',
            availableSlots: ['02:00 PM'],
          },
        ],
      });

      const result = await service.handleMessage(
        'user-1',
        'I need a skin doctor tomorrow morning',
      );

      expect(result.intent).toBe(Intent.BOOK_APPOINTMENT);
      expect(result.message).toContain('Alternative slots');
      expect(result.data?.alternatives).toBeDefined();
    });

    it('should persist session after booking', async () => {
      mockSessionRepo.findOne.mockResolvedValue(
        mockSession({
          context: {
            specialization: 'skin',
            date: 'tomorrow',
            time: 'morning',
          },
        }),
      );
      mockIntentRecognizer.recognize.mockReturnValue({
        intent: Intent.BOOK_APPOINTMENT,
        entities: { specialization: 'skin', date: 'tomorrow', time: 'morning' },
        confidence: 0.9,
        rawMessage: 'I need a skin doctor tomorrow morning',
      });
      mockSlotManager.getAvailableSlots.mockResolvedValue([
        mockSlotAvailability,
      ]);
      mockSlotManager.bookSlot.mockResolvedValue(mockBookingResult);

      await service.handleMessage(
        'user-1',
        'I need a skin doctor tomorrow morning',
      );

      expect(mockSessionRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  // ─── MULTI-TURN CONTINUITY ──────────────────────────────────────────────────

  describe('multi-turn session continuity', () => {
    it('should carry specialization context from previous message', async () => {
      // Step 1 — set specialization
      mockSessionRepo.findOne.mockResolvedValue(null);
      mockIntentRecognizer.recognize.mockReturnValue({
        intent: Intent.BOOK_APPOINTMENT,
        entities: { specialization: 'cardiology' },
        confidence: 0.7,
        rawMessage: 'I need a cardiologist',
      });

      const step1 = await service.handleMessage(
        'user-2',
        'I need a cardiologist',
      );
      expect(step1.message).toContain('Which date');

      // Step 2 — provide date
      mockSessionRepo.findOne.mockResolvedValue(
        mockSession({
          lastIntent: Intent.BOOK_APPOINTMENT,
          context: { specialization: 'cardiology' },
        }),
      );
      mockIntentRecognizer.recognize.mockReturnValue({
        intent: Intent.UNKNOWN,
        entities: { date: 'thursday' },
        confidence: 0,
        rawMessage: 'thursday',
      });

      const step2 = await service.handleMessage('user-2', 'thursday');
      expect(step2.intent).toBe(Intent.BOOK_APPOINTMENT);
      expect(step2.message).toContain('morning');

      // Step 3 — provide time → confirm booking
      mockSessionRepo.findOne.mockResolvedValue(
        mockSession({
          lastIntent: Intent.BOOK_APPOINTMENT,
          context: { specialization: 'cardiology', date: 'thursday' },
        }),
      );
      mockIntentRecognizer.recognize.mockReturnValue({
        intent: Intent.UNKNOWN,
        entities: { time: 'morning' },
        confidence: 0,
        rawMessage: 'morning',
      });
      mockSlotManager.getAvailableSlots.mockResolvedValue([
        {
          doctorId: 'doctor-uuid-003',
          doctorName: 'Amit Patel',
          specialization: 'cardiology',
          date: '2026-05-17',
          availableSlots: ['10:00 AM'],
        },
      ]);
      mockSlotManager.bookSlot.mockResolvedValue({
        success: true,
        message:
          'Appointment confirmed with Dr. Amit Patel on 2026-05-17 at 10:00 AM.',
        booking: {
          id: 'booking-uuid-002',
          doctorName: 'Dr. Amit Patel',
          date: '2026-05-17',
          time: '10:00 AM',
          status: 'CONFIRMED',
        },
      });

      const step3 = await service.handleMessage('user-2', 'morning');
      expect(step3.intent).toBe(Intent.BOOK_APPOINTMENT);
      expect(step3.message).toContain('Appointment confirmed');
      expect(step3.message).toContain('Amit Patel');
    });

    it('should create a new session for a new userId', async () => {
      mockSessionRepo.findOne.mockResolvedValue(null);
      mockIntentRecognizer.recognize.mockReturnValue({
        intent: Intent.UNKNOWN,
        entities: {},
        confidence: 0,
        rawMessage: 'hello',
      });

      await service.handleMessage('brand-new-user', 'hello');

      expect(mockSessionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'brand-new-user' }),
      );
    });

    it('should clear booking context after successful booking', async () => {
      mockSessionRepo.findOne.mockResolvedValue(
        mockSession({
          context: {
            specialization: 'skin',
            date: 'tomorrow',
            time: 'morning',
          },
        }),
      );
      mockIntentRecognizer.recognize.mockReturnValue({
        intent: Intent.BOOK_APPOINTMENT,
        entities: { specialization: 'skin', date: 'tomorrow', time: 'morning' },
        confidence: 0.9,
        rawMessage: 'I need a skin doctor tomorrow morning',
      });
      mockSlotManager.getAvailableSlots.mockResolvedValue([
        mockSlotAvailability,
      ]);
      mockSlotManager.bookSlot.mockResolvedValue(mockBookingResult);

      await service.handleMessage(
        'user-1',
        'I need a skin doctor tomorrow morning',
      );

      const savedSession = mockSessionRepo.save.mock.calls[0][0] as BotSession;
      const ctx = savedSession.context as Record<string, unknown>;
      expect(ctx.specialization).toBeUndefined();
      expect(ctx.date).toBeUndefined();
      expect(ctx.time).toBeUndefined();
    });

    it('should clear stale context on topic change', async () => {
      mockSessionRepo.findOne.mockResolvedValue(
        mockSession({
          lastIntent: Intent.BOOK_APPOINTMENT,
          context: { specialization: 'skin', date: 'tomorrow' },
        }),
      );
      mockIntentRecognizer.recognize.mockReturnValue({
        intent: Intent.VIEW_APPOINTMENTS,
        entities: {},
        confidence: 0.6,
        rawMessage: 'show my bookings',
      });
      mockSlotManager.getUserBookings.mockResolvedValue([]);

      const result = await service.handleMessage('user-1', 'show my bookings');

      expect(result.intent).toBe(Intent.VIEW_APPOINTMENTS);
    });
  });

  // ─── CANCEL APPOINTMENT ─────────────────────────────────────────────────────

  describe('CANCEL_APPOINTMENT intent', () => {
    it('should ask for details when no context provided', async () => {
      mockSessionRepo.findOne.mockResolvedValue(mockSession());
      mockIntentRecognizer.recognize.mockReturnValue({
        intent: Intent.CANCEL_APPOINTMENT,
        entities: {},
        confidence: 0.6,
        rawMessage: 'cancel',
      });

      const result = await service.handleMessage('user-1', 'cancel');

      expect(result.intent).toBe(Intent.CANCEL_APPOINTMENT);
      expect(result.message).toContain('Which appointment');
    });

    it('should cancel booking successfully by doctor name', async () => {
      mockSessionRepo.findOne.mockResolvedValue(mockSession());
      mockIntentRecognizer.recognize.mockReturnValue({
        intent: Intent.CANCEL_APPOINTMENT,
        entities: { doctorName: 'Dr. Rajesh' },
        confidence: 0.7,
        rawMessage: 'cancel Dr. Rajesh',
      });
      mockSlotManager.cancelBooking.mockResolvedValue({
        success: true,
        message:
          'Your appointment with Dr. Rajesh Kumar on 2026-05-17 at 09:00 AM has been cancelled.',
      });

      const result = await service.handleMessage('user-1', 'cancel Dr. Rajesh');

      expect(result.intent).toBe(Intent.CANCEL_APPOINTMENT);
      expect(result.message).toContain('cancelled');
      expect(mockSlotManager.cancelBooking).toHaveBeenCalledWith(
        'user-1',
        'Dr. Rajesh',
        undefined,
        undefined,
      );
    });

    it('should return error message when no matching booking found', async () => {
      mockSessionRepo.findOne.mockResolvedValue(mockSession());
      mockIntentRecognizer.recognize.mockReturnValue({
        intent: Intent.CANCEL_APPOINTMENT,
        entities: { doctorName: 'Dr. Nobody' },
        confidence: 0.7,
        rawMessage: 'cancel Dr. Nobody',
      });
      mockSlotManager.cancelBooking.mockResolvedValue({
        success: false,
        message: 'No matching appointment found to cancel.',
      });

      const result = await service.handleMessage('user-1', 'cancel Dr. Nobody');

      expect(result.intent).toBe(Intent.CANCEL_APPOINTMENT);
      expect(result.message).toContain('No matching booking found');
    });
  });

  // ─── VIEW APPOINTMENTS ──────────────────────────────────────────────────────

  describe('VIEW_APPOINTMENTS intent', () => {
    it('should return list of upcoming appointments', async () => {
      mockSessionRepo.findOne.mockResolvedValue(mockSession());
      mockIntentRecognizer.recognize.mockReturnValue({
        intent: Intent.VIEW_APPOINTMENTS,
        entities: {},
        confidence: 0.6,
        rawMessage: 'show my bookings',
      });
      mockSlotManager.getUserBookings.mockResolvedValue([
        {
          id: 'booking-uuid-001',
          doctorName: 'Rajesh Kumar',
          specialization: 'skin',
          date: '2026-05-17',
          time: '09:00 AM',
          status: 'CONFIRMED',
        },
        {
          id: 'booking-uuid-002',
          doctorName: 'Amit Patel',
          specialization: 'cardiology',
          date: '2026-05-18',
          time: '10:00 AM',
          status: 'CONFIRMED',
        },
      ]);

      const result = await service.handleMessage('user-1', 'show my bookings');

      expect(result.intent).toBe(Intent.VIEW_APPOINTMENTS);
      expect(result.message).toContain('Rajesh Kumar');
      expect(result.message).toContain('Amit Patel');
      expect(result.data?.total).toBe(2);
    });

    it('should return empty state message when no bookings exist', async () => {
      mockSessionRepo.findOne.mockResolvedValue(mockSession());
      mockIntentRecognizer.recognize.mockReturnValue({
        intent: Intent.VIEW_APPOINTMENTS,
        entities: {},
        confidence: 0.6,
        rawMessage: 'show my bookings',
      });
      mockSlotManager.getUserBookings.mockResolvedValue([]);

      const result = await service.handleMessage('user-1', 'show my bookings');

      expect(result.intent).toBe(Intent.VIEW_APPOINTMENTS);
      expect(result.message).toContain('no upcoming appointments');
    });

    it('should reflect booking after it is made', async () => {
      mockSessionRepo.findOne.mockResolvedValue(
        mockSession({
          context: {
            specialization: 'skin',
            date: 'tomorrow',
            time: 'morning',
          },
        }),
      );
      mockIntentRecognizer.recognize.mockReturnValue({
        intent: Intent.BOOK_APPOINTMENT,
        entities: { specialization: 'skin', date: 'tomorrow', time: 'morning' },
        confidence: 0.9,
        rawMessage: 'I need a skin doctor tomorrow morning',
      });
      mockSlotManager.getAvailableSlots.mockResolvedValue([
        mockSlotAvailability,
      ]);
      mockSlotManager.bookSlot.mockResolvedValue(mockBookingResult);

      await service.handleMessage(
        'user-1',
        'I need a skin doctor tomorrow morning',
      );

      mockSessionRepo.findOne.mockResolvedValue(mockSession());
      mockIntentRecognizer.recognize.mockReturnValue({
        intent: Intent.VIEW_APPOINTMENTS,
        entities: {},
        confidence: 0.6,
        rawMessage: 'show my bookings',
      });
      mockSlotManager.getUserBookings.mockResolvedValue([
        {
          id: 'booking-uuid-001',
          doctorName: 'Rajesh Kumar',
          specialization: 'skin',
          date: '2026-05-17',
          time: '09:00 AM',
          status: 'CONFIRMED',
        },
      ]);

      const result = await service.handleMessage('user-1', 'show my bookings');

      expect(result.intent).toBe(Intent.VIEW_APPOINTMENTS);
      expect(result.message).toContain('Rajesh Kumar');
      expect(result.data?.total).toBe(1);
    });

    it('should filter out past appointments', async () => {
      mockSessionRepo.findOne.mockResolvedValue(mockSession());
      mockIntentRecognizer.recognize.mockReturnValue({
        intent: Intent.VIEW_APPOINTMENTS,
        entities: {},
        confidence: 0.6,
        rawMessage: 'show my bookings',
      });
      mockSlotManager.getUserBookings.mockResolvedValue([
        {
          id: 'booking-uuid-old',
          doctorName: 'Old Doctor',
          specialization: 'general',
          date: '2026-01-01', // past date
          time: '09:00 AM',
          status: 'CONFIRMED',
        },
        {
          id: 'booking-uuid-future',
          doctorName: 'Rajesh Kumar',
          specialization: 'skin',
          date: '2026-05-18', // future date
          time: '10:00 AM',
          status: 'CONFIRMED',
        },
      ]);

      const result = await service.handleMessage('user-1', 'show my bookings');

      expect(result.intent).toBe(Intent.VIEW_APPOINTMENTS);
      expect(result.message).not.toContain('Old Doctor');
      expect(result.message).toContain('Rajesh Kumar');
      expect(result.data?.total).toBe(1);
    });
  });

  // ─── CHECK AVAILABILITY ─────────────────────────────────────────────────────

  describe('CHECK_AVAILABILITY intent', () => {
    it('should ask for specialization when none provided', async () => {
      mockSessionRepo.findOne.mockResolvedValue(mockSession());
      mockIntentRecognizer.recognize.mockReturnValue({
        intent: Intent.CHECK_AVAILABILITY,
        entities: {},
        confidence: 0.6,
        rawMessage: 'any slots available?',
      });

      const result = await service.handleMessage(
        'user-1',
        'any slots available?',
      );

      expect(result.intent).toBe(Intent.CHECK_AVAILABILITY);
      expect(result.message).toContain('Which doctor or specialization');
    });

    it('should return available slots for a specialization', async () => {
      mockSessionRepo.findOne.mockResolvedValue(mockSession());
      mockIntentRecognizer.recognize.mockReturnValue({
        intent: Intent.CHECK_AVAILABILITY,
        entities: { specialization: 'skin', date: 'tomorrow' },
        confidence: 0.8,
        rawMessage: 'is any skin doctor available tomorrow?',
      });
      mockSlotManager.getAvailableSlots.mockResolvedValue([
        mockSlotAvailability,
      ]);

      const result = await service.handleMessage(
        'user-1',
        'is any skin doctor available tomorrow?',
      );

      expect(result.intent).toBe(Intent.CHECK_AVAILABILITY);
      expect(result.message).toContain('Available slots');
      expect(result.message).toContain('Rajesh Kumar');
      expect(result.data?.totalDoctors).toBe(1);
    });

    it('should return no slots message when nothing available', async () => {
      mockSessionRepo.findOne.mockResolvedValue(mockSession());
      mockIntentRecognizer.recognize.mockReturnValue({
        intent: Intent.CHECK_AVAILABILITY,
        entities: { specialization: 'cardiology', date: 'friday' },
        confidence: 0.8,
        rawMessage: 'is any cardiologist available on friday?',
      });
      mockSlotManager.getAvailableSlots.mockResolvedValue([]);

      const result = await service.handleMessage(
        'user-1',
        'is any cardiologist available on friday?',
      );

      expect(result.intent).toBe(Intent.CHECK_AVAILABILITY);
      expect(result.message).toMatch(/No available slots|No slots found/i);
    });
  });

  // ─── UNKNOWN INTENT ─────────────────────────────────────────────────────────

  describe('UNKNOWN intent', () => {
    it('should return help menu for unrecognized message', async () => {
      mockSessionRepo.findOne.mockResolvedValue(mockSession());
      mockIntentRecognizer.recognize.mockReturnValue({
        intent: Intent.UNKNOWN,
        entities: {},
        confidence: 0,
        rawMessage: 'hello',
      });

      const result = await service.handleMessage('user-1', 'hello');

      expect(result.intent).toBe(Intent.UNKNOWN);
      expect(result.message).toContain('Book');
      expect(result.message).toContain('Cancel');
      expect(result.message).toContain('View');
      expect(result.message).toContain('Check');
    });

    it('should always include sessionId in response', async () => {
      mockSessionRepo.findOne.mockResolvedValue(mockSession());
      mockIntentRecognizer.recognize.mockReturnValue({
        intent: Intent.UNKNOWN,
        entities: {},
        confidence: 0,
        rawMessage: 'random text',
      });

      const result = await service.handleMessage('user-1', 'random text');

      expect(result.sessionId).toBeDefined();
      expect(result.sessionId).toBe('session-uuid-001');
    });
  });

  // ─── FALLBACK HANDLING ──────────────────────────────────────────────────────

  describe('fallback handling', () => {
    it('should suggest alternatives when primary doctor fully booked', async () => {
      mockSessionRepo.findOne.mockResolvedValue(
        mockSession({
          context: {
            specialization: 'skin',
            date: 'tomorrow',
            time: 'morning',
          },
        }),
      );
      mockIntentRecognizer.recognize.mockReturnValue({
        intent: Intent.BOOK_APPOINTMENT,
        entities: { specialization: 'skin', date: 'tomorrow', time: 'morning' },
        confidence: 0.9,
        rawMessage: 'I need a skin doctor tomorrow morning',
      });
      mockSlotManager.getAvailableSlots.mockResolvedValue([
        mockSlotAvailability,
      ]);
      mockSlotManager.bookSlot.mockResolvedValue({
        success: false,
        message: 'Sorry, Dr. Rajesh Kumar is fully booked.',
        alternatives: [
          {
            doctorId: 'doctor-uuid-004',
            doctorName: 'Sneha Rao',
            specialization: 'skin',
            date: '2026-05-17',
            availableSlots: ['11:00 AM'],
          },
        ],
      });

      const result = await service.handleMessage(
        'user-1',
        'I need a skin doctor tomorrow morning',
      );

      expect(result.message).toContain('Alternative slots');
      expect(result.data?.alternatives).toHaveLength(1);
    });

    it('should return failure message when no alternatives exist', async () => {
      mockSessionRepo.findOne.mockResolvedValue(
        mockSession({
          context: {
            specialization: 'skin',
            date: 'tomorrow',
            time: 'morning',
          },
        }),
      );
      mockIntentRecognizer.recognize.mockReturnValue({
        intent: Intent.BOOK_APPOINTMENT,
        entities: { specialization: 'skin', date: 'tomorrow', time: 'morning' },
        confidence: 0.9,
        rawMessage: 'I need a skin doctor tomorrow morning',
      });
      mockSlotManager.getAvailableSlots.mockResolvedValue([
        mockSlotAvailability,
      ]);
      mockSlotManager.bookSlot.mockResolvedValue({
        success: false,
        message: 'Sorry, Dr. Rajesh Kumar is fully booked.',
        alternatives: [],
      });

      const result = await service.handleMessage(
        'user-1',
        'I need a skin doctor tomorrow morning',
      );

      expect(result.intent).toBe(Intent.BOOK_APPOINTMENT);
      expect(result.message).toContain('fully booked');
    });

    it('should handle empty message gracefully', async () => {
      mockSessionRepo.findOne.mockResolvedValue(null);
      mockSessionRepo.create.mockReturnValue(mockSession());

      const result = await service.handleMessage('user-1', '   ');

      expect(result.intent).toBe(Intent.UNKNOWN);
      expect(result.message).toContain('Please send a message');
    });
  });
});
