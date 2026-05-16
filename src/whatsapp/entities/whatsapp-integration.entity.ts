import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class WhatsAppIntegration {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  provider: string;

  @Column()
  businessId: string;

  @Column()
  phoneNumberId: string;

  @Column()
  wabaId: string;

  @Column()
  accessToken: string;
}
