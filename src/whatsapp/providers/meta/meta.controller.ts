import { Body, Controller, Get, Post, Query, Headers } from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiProperty,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { MetaService } from './meta.service';
import { WebhookEventDto } from './dto/webhook-event.dto';

export class StartSignupDto {
  @ApiProperty({
    example: 'mock-business-123',
    description: 'Business ID to onboard',
  })
  @IsString()
  @IsNotEmpty()
  businessId: string;

  @ApiProperty({ example: 'Test Clinic', description: 'Business name' })
  @IsString()
  @IsNotEmpty()
  businessName: string;

  @ApiProperty({
    example: '919999999999',
    description: 'WhatsApp phone number to link',
  })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;
}

export class SignupCallbackDto {
  @ApiProperty({
    example: false,
    description: 'Set to true to simulate a signup failure',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  fail?: boolean;

  @ApiProperty({
    example: 'ACCESS_DENIED',
    description: 'Error code returned on failure',
    required: false,
    enum: ['ACCESS_DENIED', 'USER_DENIED', 'TOKEN_EXPIRED', 'INVALID_SCOPE'],
  })
  @IsOptional()
  @IsEnum(['ACCESS_DENIED', 'USER_DENIED', 'TOKEN_EXPIRED', 'INVALID_SCOPE'])
  errorCode?: string;
}

@ApiTags('meta')
@Controller('meta')
export class MetaController {
  constructor(private readonly metaService: MetaService) {}

  @Post('signup/start')
  @ApiOperation({
    summary: 'Start mock Meta Embedded Signup flow',
    description:
      'Simulates initiating Meta Embedded Signup for a business. Returns a mock signup URL and state token.',
  })
  @ApiBody({ type: StartSignupDto })
  startSignup(@Body() body: StartSignupDto) {
    return this.metaService.startSignup(body);
  }

  @Post('signup/callback')
  @ApiOperation({
    summary: 'Mock Meta signup callback',
    description:
      'Simulates the callback after business completes Meta onboarding. Set fail=true to simulate failure.',
  })
  @ApiBody({ type: SignupCallbackDto })
  signupCallback(@Body() body: SignupCallbackDto) {
    return this.metaService.signupCallback(body);
  }

  @Get('webhook')
  @ApiOperation({
    summary: 'Mock Meta webhook verification',
    description:
      'Simulates Meta webhook verification handshake. Use mock_verify_token as the verify token.',
  })
  @ApiQuery({ name: 'hub.mode', required: true, example: 'subscribe' })
  @ApiQuery({
    name: 'hub.verify_token',
    required: true,
    example: 'mock_verify_token',
  })
  @ApiQuery({
    name: 'hub.challenge',
    required: true,
    example: 'challenge-abc-123',
  })
  verifyWebhook(@Query() query: Record<string, string>) {
    return this.metaService.verifyWebhook(query);
  }

  @Post('webhook')
  @ApiOperation({
    summary: 'Mock Meta webhook event',
    description:
      'Simulates receiving an incoming WhatsApp message webhook from Meta.',
  })
  @ApiBody({ type: WebhookEventDto })
  handleWebhook(
    @Body() payload: WebhookEventDto,
    @Headers('x-hub-signature-256') signature: string,
  ) {
    return this.metaService.handleWebhook(payload, signature);
  }
}
