import { Module } from '@nestjs/common';

import { ConfigModule } from '@nestjs/config';

import { TypeOrmModule } from '@nestjs/typeorm';

import { AppointmentModule } from './appointment/appointment.module';

import { WhatsappModule } from './whatsapp/whatsapp.module';
import { TemplateModule } from './template/template.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    TypeOrmModule.forRoot({
      type: 'postgres',

      host: process.env.DB_HOST,

      port: Number(process.env.DB_PORT),

      username: process.env.DB_USERNAME,

      password: process.env.DB_PASSWORD,

      database: process.env.DB_DATABASE,

      autoLoadEntities: true,

      synchronize: true,
    }),

    AppointmentModule,

    WhatsappModule,

    TemplateModule,
  ],
})
export class AppModule {}
