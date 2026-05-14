import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Doctor } from '../entities/doctor.entity';
import { DoctorSlot, SlotType } from '../entities/doctor-slot.entity';
import { Booking, BookingStatus } from '../entities/booking.entity';

export interface SlotAvailability {
  doctorId: string;
  doctorName: string;
  specialization: string;
  date: string;
  availableSlots: string[];
}

export interface BookingResult {
  success: boolean;
  message: string;
  booking?: {
    id: string;
    doctorName: string;
    date: string;
    time: string;
    status: string;
  };
  alternatives?: SlotAvailability[];
}

@Injectable()
export class SlotManagerService {
  private readonly logger = new Logger(SlotManagerService.name);

  constructor(
    @InjectRepository(Doctor)
    private readonly doctorRepo: Repository<Doctor>,
    @InjectRepository(DoctorSlot)
    private readonly slotRepo: Repository<DoctorSlot>,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
  ) {}

  // ─── GET AVAILABLE SLOTS ─────────────────────────────────────────────────────
 async getAvailableSlots(
    specialization?: string,
    doctorName?: string,
    date?: string,
    time?: string,
  ): Promise<SlotAvailability[]> {
    // ── RESOLVE SPECIALIZATION FROM DOCTOR NAME (DB lookup, no hardcoding) ───
    if (doctorName && !specialization) {
      const namePart = doctorName.replace(/^dr\.?\s*/i, '').trim();
      const doctor = await this.doctorRepo
        .createQueryBuilder('doctor')
        .where('LOWER(doctor.name) LIKE LOWER(:name)', {
          name: `%${namePart}%`,
        })
        .getOne();
      if (doctor) {
        specialization = doctor.specialization;
        this.logger.log(
          `Resolved specialization from doctor name | "${doctorName}" → "${specialization}"`,
        );
      }
    }

    const resolvedDate = this.resolveDate(date ?? 'today');
    const dayName = this.getDayName(resolvedDate);

    this.logger.log(
      `Checking slots | specialization: ${specialization} | date: ${resolvedDate} | day: ${dayName}`,
    );

    let query = this.doctorRepo
      .createQueryBuilder('doctor')
      .leftJoinAndSelect('doctor.slots', 'slot')
      .where('doctor.isActive = :active', { active: true })
      .andWhere('LOWER(doctor.availableDays) LIKE :day', {
        day: `%${dayName}%`,
      });

    if (specialization) {
      query = query.andWhere('LOWER(doctor.specialization) = LOWER(:spec)', {
        spec: specialization,
      });
    }

    if (doctorName) {
      // Strip "Dr." prefix for matching so "Dr. rajesh" → "rajesh" still matches
      const namePart = doctorName.replace(/^dr\.?\s*/i, '').trim();
      query = query.andWhere('LOWER(doctor.name) LIKE LOWER(:name)', {
        name: `%${namePart}%`,
      });
    }

    const doctors = await query.getMany();

    if (!doctors.length) {
      this.logger.warn(
        `No doctors found | specialization: ${specialization} | day: ${dayName}`,
      );
      return [];
    }

    const results: SlotAvailability[] = [];

    for (const doctor of doctors) {
      const bookingsToday = await this.bookingRepo.count({
        where: {
          doctor: { id: doctor.id },
          date: resolvedDate,
          status: BookingStatus.CONFIRMED,
        },
      });

      if (bookingsToday >= doctor.dailyBookingLimit) {
        this.logger.warn(`${doctor.name} is fully booked for ${resolvedDate}`);
        continue;
      }

      const bookedTimes = await this.bookingRepo.find({
        where: {
          doctor: { id: doctor.id },
          date: resolvedDate,
          status: BookingStatus.CONFIRMED,
        },
        select: ['time'],
      });

      const bookedTimeSet = new Set(bookedTimes.map((b) => b.time));

      const availableSlots = doctor.slots
        .filter((slot) => slot.type === SlotType.AVAILABLE) // skip BREAK slots
        .filter((slot) => !bookedTimeSet.has(slot.time))
        .filter((slot) =>
          time ? this.matchesTimePeriod(slot.time, time) : true,
        )
        .map((slot) => slot.time)
        .sort();

      if (availableSlots.length > 0) {
        results.push({
          doctorId: doctor.id,
          doctorName: doctor.name,
          specialization: doctor.specialization,
          date: resolvedDate,
          availableSlots,
        });
      }
    }

    this.logger.log(`Found ${results.length} doctors with available slots`);
    return results;
  }

