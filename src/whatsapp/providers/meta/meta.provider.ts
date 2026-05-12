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
      this.logger.error(`Meta: Invalid phone number: ${phoneNumber}`);
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
      this.logger.error(`Meta: Invalid phone number: ${phoneNumber}`);
      throw new Error(`Invalid phone number: ${phoneNumber}`);
    }

    const messageId = `meta-tmpl-${crypto.randomUUID()}`;

    const templateBodies: Record<string, string> = {
      appointment_confirmation: `Hello ${patientName}, your appointment with ${doctorName} at ${hospitalName} is confirmed for ${appointmentDate} at ${appointmentTime}.`,
      appointment_reminder: `Reminder: ${patientName}, you have an appointment with ${doctorName} at ${hospitalName} tomorrow ${appointmentDate} at ${appointmentTime}.`,
      appointment_cancellation: `Dear ${patientName}, your appointment with ${doctorName} at ${hospitalName} on ${appointmentDate} at ${appointmentTime} has been cancelled.`,
    };

    this.logger.log(
      `Meta: Sending template "${templateName}" to ${phoneNumber} | messageId: ${messageId}`,
    );
    await new Promise((resolve) => setTimeout(resolve, 80));

    return {
      success: true,
      provider: 'META_WHATSAPP',
      messageId,
      to: phoneNumber,
      templateName,
      status: 'SENT',
      sentAt: new Date().toISOString(),
    };
  }
}
