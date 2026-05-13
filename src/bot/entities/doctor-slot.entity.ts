import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Doctor } from './doctor.entity';

export enum SlotType {
  AVAILABLE = 'AVAILABLE',
  BREAK = 'BREAK',
}

@Entity()
export class DoctorSlot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Doctor, (doctor) => doctor.slots, { onDelete: 'CASCADE' })
  doctor: Doctor;

  @Column()
  time: string;

  @Column({ type: 'enum', enum: SlotType, default: SlotType.AVAILABLE })
  type: SlotType;
}
