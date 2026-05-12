import { Injectable, Logger } from '@nestjs/common';
import { CreateAppointmentDto } from 'src/appointment/dto/create-appointment.dto';
import { IWhatsAppProvider } from '../interfaces/whatsapp-provider.interface';

@Injectable()
export class MessageBirdProvider implements IWhatsAppProvider {
  private readonly logger = new Logger(MessageBirdProvider.name);

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
      this.logger.error(
        `MessageBird: Invalid phone number format: ${phoneNumber}`,
      );
      throw new Error(`Invalid phone number: ${phoneNumber}`);
    }

    const messageBody = `Hi ${patientName}, your appointment on ${appointmentDate} has been booked. Contact us to reschedule.`;
    const messageId = `mb-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    this.logger.log(
      `MessageBird: Sending appointment message to ${phoneNumber} | messageId: ${messageId}`,
    );
    this.logger.log(`MessageBird: Message body: "${messageBody}"`);

    await new Promise((resolve) => setTimeout(resolve, 80));

    this.logger.log(
      `MessageBird: Message delivered successfully | messageId: ${messageId}`,
    );

    return {
      success: true,
      provider: 'MESSAGE_BIRD',
      messageId,
      to: phoneNumber,
      body: messageBody,
      sentAt: new Date().toISOString(),
    };
  }
}
