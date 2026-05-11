import { Injectable, Logger } from '@nestjs/common';

import { CreateAppointmentDto } from 'src/appointment/dto/create-appointment.dto';

import { IWhatsAppProvider } from '../interfaces/whatsapp-provider.interface';

@Injectable()
export class MetaProvider implements IWhatsAppProvider {
  private readonly logger = new Logger(MetaProvider.name);

  sendAppointmentMessage(payload: CreateAppointmentDto): Promise<{
    success: boolean;
    provider: string;
    messageId: string;
  }> {
    this.logger.log(`Mock Meta message sent to ${payload.phoneNumber}`);

    return Promise.resolve({
      success: true,
      provider: 'META_WHATSAPP',
      messageId: 'meta-mock-id',
    });
  }
}
