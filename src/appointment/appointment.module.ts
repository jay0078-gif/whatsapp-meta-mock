import { Module } from '@nestjs/common';

import { AppointmentController } from './appointment.controller';

import { AppointmentService } from './appointment.service';

import { WhatsappModule } from 'src/whatsapp/whatsapp.module';

@Module({
  imports: [WhatsappModule],

  controllers: [AppointmentController],

  providers: [AppointmentService],
})
export class AppointmentModule {}
