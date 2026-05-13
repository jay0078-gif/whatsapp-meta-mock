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

  async getAvailableSlots(
    specialization?: string,
    doctorName?: string,
    date?: string,
    time?: string,
  ): Promise<SlotAvailability[]> {
    const resolvedDate = this.resolveDate(date ?? 'today');
    const dayName = this.getDayName(resolvedDate);

    this.logger.log(
      `Checking slots | specialization: ${specialization} | date: ${resolvedDate} | day: ${dayName}`,
    );

    let query = this.doctorRepo
      .createQueryBuilder('doctor')
      .leftJoinAndSelect('doctor.slots', 'slot')
      .where('doctor.isActive = :active', { active: true })
      .andWhere('doctor.availableDays LIKE :day', { day: `%${dayName}%` });

    if (specialization) {
      query = query.andWhere('LOWER(doctor.specialization) = LOWER(:spec)', {
        spec: specialization,
      });
    }

    if (doctorName) {
      query = query.andWhere('LOWER(doctor.name) LIKE LOWER(:name)', {
        name: `%${doctorName}%`,
      });
    }

    const doctors = await query.getMany();

    if (!doctors.length) {
      this.logger.warn(
        `No doctors found for specialization: ${specialization} on ${dayName}`,
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
        .filter((slot) => slot.type === SlotType.AVAILABLE)
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

  async bookSlot(
    userId: string,
    patientName: string,
    doctorId: string,
    date: string,
    time: string,
  ): Promise<BookingResult> {
    const resolvedDate = this.resolveDate(date);

    // Past date check
    if (new Date(resolvedDate) < new Date(new Date().toDateString())) {
      this.logger.warn(`Attempted booking for past date: ${resolvedDate}`);
      return {
        success: false,
        message: `Cannot book appointments for past dates. Please choose a future date.`,
      };
    }

    const doctor = await this.doctorRepo.findOne({
      where: { id: doctorId },
      relations: ['slots'],
    });

    if (!doctor) {
      return { success: false, message: `Doctor not found.` };
    }

    // Duplicate booking check
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
        `Duplicate booking attempt | userId: ${userId} | doctor: ${doctor.name} | ${resolvedDate} ${time}`,
      );
      return {
        success: false,
        message: `You already have an appointment with ${doctor.name} on ${resolvedDate} at ${time}.`,
      };
    }

    // Daily limit check
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
      return {
        success: false,
        message: `Sorry, ${doctor.name} is fully booked for ${resolvedDate}.`,
        alternatives,
      };
    }

    // Slot availability check
    const isSlotAvailable = doctor.slots.some(
      (s) => s.time === time && s.type === SlotType.AVAILABLE,
    );

    if (!isSlotAvailable) {
      return {
        success: false,
        message: `The slot ${time} is not available for ${doctor.name}.`,
      };
    }

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
      query.andWhere('LOWER(doctor.name) LIKE LOWER(:name)', {
        name: `%${doctorName}%`,
      });
    }

    if (time) {
      query.andWhere('booking.time = :time', { time });
    }

    if (date) {
      query.andWhere('booking.date = :date', { date: this.resolveDate(date) });
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
      message: `Your appointment with ${booking.doctor.name} on ${booking.date} at ${booking.time} has been cancelled.`,
    };
  }

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

  private async findAlternatives(
    specialization: string,
    date: string,
  ): Promise<SlotAvailability[]> {
    this.logger.log(
      `Finding alternative slots for ${specialization} on ${date}`,
    );
    return this.getAvailableSlots(specialization, undefined, date);
  }

  resolveDate(input: string): string {
    const today = new Date();
    if (input === 'today' || input === 'now' || input === 'asap') {
      return today.toISOString().split('T')[0];
    }
    if (
      input === 'tomorrow' ||
      input === 'tmrw' ||
      input === 'tmr' ||
      input === 'next day'
    ) {
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      return tomorrow.toISOString().split('T')[0];
    }
    if (input === 'weekend' || input === 'saturday') {
      const sat = new Date(today);
      sat.setDate(today.getDate() + ((6 - today.getDay()) % 7 || 7));
      return sat.toISOString().split('T')[0];
    }
    return today.toISOString().split('T')[0];
  }

  private getDayName(date: string): string {
    return new Date(date)
      .toLocaleDateString('en-US', { weekday: 'long' })
      .toLowerCase();
  }

  private matchesTimePeriod(slotTime: string, period: string): boolean {
    const hour = parseInt(slotTime.split(':')[0]);
    const isPM = slotTime.toLowerCase().includes('pm');
    const hour24 = isPM && hour !== 12 ? hour + 12 : hour;

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