  // ─── BOOK SLOT ───────────────────────────────────────────────────────────────
  async bookSlot(
    userId: string,
    patientName: string,
    doctorId: string,
    date: string,
    time: string,
  ): Promise<BookingResult> {
    const resolvedDate = this.resolveDate(date);

    // ── PAST DATE GUARD ───────────────────────────────────────────────────────
    const today = new Date();
    const localToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    const [y, m, d] = resolvedDate.split('-').map(Number);
    const bookingDate = new Date(y, m - 1, d);

    if (bookingDate < localToday) {
      this.logger.warn(
        `Past date booking attempt | date: ${resolvedDate} | userId: ${userId}`,
      );
      return {
        success: false,
        message: `❌ Cannot book appointments for past dates. "${resolvedDate}" has already passed. Please choose today or a future date.`,
      };
    }

    const doctor = await this.doctorRepo.findOne({
      where: { id: doctorId },
      relations: ['slots'],
    });

    if (!doctor) {
      return { success: false, message: `Doctor not found.` };
    }

    // ── DUPLICATE BOOKING GUARD ───────────────────────────────────────────────
    const duplicate = await this.bookingRepo.findOne({
      where: {
        userId,
        doctor: { id: doctorId },
        date: resolvedDate,
        time,
        status: BookingStatus.CONFIRMED,
      },
    });

    if (duplicate) {
      this.logger.warn(
        `Duplicate booking blocked | userId: ${userId} | doctor: ${doctor.name} | ${resolvedDate} ${time}`,
      );
      return {
        success: false,
        message: `⚠️ You already have an appointment with ${doctor.name} on ${resolvedDate} at ${time}. No duplicate booking created.`,
      };
    }

    // ── DAILY LIMIT CHECK ─────────────────────────────────────────────────────
    const bookingsToday = await this.bookingRepo.count({
      where: {
        doctor: { id: doctorId },
        date: resolvedDate,
        status: BookingStatus.CONFIRMED,
      },
    });

    if (bookingsToday >= doctor.dailyBookingLimit) {
      this.logger.warn(
        `${doctor.name} fully booked for ${resolvedDate} — finding alternatives`,
      );
      const alternatives = await this.findAlternatives(
        doctor.specialization,
        resolvedDate,
      );

      if (alternatives.length) {
        this.logger.log(
          `Alternatives found | count: ${alternatives.length} | for: ${doctor.specialization} on ${resolvedDate}`,
        );
      } else {
        this.logger.warn(
          `No alternatives found for ${doctor.specialization} on ${resolvedDate}`,
        );
      }

      return {
        success: false,
        message: `Sorry, ${doctor.name} is fully booked for ${resolvedDate}.`,
        alternatives,
      };
    }

    // ── SLOT AVAILABILITY CHECK ───────────────────────────────────────────────
    const isSlotAvailable = doctor.slots.some(
      (s) => s.time === time && s.type === SlotType.AVAILABLE,
    );

    if (!isSlotAvailable) {
      // Slot is either a break slot or doesn't exist
      const alternatives = await this.findAlternatives(
        doctor.specialization,
        resolvedDate,
      );
      this.logger.warn(
        `Slot ${time} unavailable for ${doctor.name} — finding alternatives`,
      );

      if (alternatives.length) {
        this.logger.log(
          `Alternatives found | count: ${alternatives.length} | for: ${doctor.specialization} on ${resolvedDate}`,
        );
      }

      return {
        success: false,
        message: `The slot ${time} is not available for ${doctor.name} (it may be a break or already booked).`,
        alternatives,
      };
    }

    // ── CONFIRM BOOKING ───────────────────────────────────────────────────────
    const booking = this.bookingRepo.create({
      userId,
      patientName,
      doctor,
      date: resolvedDate,
      time,
      status: BookingStatus.CONFIRMED,
    });

    const saved = await this.bookingRepo.save(booking);
    this.logger.log(
      `Booking confirmed | id: ${saved.id} | ${doctor.name} | ${resolvedDate} ${time}`,
    );

    return {
      success: true,
      message: `Appointment confirmed with ${doctor.name} on ${resolvedDate} at ${time}.`,
      booking: {
        id: saved.id,
        doctorName: doctor.name,
        date: resolvedDate,
        time,
        status: BookingStatus.CONFIRMED,
      },
    };
  }

