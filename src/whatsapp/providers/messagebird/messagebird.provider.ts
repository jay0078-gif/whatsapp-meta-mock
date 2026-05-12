import { Injectable, Logger } from '@nestjs/common';
import { CreateAppointmentDto } from 'src/appointment/dto/create-appointment.dto';
import {
  ITemplateMessageResponse,
  ITemplatePayload,
  IWhatsAppProvider,
} from '../interfaces/whatsapp-provider.interface';

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
      this.logger.error(`MessageBird: Invalid phone number: ${phoneNumber}`);
      throw new Error(`Invalid phone number: ${phoneNumber}`);
    }

    const messageBody = `Hi ${patientName}, your appointment on ${appointmentDate} has been booked. Contact us to reschedule.`;
    const messageId = `mb-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    this.logger.log(
      `MessageBird: Sending message to ${phoneNumber} | messageId: ${messageId}`,
    );
    await new Promise((resolve) => setTimeout(resolve, 80));

    return {
      success: true,
      provider: 'MESSAGE_BIRD',
      messageId,
      to: phoneNumber,
      body: messageBody,
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
      this.logger.error(`MessageBird: Invalid phone number: ${phoneNumber}`);
      throw new Error(`Invalid phone number: ${phoneNumber}`);
    }

    const messageId = `mb-tmpl-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    const templateBodies: Record<string, string> = {
      appointment_confirmation: `Hi ${patientName}, your appointment with ${doctorName} at ${hospitalName} is confirmed for ${appointmentDate} at ${appointmentTime}.`,
      appointment_reminder: `Hi ${patientName}, reminder for your appointment with ${doctorName} at ${hospitalName} on ${appointmentDate} at ${appointmentTime}.`,
      appointment_cancellation: `Hi ${patientName}, your appointment with ${doctorName} at ${hospitalName} on ${appointmentDate} at ${appointmentTime} has been cancelled.`,
    };

    this.logger.log(
      `MessageBird: Sending template "${templateName}" to ${phoneNumber} | messageId: ${messageId}`,
    );
    await new Promise((resolve) => setTimeout(resolve, 80));

    return {
      success: true,
      provider: 'MESSAGE_BIRD',
      messageId,
      to: phoneNumber,
      templateName,
      status: 'SENT',
      sentAt: new Date().toISOString(),
    };
  }
}
