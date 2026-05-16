import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BotController } from './bot.controller';
import { BotService } from './bot.service';
import { IntentRecognizerService } from './intent/intent-recognizer.service';
import { SlotManagerService } from './slots/slot-manager.service';
import { Doctor } from './entities/doctor.entity';
import { DoctorSlot } from './entities/doctor-slot.entity';
import { Booking } from './entities/booking.entity';
import { BotSession } from './entities/bot-session.entity';
import { DoctorSeeder } from './seeder/doctor.seeder';

@Module({
  imports: [
    TypeOrmModule.forFeature([Doctor, DoctorSlot, Booking, BotSession]),
  ],
  controllers: [BotController],
  providers: [
    BotService,
    IntentRecognizerService,
    SlotManagerService,
    DoctorSeeder,
  ],
})
export class BotModule {}
