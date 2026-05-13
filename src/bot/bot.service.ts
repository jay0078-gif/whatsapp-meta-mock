import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BotSession } from './entities/bot-session.entity';
import { IntentRecognizerService } from './intent/intent-recognizer.service';
import {
  SlotManagerService,
  BookingResult,
} from './slots/slot-manager.service';
import { Intent } from './enums/intent.enum';

export interface BotResponse {
  message: string;
  sessionId: string;
  intent: Intent;
  data?: Record<string, unknown>;
}

interface SessionContext {
  specialization?: string;
  doctorName?: string;
  doctorId?: string;
  patientName?: string;
  date?: string;
  time?: string;
}

interface UserBooking {
  id: string;
  doctorName: string;
  specialization: string;
  date: string;
  time: string;
  status: string;
}

@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);

  constructor(
    @InjectRepository(BotSession)
    private readonly sessionRepo: Repository<BotSession>,
    private readonly intentRecognizer: IntentRecognizerService,
    private readonly slotManager: SlotManagerService,
  ) {}

  async handleMessage(userId: string, message: string): Promise<BotResponse> {
    this.logger.log(`Incoming message from userId=${userId}: "${message}"`);

    let session = await this.sessionRepo.findOne({ where: { userId } });
    if (!session) {
      session = this.sessionRepo.create({ userId, context: {} });
      this.logger.log(`New session created for userId=${userId}`);
    }

    const recognized = this.intentRecognizer.recognize(message);
    this.logger.log(
      `Intent: ${recognized.intent} | confidence: ${recognized.confidence} | entities: ${JSON.stringify(recognized.entities)}`,
    );

    // Merge any newly extracted entities into session context
    const ctx = (session.context ?? {}) as SessionContext;
    if (recognized.entities.specialization)
      ctx.specialization = recognized.entities.specialization;
    if (recognized.entities.doctorName)
      ctx.doctorName = recognized.entities.doctorName;
    if (recognized.entities.date) ctx.date = recognized.entities.date;
    if (recognized.entities.time) ctx.time = recognized.entities.time;

    // Read previous intent BEFORE overwriting so we can detect mid-booking state
    const previousIntent = session.lastIntent as Intent | null;

    session.context = ctx as Record<string, unknown>;
    session.lastIntent = recognized.intent;
    session.lastMessage = message;

    this.logger.log(
      `previousIntent: ${previousIntent ?? 'none'} | ctx: ${JSON.stringify(ctx)}`,
    );

    // Determine if we're mid-booking and the user is answering a slot question.
    // Two conditions trigger this:
    //   1. Previous intent was BOOK_APPOINTMENT and we still have missing slots
    //   2. Current message looks like a short slot-answer (e.g. "tomorrow", "morning")
    const midBooking =
      previousIntent === Intent.BOOK_APPOINTMENT &&
      !!(ctx.specialization ?? ctx.doctorName) &&
      (!ctx.date || !ctx.time);

    const isSlotAnswer = this.intentRecognizer.isSlotResponse(message);

    const routeToBooking =
      midBooking || (isSlotAnswer && !!(ctx.specialization ?? ctx.doctorName));

    let response: BotResponse;

    if (routeToBooking) {
      this.logger.log(
        `Routing to handleBookAppointment (mid-booking slot fill)`,
      );
      response = await this.handleBookAppointment(userId, session, ctx);
    } else {
      switch (recognized.intent) {
        case Intent.BOOK_APPOINTMENT:
          response = await this.handleBookAppointment(userId, session, ctx);
          break;
        case Intent.CANCEL_APPOINTMENT:
          response = await this.handleCancelAppointment(userId, session, ctx);
          break;
        case Intent.VIEW_APPOINTMENTS:
          response = await this.handleViewAppointments(userId, session);
          break;
        case Intent.CHECK_AVAILABILITY:
          response = await this.handleCheckAvailability(session, ctx);
          break;
        default:
          response = this.handleUnknown(session);
      }
    }

    await this.sessionRepo.save(session);
    return response;
  }

  // ─── BOOK APPOINTMENT ────────────────────────────────────────────────────────

  private async handleBookAppointment(
    userId: string,
    session: BotSession,
    ctx: SessionContext,
  ): Promise<BotResponse> {
    const { specialization, doctorName, date, time } = ctx;

    if (!specialization && !doctorName) {
      return this.reply(
        session,
        Intent.BOOK_APPOINTMENT,
        `Sure! I can help you book an appointment. 🏥\n` +
          `Which type of doctor are you looking for?\n` +
          `Available: *Skin*, *General*, *Cardiology*, *Pediatrics*`,
      );
    }

    if (!date) {
      return this.reply(
        session,
        Intent.BOOK_APPOINTMENT,
        `Got it — ${doctorName ?? specialization}. 📅 Which date works for you?\n` +
          `(e.g. "tomorrow", "Monday", or "today")`,
      );
    }

    if (!time) {
      return this.reply(
        session,
        Intent.BOOK_APPOINTMENT,
        `Great! Do you prefer *morning*, *afternoon*, or *evening*?`,
      );
    }

    const available = await this.slotManager.getAvailableSlots(
      specialization,
      doctorName,
      date,
      time,
    );

    if (!available.length) {
      this.clearBookingContext(ctx, session);
      return this.reply(
        session,
        Intent.BOOK_APPOINTMENT,
        `Sorry, no slots found for your request. 😔 Please try a different date or specialization.`,
      );
    }

    const pick = available[0];
    const slotTime = pick.availableSlots[0];
    const patientName = ctx.patientName ?? userId;

    const result: BookingResult = await this.slotManager.bookSlot(
      userId,
      patientName,
      pick.doctorId,
      pick.date,
      slotTime,
    );

    this.clearBookingContext(ctx, session);

    if (!result.success) {
      if (result.alternatives?.length) {
        const altList = result.alternatives
          .map(
            (a, i) =>
              `${i + 1}. Dr. ${a.doctorName} — ${a.date} (${a.availableSlots[0]})`,
          )
          .join('\n');
        return this.reply(
          session,
          Intent.BOOK_APPOINTMENT,
          `${result.message}\n\nAlternative slots:\n${altList}`,
          { alternatives: result.alternatives },
        );
      }
      return this.reply(session, Intent.BOOK_APPOINTMENT, result.message);
    }

    this.logger.log(
      `Booking confirmed: bookingId=${result.booking!.id} userId=${userId}`,
    );

    return this.reply(
      session,
      Intent.BOOK_APPOINTMENT,
      `✅ Appointment confirmed!\n\n` +
        `👨‍⚕️ Doctor: ${result.booking!.doctorName}\n` +
        `📅 Date: ${result.booking!.date}\n` +
        `🕐 Time: ${result.booking!.time}\n` +
        `🆔 Booking ID: ${result.booking!.id}\n\n` +
        `You'll receive a WhatsApp confirmation shortly.`,
      { bookingId: result.booking!.id },
    );
  }

  // ─── CANCEL APPOINTMENT ───────────────────────────────────────────────────────

  private async handleCancelAppointment(
    userId: string,
    session: BotSession,
    ctx: SessionContext,
  ): Promise<BotResponse> {
    const { doctorName, date, time } = ctx;

    if (!doctorName && !date && !time) {
      return this.reply(
        session,
        Intent.CANCEL_APPOINTMENT,
        `Which appointment would you like to cancel?\n` +
          `Please mention the doctor name, date, or time.\n` +
          `(e.g. "cancel Dr. Sharma on Monday")`,
      );
    }

    const result: BookingResult = await this.slotManager.cancelBooking(
      userId,
      doctorName,
      time,
      date,
    );

    this.clearBookingContext(ctx, session);

    if (!result.success) {
      return this.reply(
        session,
        Intent.CANCEL_APPOINTMENT,
        `❌ No matching booking found. Please check the details and try again.`,
      );
    }

    return this.reply(
      session,
      Intent.CANCEL_APPOINTMENT,
      `✅ ${result.message}`,
    );
  }

  // ─── VIEW APPOINTMENTS ────────────────────────────────────────────────────────

  private async handleViewAppointments(
    userId: string,
    session: BotSession,
  ): Promise<BotResponse> {
    const bookings = (await this.slotManager.getUserBookings(
      userId,
    )) as UserBooking[];

    if (!bookings.length) {
      return this.reply(
        session,
        Intent.VIEW_APPOINTMENTS,
        `You have no upcoming appointments. Say "book an appointment" to schedule one!`,
      );
    }

    const list = bookings
      .map((b, i) => `${i + 1}. Dr. ${b.doctorName} — ${b.date} at ${b.time}`)
      .join('\n');

    return this.reply(
      session,
      Intent.VIEW_APPOINTMENTS,
      `📋 Your upcoming appointments:\n\n${list}`,
      { total: bookings.length },
    );
  }

  // ─── CHECK AVAILABILITY ───────────────────────────────────────────────────────

  private async handleCheckAvailability(
    session: BotSession,
    ctx: SessionContext,
  ): Promise<BotResponse> {
    const { specialization, doctorName, date, time } = ctx;

    if (!specialization && !doctorName) {
      return this.reply(
        session,
        Intent.CHECK_AVAILABILITY,
        `Which doctor or specialization would you like to check?\n` +
          `Available: *Skin*, *General*, *Cardiology*, *Pediatrics*`,
      );
    }

    const slots = await this.slotManager.getAvailableSlots(
      specialization,
      doctorName,
      date,
      time,
    );

    if (!slots.length) {
      return this.reply(
        session,
        Intent.CHECK_AVAILABILITY,
        `No available slots found. Try a different date or specialization.`,
      );
    }

    const slotList = slots
      .slice(0, 5)
      .map(
        (s, i) =>
          `${i + 1}. Dr. ${s.doctorName} — ${s.date} (${s.availableSlots.join(', ')})`,
      )
      .join('\n');

    return this.reply(
      session,
      Intent.CHECK_AVAILABILITY,
      `✅ Available slots:\n\n${slotList}` +
        (slots.length > 5 ? `\n\n...and ${slots.length - 5} more.` : '') +
        `\n\nSay "book" to schedule one!`,
      { totalDoctors: slots.length },
    );
  }

  // ─── UNKNOWN ──────────────────────────────────────────────────────────────────

  private handleUnknown(session: BotSession): BotResponse {
    return this.reply(
      session,
      Intent.UNKNOWN,
      `I didn't quite understand that. 🤔\n\nHere's what I can help with:\n` +
        `• *Book* — "I need a skin doctor tomorrow morning"\n` +
        `• *Cancel* — "Cancel my appointment with Dr. Sharma"\n` +
        `• *View* — "Show my bookings"\n` +
        `• *Check* — "Is Dr. Patel available on Friday?"`,
    );
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────────────

  private reply(
    session: BotSession,
    intent: Intent,
    message: string,
    data?: Record<string, unknown>,
  ): BotResponse {
    return { message, sessionId: session.id, intent, ...(data && { data }) };
  }

  private clearBookingContext(ctx: SessionContext, session: BotSession): void {
    delete ctx.specialization;
    delete ctx.doctorName;
    delete ctx.doctorId;
    delete ctx.date;
    delete ctx.time;
    session.context = ctx as Record<string, unknown>;
  }
}
