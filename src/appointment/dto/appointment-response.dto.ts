import { CreateAppointmentDto } from './create-appointment.dto';

export class AppointmentResponseDto {
  success: boolean;

  appointment: CreateAppointmentDto;

  whatsappResponse: {
    success: boolean;
    provider: string;
    messageId: string;
  };
}
