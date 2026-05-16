import { Injectable, Logger } from '@nestjs/common';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { WhatsAppProviderFactory } from 'src/whatsapp/factory/whatsapp-provider.factory';
import { IWhatsAppProvider } from 'src/whatsapp/providers/interfaces/whatsapp-provider.interface';

@Injectable()
export class AppointmentService {
  private readonly logger = new Logger(AppointmentService.name);

  constructor(private readonly providerFactory: WhatsAppProviderFactory) {}

  async createAppointment(payload: CreateAppointmentDto) {
    const provider: IWhatsAppProvider = this.providerFactory.getProvider();

    // ✅ Fix 1: use template flow instead of plain message
    const whatsappResponse = await provider.sendTemplateMessage(
      'appointment_confirmation',
      {
        patientName: payload.patientName,
        doctorName: 'Clinic Doctor', // default since CreateAppointmentDto has no doctorName
        appointmentDate: payload.appointmentDate,
        appointmentTime: '10:00 AM', // default
        hospitalName: 'City Hospital', // default
        phoneNumber: payload.phoneNumber,
      },
    );

    this.logger.log(
      `Appointment created | templateMessageId: ${whatsappResponse.messageId}`,
    );

    return {
      success: true,
      appointment: payload,
      whatsappResponse,
    };
  }
}
