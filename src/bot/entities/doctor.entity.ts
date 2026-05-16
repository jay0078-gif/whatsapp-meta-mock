/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DoctorSlot } from './doctor-slot.entity';
import { Booking } from './booking.entity';

@Entity()
export class Doctor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  specialization: string;

  @Column('simple-array')
  availableDays: string[];

  @Column({ default: 30 })
  slotDurationMinutes: number;

  @Column({ default: 10 })
  dailyBookingLimit: number;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => DoctorSlot, (slot) => slot.doctor, { cascade: true })
  slots: DoctorSlot[];

  @OneToMany(() => Booking, (booking) => booking.doctor)
  bookings: Booking[];

  @CreateDateColumn()
  createdAt: Date;
}
