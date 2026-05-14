import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BotSession } from './entities/bot-session.entity';
import { IntentRecognizerService } from './intent/intent-recognizer.service';
import {
  SlotManagerService,
  BookingResult,
  SlotAvailability,
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

// Valid specializations the bot supports
const VALID_SPECIALIZATIONS = ['skin', 'general', 'cardiology', 'pediatrics'];

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

    const ctx = (session.context ?? {}) as SessionContext;

    // Merge new entities into existing context
    if (recognized.entities.specialization)
      ctx.specialization = recognized.entities.specialization;
    if (recognized.entities.doctorName)
      ctx.doctorName = recognized.entities.doctorName;
    if (recognized.entities.date) ctx.date = recognized.entities.date;
    if (recognized.entities.time) ctx.time = recognized.entities.time;

    const previousIntent = session.lastIntent;

    session.context = ctx as Record<string, unknown>;
    session.lastMessage = message;

    this.logger.log(
      `previousIntent: ${previousIntent} | ctx: ${JSON.stringify(ctx)}`,
    );

    // ── Any real intent always escapes slot-fill mode ─────────────────────────
    // Only UNKNOWN slot-fill messages ("monday", "morning") stay in the flow
    const isExplicitIntent =
      recognized.intent === Intent.CANCEL_APPOINTMENT ||
      recognized.intent === Intent.VIEW_APPOINTMENTS ||
      recognized.intent === Intent.CHECK_AVAILABILITY ||
      recognized.intent === Intent.BOOK_APPOINTMENT;

    // ── Mid-booking: still missing date or time ───────────────────────────────
    const isAwaitingBookingSlot =
      !isExplicitIntent &&
      previousIntent === Intent.BOOK_APPOINTMENT &&
      !!(ctx.specialization ?? ctx.doctorName) &&
      (!ctx.date || !ctx.time);

    // ── Mid-booking: all slots filled via final slot-fill message → auto-book ─
    const isReadyToBook =
      !isExplicitIntent &&
      previousIntent === Intent.BOOK_APPOINTMENT &&
      !!(ctx.specialization ?? ctx.doctorName) &&
      !!ctx.date &&
      !!ctx.time &&
      recognized.intent === Intent.UNKNOWN;

    // ── Mid-cancel slot fill ──────────────────────────────────────────────────
    const isAwaitingCancelSlot =
      !isExplicitIntent &&
      previousIntent === Intent.CANCEL_APPOINTMENT &&
      !ctx.doctorName &&
      !ctx.date &&
      !ctx.time;

    // Persist correct lastIntent for next turn
    if (isAwaitingBookingSlot || isReadyToBook) {
      session.lastIntent = Intent.BOOK_APPOINTMENT;
    } else if (isAwaitingCancelSlot) {
      session.lastIntent = Intent.CANCEL_APPOINTMENT;
    } else {
      session.lastIntent = recognized.intent;
    }

    let response: BotResponse;

    if (isReadyToBook) {
      this.logger.log(
        `All booking slots filled — auto-routing to handleBookAppointment`,
      );
      response = await this.handleBookAppointment(userId, session, ctx);
    } else if (isAwaitingBookingSlot) {
      this.logger.log(
        `Routing to handleBookAppointment (mid-booking slot fill)`,
      );
      response = await this.handleBookAppointment(userId, session, ctx);
    } else if (isAwaitingCancelSlot) {
      this.logger.log(
        `Routing to handleCancelAppointment (mid-cancel slot fill)`,
      );
      response = await this.handleCancelAppointment(userId, session, ctx);
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

    // ── INVALID SPECIALIZATION CHECK ─────────────────────────────────────────
    // If user gave a specialization but it's not one we support, tell them now
    // instead of silently proceeding and returning "no slots found" later
    if (
      specialization &&
      !VALID_SPECIALIZATIONS.includes(specialization.toLowerCase())
    ) {
      this.clearBookingContext(ctx, session);
      return this.reply(
        session,
        Intent.BOOK_APPOINTMENT,
        `Sorry, I don't recognise the specialization "${specialization}". 😔\n\n` +
          `Available specializations: *Skin*, *General*, *Cardiology*, *Pediatrics*\n\n` +
          `Which would you like?`,
      );
    }

    if (!date) {
      return this.reply(
        session,
        Intent.BOOK_APPOINTMENT,
        `Got it — ${doctorName ?? specialization}. 📅 Which date works for you?\n` +
          `(e.g. "tomorrow", "monday", "today")`,
      );
    }

    // ── PAST DATE CHECK (before hitting the DB) ───────────────────────────────
    const resolvedDate = this.slotManager.resolveDate(date);
    const today = new Date();
    const localToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    const [y, m, d] = resolvedDate.split('-').map(Number);
    const bookingDate = new Date(y, m - 1, d);

    if (bookingDate < localToday) {
      // Clear date so next message can set a valid one
      delete ctx.date;
      session.context = ctx as Record<string, unknown>;
      return this.reply(
        session,
        Intent.BOOK_APPOINTMENT,
        `⚠️ "${date}" is a past date. Please choose today or a future date.\n` +
          `(e.g. "tomorrow", "friday", "today")`,
      );
    }

    if (!time) {
      return this.reply(
        session,
        Intent.BOOK_APPOINTMENT,
        `Great! Do you prefer *morning*, *afternoon*, or *evening*?`,
      );
    }

    // ── FIND AVAILABLE SLOTS ──────────────────────────────────────────────────
    const available = await this.slotManager.getAvailableSlots(
      specialization,
      doctorName,
      date,
      time,
    );

    // ── NO SLOTS FOUND → SUGGEST ALTERNATIVES ────────────────────────────────
    if (!available.length) {
      this.logger.log(
        `No slots found — fetching alternatives for ${specialization ?? doctorName} on ${resolvedDate}`,
      );

      // Re-query without time filter to find any slot that day
      const alternatives = await this.slotManager.getAvailableSlots(
        specialization,
        doctorName,
        date,
        undefined, // no time filter
      );

      if (alternatives.length) {
        this.logger.log(
          `Alternatives found | count: ${alternatives.length} | specialization: ${specialization}`,
        );
        const altText = this.formatAlternatives(alternatives);
        // Clear only time so user can re-pick a different period
        delete ctx.time;
        session.context = ctx as Record<string, unknown>;
        return this.reply(
          session,
          Intent.BOOK_APPOINTMENT,
          `No *${time}* slots available for ${doctorName ?? specialization} on ${resolvedDate}. 😔\n\n` +
            `Here are available alternatives:\n${altText}\n\n` +
            `Would you prefer *morning*, *afternoon*, or *evening*?`,
          { alternatives },
        );
      }

      // No slots at all for this date — suggest different doctors
      const otherDoctors = specialization
        ? await this.slotManager.getAvailableSlots(
            specialization,
            undefined,
            undefined,
            undefined,
          )
        : [];

      this.clearBookingContext(ctx, session);

      if (otherDoctors.length) {
        this.logger.log(
          `Suggesting other doctors | count: ${otherDoctors.length}`,
        );
        const altText = this.formatAlternatives(otherDoctors.slice(0, 3));
        return this.reply(
          session,
          Intent.BOOK_APPOINTMENT,
          `Sorry, no slots found for ${doctorName ?? specialization} on ${resolvedDate}. 😔\n\n` +
            `Here are other available options:\n${altText}`,
          { alternatives: otherDoctors },
        );
      }

      return this.reply(
        session,
        Intent.BOOK_APPOINTMENT,
        `Sorry, no slots found for your request. 😔 Please try a different date or specialization.`,
      );
    }

    // ── BOOK ──────────────────────────────────────────────────────────────────
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
        this.logger.log(
          `Alternatives suggested after bookSlot failure | count: ${result.alternatives.length}`,
        );
        const altText = this.formatAlternatives(result.alternatives);
        return this.reply(
          session,
          Intent.BOOK_APPOINTMENT,
          `${result.message}\n\nAlternative slots:\n${altText}`,
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
        `Which appointment would you like to cancel? 🗓️\n` +
          `Please mention the doctor name, date, or time.\n` +
          `(e.g. "cancel Dr. Sharma on Monday" or "cancel my 5 PM appointment")`,
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
        `❌ No matching booking found. Please check the details and try again.\n\n` +
          `Say "show my bookings" to see your current appointments.`,
      );
    }

    return this.reply(session, Intent.CANCEL_APPOINTMENT, result.message);
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
        `You have no upcoming appointments. 📭\n\nSay "book an appointment" to schedule one!`,
      );
    }

    const list = bookings
      .map(
        (b, i) =>
          `${i + 1}. 👨‍⚕️ ${b.doctorName} (${b.specialization}) — 📅 ${b.date} at 🕐 ${b.time}`,
      )
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
        `Which doctor or specialization would you like to check? 🔍\n` +
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
      // Try without date to show when this doctor IS available
      const anytime = await this.slotManager.getAvailableSlots(
        specialization,
        doctorName,
        undefined,
        undefined,
      );

      if (anytime.length) {
        this.logger.log(
          `No slots on requested date — showing next available | count: ${anytime.length}`,
        );
        const altText = this.formatAlternatives(anytime.slice(0, 3));
        return this.reply(
          session,
          Intent.CHECK_AVAILABILITY,
          `No slots found for ${date ?? 'today'}. But here are the next available options:\n\n${altText}\n\nSay "book" to schedule one!`,
          { alternatives: anytime },
        );
      }

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
          `${i + 1}. 👨‍⚕️ Dr. ${s.doctorName} — 📅 ${s.date} (${s.availableSlots.slice(0, 3).join(', ')}${s.availableSlots.length > 3 ? '...' : ''})`,
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
        `• *Check* — "Is Dr. Patel available on Friday?"\n` +
        `• *Availability* — "Any slots today?"`,
    );
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────────────

  private formatAlternatives(alternatives: SlotAvailability[]): string {
    return alternatives
      .map(
        (a, i) =>
          `${i + 1}. 👨‍⚕️ Dr. ${a.doctorName} (${a.specialization}) — 📅 ${a.date} (${a.availableSlots.slice(0, 3).join(', ')}${a.availableSlots.length > 3 ? '...' : ''})`,
      )
      .join('\n');
  }

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
