import { ApiProperty } from '@nestjs/swagger';

export class WebhookEventDto {
  @ApiProperty({
    example: 'message_received',
  })
  event: string;

  @ApiProperty({
    example: '919999999999',
  })
  from: string;

  @ApiProperty({
    example: 'Appointment Confirmed',
  })
  message: string;
}
