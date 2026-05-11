export interface IWhatsAppProvider {
  sendAppointmentMessage(payload: any): Promise<any>;
}
