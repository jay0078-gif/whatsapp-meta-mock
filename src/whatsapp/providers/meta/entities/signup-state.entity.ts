import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity()
export class SignupState {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  state: string;

  @Column()
  businessId: string;

  @Column()
  businessName: string;

  @Column()
  phoneNumber: string;

  @Column()
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
