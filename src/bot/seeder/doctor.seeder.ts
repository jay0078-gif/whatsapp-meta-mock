import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Doctor } from '../entities/doctor.entity';
import { DoctorSlot, SlotType } from '../entities/doctor-slot.entity';

@Injectable()
export class DoctorSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(DoctorSeeder.name);

  constructor(
    @InjectRepository(Doctor)
    private readonly doctorRepo: Repository<Doctor>,
    @InjectRepository(DoctorSlot)
    private readonly slotRepo: Repository<DoctorSlot>,
  ) {}

  async onApplicationBootstrap() {
    const count = await this.doctorRepo.count();
    if (count > 0) {
      this.logger.log('Doctors already seeded — skipping');
      return;
    }

    this.logger.log('Seeding doctors and slots...');

    const doctorsData = [
      {
        name: 'Dr. Rajesh Kumar',
        specialization: 'skin',
        availableDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        slotDurationMinutes: 30,
        dailyBookingLimit: 10,
        availableSlots: [
          '09:00 AM',
          '10:00 AM',
          '11:00 AM',
          '02:00 PM',
          '03:00 PM',
          '04:00 PM',
          '05:00 PM',
        ],
        breakSlots: ['01:00 PM'],
      },
      {
        name: 'Dr. Priya Sharma',
        specialization: 'general',
        availableDays: ['monday', 'wednesday', 'friday', 'saturday'],
        slotDurationMinutes: 20,
        dailyBookingLimit: 15,
        availableSlots: [
          '08:00 AM',
          '09:00 AM',
          '10:00 AM',
          '11:00 AM',
          '04:00 PM',
          '05:00 PM',
          '06:00 PM',
        ],
        breakSlots: ['12:00 PM'],
      },
      {
        name: 'Dr. Amit Patel',
        specialization: 'cardiology',
        availableDays: ['tuesday', 'thursday', 'saturday'],
        slotDurationMinutes: 45,
        dailyBookingLimit: 8,
        availableSlots: [
          '10:00 AM',
          '11:00 AM',
          '12:00 PM',
          '03:00 PM',
          '04:00 PM',
        ],
        breakSlots: ['01:00 PM', '02:00 PM'],
      },
      {
        name: 'Dr. Sneha Rao',
        specialization: 'pediatrics',
        availableDays: [
          'monday',
          'tuesday',
          'wednesday',
          'thursday',
          'friday',
          'saturday',
        ],
        slotDurationMinutes: 30,
        dailyBookingLimit: 12,
        availableSlots: [
          '09:00 AM',
          '10:00 AM',
          '11:00 AM',
          '02:00 PM',
          '03:00 PM',
          '04:00 PM',
        ],
        breakSlots: ['12:00 PM', '01:00 PM'],
      },
    ];

    for (const data of doctorsData) {
      const doctor = this.doctorRepo.create({
        name: data.name,
        specialization: data.specialization,
        availableDays: data.availableDays,
        slotDurationMinutes: data.slotDurationMinutes,
        dailyBookingLimit: data.dailyBookingLimit,
        isActive: true,
      });

      const savedDoctor = await this.doctorRepo.save(doctor);

      const slots: DoctorSlot[] = [];

      for (const time of data.availableSlots) {
        const slot = this.slotRepo.create({
          doctor: savedDoctor,
          time,
          type: SlotType.AVAILABLE,
        });
        slots.push(slot);
      }

      for (const time of data.breakSlots) {
        const slot = this.slotRepo.create({
          doctor: savedDoctor,
          time,
          type: SlotType.BREAK,
        });
        slots.push(slot);
      }

      await this.slotRepo.save(slots);
      this.logger.log(`Seeded ${data.name} with ${slots.length} slots`);
    }

    this.logger.log('Doctor seeding complete');
  }
}
