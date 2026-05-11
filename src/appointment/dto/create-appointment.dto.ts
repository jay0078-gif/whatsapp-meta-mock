import { IsNotEmpty, IsString } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class CreateAppointmentDto {
  @ApiProperty({
    example: 'Jay Patel',
  })
  @IsString()
  @IsNotEmpty()
  patientName: string;

  @ApiProperty({
    example: '919999999999',
  })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({
    example: '2026-05-15',
  })
  @IsString()
  @IsNotEmpty()
  appointmentDate: string;
}
