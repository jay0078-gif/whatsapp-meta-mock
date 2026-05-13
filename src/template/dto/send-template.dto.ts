import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, Matches } from 'class-validator';

export enum TemplateType {
  CONFIRMATION = 'appointment_confirmation',
  REMINDER = 'appointment_reminder',
  CANCELLATION = 'appointment_cancellation',
}

export class SendTemplateDto {
  @ApiProperty({ enum: TemplateType, example: TemplateType.CONFIRMATION })
  @IsEnum(TemplateType)
  templateName: TemplateType;

  @ApiProperty({ example: 'Jay Patel' })
  @IsString()
  @IsNotEmpty()
  patientName: string;

  @ApiProperty({ example: 'Dr. Sharma' })
  @IsString()
  @IsNotEmpty()
  doctorName: string;

  @ApiProperty({ example: '2026-05-15' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'appointmentDate must be YYYY-MM-DD',
  })
  appointmentDate: string;

  @ApiProperty({ example: '10:30 AM' })
  @IsString()
  @IsNotEmpty()
  appointmentTime: string;

  @ApiProperty({ example: 'City Hospital' })
  @IsString()
  @IsNotEmpty()
  hospitalName: string;

  @ApiProperty({ example: '919999999999' })
  @IsString()
  @Matches(/^\d{10,15}$/, {
    message: 'phoneNumber must be 10-15 digits',
  })
  phoneNumber: string;
}
