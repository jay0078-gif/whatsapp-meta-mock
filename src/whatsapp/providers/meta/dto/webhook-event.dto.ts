import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class WebhookTextDto {
  @ApiProperty({ example: 'Appointment Confirmed for 2026-05-15' })
  @IsString()
  body: string;
}

export class WebhookMessageDto {
  @ApiProperty({ example: '919999999999' })
  @IsString()
  from: string;

  @ApiProperty({ example: 'wamid.mock-message-id-001' })
  @IsString()
  id: string;

  @ApiProperty({ example: 'text' })
  @IsString()
  type: string;

  @ApiProperty({ type: () => WebhookTextDto })
  @IsObject()
  @ValidateNested()
  @Type(() => WebhookTextDto)
  text: WebhookTextDto;
}

export class WebhookMetadataDto {
  @ApiProperty({ example: 'mock-display-phone-number' })
  @IsString()
  display_phone_number: string;

  @ApiProperty({ example: 'mock-phone-number-id' })
  @IsString()
  phone_number_id: string;
}

export class WebhookValueDto {
  @ApiProperty({ example: 'whatsapp' })
  @IsString()
  messaging_product: string;

  @ApiProperty({ type: () => WebhookMetadataDto })
  @IsObject()
  @ValidateNested()
  @Type(() => WebhookMetadataDto)
  metadata: WebhookMetadataDto;

  @ApiProperty({ type: () => [WebhookMessageDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WebhookMessageDto)
  messages: WebhookMessageDto[];
}

export class WebhookChangeDto {
  @ApiProperty({ type: () => WebhookValueDto })
  @IsObject()
  @ValidateNested()
  @Type(() => WebhookValueDto)
  value: WebhookValueDto;

  @ApiProperty({ example: 'messages' })
  @IsString()
  field: string;
}

export class WebhookEntryDto {
  @ApiProperty({ example: 'mock-business-account-id' })
  @IsString()
  id: string;

  @ApiProperty({ type: () => [WebhookChangeDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WebhookChangeDto)
  changes: WebhookChangeDto[];
}

export class WebhookEventDto {
  @ApiProperty({ example: 'whatsapp_business_account' })
  @IsString()
  object: string;

  @ApiProperty({ type: () => [WebhookEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WebhookEntryDto)
  entry: WebhookEntryDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  simulate?: 'success' | 'failure';
}
