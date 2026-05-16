import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum TemplateStatus {
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
}

export enum TemplateType {
  CONFIRMATION = 'appointment_confirmation',
  REMINDER = 'appointment_reminder',
  CANCELLATION = 'appointment_cancellation',
}

@Entity()
export class TemplateMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  messageId: string;

  @Column()
  provider: string;

  @Column({ type: 'enum', enum: TemplateType })
  templateName: TemplateType;

  @Column()
  patientName: string;

  @Column()
  doctorName: string;

  @Column()
  hospitalName: string;

  @Column()
  appointmentDate: string;

  @Column()
  appointmentTime: string;

  @Column()
  phoneNumber: string;

  @Column({ type: 'enum', enum: TemplateStatus, default: TemplateStatus.SENT })
  status: TemplateStatus;

  @Column({ nullable: true })
  failureReason: string;

  @Column({ default: 0 })
  retryCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
