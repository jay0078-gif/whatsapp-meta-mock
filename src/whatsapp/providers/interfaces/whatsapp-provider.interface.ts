export interface ITemplatePayload {
  patientName: string;
  doctorName: string;
  appointmentDate: string;
  appointmentTime: string;
  hospitalName: string;
  phoneNumber: string;
}

export interface ITemplateMessageResponse {
  success: boolean;
  provider: string;
  messageId: string;
  to: string;
  templateName: string;
  status: 'SENT' | 'DELIVERED' | 'FAILED';
  sentAt: string;
}

export interface IWhatsAppProvider {
  sendAppointmentMessage(payload: any): Promise<any>;
  sendTemplateMessage(
    templateName:
      | 'appointment_confirmation'
      | 'appointment_reminder'
      | 'appointment_cancellation',
    payload: ITemplatePayload,
  ): Promise<ITemplateMessageResponse>;
}