  // ─── CANCEL BOOKING ──────────────────────────────────────────────────────────
  async cancelBooking(
    userId: string,
    doctorName?: string,
    time?: string,
    date?: string,
  ): Promise<BookingResult> {
    const query = this.bookingRepo
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.doctor', 'doctor')
      .where('booking.userId = :userId', { userId })
      .andWhere('booking.status = :status', {
        status: BookingStatus.CONFIRMED,
      });

    if (doctorName) {
      // Strip "Dr." prefix for flexible matching
      const namePart = doctorName.replace(/^dr\.?\s*/i, '').trim();
      query.andWhere('LOWER(doctor.name) LIKE LOWER(:name)', {
        name: `%${namePart}%`,
      });
    }

    // ── TIME-BASED CANCEL: "cancel my 5 PM appointment" ──────────────────────
    // time entity comes in as "5 PM" (specific) or "evening" (period)
    if (time) {
      const isPeriod = ['morning', 'afternoon', 'evening'].includes(
        time.toLowerCase(),
      );
      if (isPeriod) {
        // For period-based cancel, fetch candidates and filter in JS
        // (SQL can't call matchesTimePeriod)
        const candidates = await query.getMany();
        const match = candidates.find((b) =>
          this.matchesTimePeriod(b.time, time),
        );

        if (!match) {
          this.logger.warn(
            `No booking found to cancel | userId: ${userId} | time period: ${time}`,
          );
          return {
            success: false,
            message: `No matching appointment found to cancel.`,
          };
        }

        match.status = BookingStatus.CANCELLED;
        await this.bookingRepo.save(match);
        this.logger.log(
          `Booking cancelled | id: ${match.id} | time period match: ${time}`,
        );
        return {
          success: true,
          message: `✅ Your appointment with ${match.doctor.name} on ${match.date} at ${match.time} has been cancelled.`,
        };
      } else {
        // Specific time like "5 PM", "09:00 AM"
        query.andWhere('LOWER(booking.time) = LOWER(:time)', { time });
      }
    }

    // ── DATE FILTER (only for non-today specific dates) ───────────────────────
    if (date) {
      const resolved = this.resolveDate(date);
      const today = this.resolveDate('today');
      if (resolved !== today) {
        query.andWhere('booking.date = :date', { date: resolved });
      }
    }

    const booking = await query.getOne();

    if (!booking) {
      this.logger.warn(`No booking found to cancel | userId: ${userId}`);
      return {
        success: false,
        message: `No matching appointment found to cancel.`,
      };
    }

    booking.status = BookingStatus.CANCELLED;
    await this.bookingRepo.save(booking);
    this.logger.log(`Booking cancelled | id: ${booking.id}`);

    return {
      success: true,
      message: `✅ Your appointment with ${booking.doctor.name} on ${booking.date} at ${booking.time} has been cancelled.`,
    };
  }

  // ─── VIEW USER BOOKINGS ───────────────────────────────────────────────────────
  async getUserBookings(userId: string): Promise<any[]> {
    const bookings = await this.bookingRepo.find({
      where: { userId, status: BookingStatus.CONFIRMED },
      relations: ['doctor'],
      order: { createdAt: 'DESC' },
    });

    return bookings.map((b) => ({
      id: b.id,
      doctorName: b.doctor.name,
      specialization: b.doctor.specialization,
      date: b.date,
      time: b.time,
      status: b.status,
    }));
  }

  // ─── FIND ALTERNATIVES ────────────────────────────────────────────────────────
  // Called when primary slot is unavailable — returns same specialization,
  // same date but WITHOUT time filter so any available slot qualifies.
  private async findAlternatives(
    specialization: string,
    date: string,
  ): Promise<SlotAvailability[]> {
    this.logger.log(
      `Finding alternative slots | specialization: ${specialization} | date: ${date}`,
    );
    const results = await this.getAvailableSlots(
      specialization,
      undefined,
      date,
      undefined,
    );
    this.logger.log(
      `Alternative search result | count: ${results.length} | specialization: ${specialization}`,
    );
    return results;
  }

