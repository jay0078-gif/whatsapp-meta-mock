import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { TemplateStatus } from '../entities/template-message.entity';

export class WebhookDeliveryEventDto {
  @ApiProperty({ example: 'meta-tmpl-abc-123' })
  @IsString()
  @IsNotEmpty()
  messageId: string;

  @ApiProperty({ enum: TemplateStatus, example: TemplateStatus.DELIVERED })
  @IsEnum(TemplateStatus)
  status: TemplateStatus;

  @ApiProperty({ example: 'Network timeout', required: false })
  @IsOptional()
  @IsString()
  failureReason?: string;
}
