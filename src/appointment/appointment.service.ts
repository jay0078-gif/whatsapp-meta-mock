import { Injectable } from '@nestjs/common';

import { CreateAppointmentDto } from './dto/create-appointment.dto';

import { AppointmentResponseDto } from './dto/appointment-response.dto';

import { WhatsAppProviderFactory } from 'src/whatsapp/factory/whatsapp-provider.factory';

import { IWhatsAppProvider } from 'src/whatsapp/providers/interfaces/whatsapp-provider.interface';

@Injectable()
export class AppointmentService {
  constructor(private readonly providerFactory: WhatsAppProviderFactory) {}

  async createAppointment(
    payload: CreateAppointmentDto,
  ): Promise<AppointmentResponseDto> {
    const provider: IWhatsAppProvider = this.providerFactory.getProvider();

    const whatsappResponse: Awaited<
      ReturnType<IWhatsAppProvider['sendAppointmentMessage']>
    > = await provider.sendAppointmentMessage(payload);

    return {
      success: true,
      appointment: payload,
      whatsappResponse,
    };
  }
}
