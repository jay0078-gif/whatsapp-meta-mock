import { Injectable, Logger } from '@nestjs/common';

import { CreateAppointmentDto } from 'src/appointment/dto/create-appointment.dto';

import { IWhatsAppProvider } from '../interfaces/whatsapp-provider.interface';

@Injectable()
export class MessageBirdProvider implements IWhatsAppProvider {
  private readonly logger = new Logger(MessageBirdProvider.name);

  sendAppointmentMessage(payload: CreateAppointmentDto): Promise<{
    success: boolean;
    provider: string;
    messageId: string;
  }> {
    this.logger.log(`Mock MessageBird message sent to ${payload.phoneNumber}`);

    return Promise.resolve({
      success: true,
      provider: 'MESSAGE_BIRD',
      messageId: 'messagebird-mock-id',
    });
  }
}
