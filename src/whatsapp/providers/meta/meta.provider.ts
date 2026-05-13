import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { CreateAppointmentDto } from 'src/appointment/dto/create-appointment.dto';
import {
  ITemplateMessageResponse,
  ITemplatePayload,
  IWhatsAppProvider,
} from '../interfaces/whatsapp-provider.interface';

@Injectable()
export class MetaProvider implements IWhatsAppProvider {
  private readonly logger = new Logger(MetaProvider.name);

  async sendAppointmentMessage(payload: CreateAppointmentDto): Promise<{
    success: boolean;
    provider: string;
    messageId: string;
    to: string;
    body: string;
    sentAt: string;
  }> {
    const { patientName, phoneNumber, appointmentDate } = payload;

    if (!phoneNumber || phoneNumber.length < 10) {
      throw new Error(`Invalid phone number: ${phoneNumber}`);
    }

    const messageId = `meta-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const body = `Hello ${patientName}, your appointment is confirmed for ${appointmentDate}.`;

    this.logger.log(
      `Meta: Sending message to ${phoneNumber} | messageId: ${messageId}`,
    );
    await new Promise((resolve) => setTimeout(resolve, 80));

    return {
      success: true,
      provider: 'META_WHATSAPP',
      messageId,
      to: phoneNumber,
      body,
      sentAt: new Date().toISOString(),
    };
  }

  async sendTemplateMessage(
    templateName:
      | 'appointment_confirmation'
      | 'appointment_reminder'
      | 'appointment_cancellation',
    payload: ITemplatePayload,
  ): Promise<ITemplateMessageResponse> {
    const {
      patientName,
      doctorName,
      appointmentDate,
      appointmentTime,
      hospitalName,
      phoneNumber,
    } = payload;

    if (!phoneNumber || phoneNumber.length < 10) {
      throw new Error(`Invalid phone number: ${phoneNumber}`);
    }

    const messageId = `meta-tmpl-${crypto.randomUUID()}`;

    // ✅ Fix 2 & 3: Real Meta Cloud API template payload structure
    const metaPayload = {
      messaging_product: 'whatsapp',
      to: phoneNumber,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en_US' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: patientName },
              { type: 'text', text: doctorName },
              { type: 'text', text: appointmentDate },
              { type: 'text', text: appointmentTime },
              { type: 'text', text: hospitalName },
            ],
          },
        ],
      },
    };

    this.logger.log(
      `Meta: Sending template "${templateName}" to ${phoneNumber}`,
    );
    this.logger.log(`Meta: Payload → ${JSON.stringify(metaPayload)}`);

    await new Promise((resolve) => setTimeout(resolve, 80));

    return {
      success: true,
      provider: 'META_WHATSAPP',
      messageId,
      to: phoneNumber,
      templateName,
      status: 'SENT',
      sentAt: new Date().toISOString(),
      metaPayload, // return actual payload so it's visible in response
    };
  }
}