  // ─── RESOLVE DATE ─────────────────────────────────────────────────────────────
  resolveDate(input: string): string {
    const today = new Date();
    const localToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );

    const fmt = (d: Date): string => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    if (!input || ['today', 'now', 'asap'].includes(input.toLowerCase())) {
      return fmt(localToday);
    }

    if (
      ['tomorrow', 'tmrw', 'tmr', 'next day', 'tomorow', 'tomrrow'].includes(
        input.toLowerCase(),
      )
    ) {
      const tomorrow = new Date(localToday);
      tomorrow.setDate(localToday.getDate() + 1);
      return fmt(tomorrow);
    }

    const weekdays: Record<string, number> = {
      sunday: 0,
      sun: 0,
      monday: 1,
      mon: 1,
      tuesday: 2,
      tue: 2,
      tues: 2,
      wednesday: 3,
      wed: 3,
      thursday: 4,
      thu: 4,
      thurs: 4,
      friday: 5,
      fri: 5,
      saturday: 6,
      sat: 6,
    };

    const targetDay = weekdays[input.toLowerCase()];
    if (targetDay !== undefined) {
      const result = new Date(localToday);
      const currentDay = localToday.getDay();
      const daysUntil = (targetDay - currentDay + 7) % 7 || 7;
      result.setDate(localToday.getDate() + daysUntil);
      return fmt(result);
    }

    // ── Named month dates: "may 1st", "may 15", "15 may", "1st may" ──────────
    const monthNames: Record<string, number> = {
      jan: 0,
      feb: 1,
      mar: 2,
      apr: 3,
      may: 4,
      jun: 5,
      jul: 6,
      aug: 7,
      sep: 8,
      oct: 9,
      nov: 10,
      dec: 11,
    };
    const monthFirst = input.match(
      /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(st|nd|rd|th)?/i,
    );
    const dayFirst = input.match(
      /(\d{1,2})(st|nd|rd|th)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
    );
    const mf = monthFirst || dayFirst;
    if (mf) {
      const isMonthFirst = monthFirst !== null;
      const monthStr = isMonthFirst ? mf[1] : mf[3];
      const dayNum = isMonthFirst ? parseInt(mf[2]) : parseInt(mf[1]);
      const monthNum = monthNames[monthStr.toLowerCase().slice(0, 3)];
      const year = today.getFullYear();
      const parsed = new Date(year, monthNum, dayNum);
      // If the date has already passed this year, assume next year
      if (parsed < localToday) parsed.setFullYear(year + 1);
      return fmt(parsed);
    }

    // Explicit ISO date e.g. "2026-05-20"
    const parts = input.split('-');
    if (parts.length === 3) {
      const parsed = new Date(
        parseInt(parts[0]),
        parseInt(parts[1]) - 1,
        parseInt(parts[2]),
      );
      if (!isNaN(parsed.getTime())) return fmt(parsed);
    }

    return fmt(localToday);
  }

  // ─── GET DAY NAME ─────────────────────────────────────────────────────────────
  // Parses as LOCAL midnight — avoids IST UTC off-by-one bug
  private getDayName(date: string): string {
    const [year, month, day] = date.split('-').map(Number);
    const localDate = new Date(year, month - 1, day);
    return localDate
      .toLocaleDateString('en-US', { weekday: 'long' })
      .toLowerCase();
  }

  // ─── MATCH TIME PERIOD ────────────────────────────────────────────────────────
  // Handles "09:00 AM" (12h), "09:00" (24h), and period names
  matchesTimePeriod(slotTime: string, period: string): boolean {
    const lower = slotTime.toLowerCase();
    const isPM = lower.includes('pm');
    const isAM = lower.includes('am');
    const hour = parseInt(slotTime.split(':')[0]);

    let hour24: number;
    if (isPM && hour !== 12) {
      hour24 = hour + 12;
    } else if (isAM && hour === 12) {
      hour24 = 0;
    } else {
      hour24 = hour;
    }

    switch (period.toLowerCase()) {
      case 'morning':
        return hour24 >= 8 && hour24 < 12;
      case 'afternoon':
        return hour24 >= 12 && hour24 < 17;
      case 'evening':
        return hour24 >= 17 && hour24 <= 20;
      default:
        return true;
    }
  }
}
