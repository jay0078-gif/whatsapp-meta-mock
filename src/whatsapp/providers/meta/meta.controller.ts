import { Body, Controller, Get, Post, Query } from '@nestjs/common';

import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { MetaService } from './meta.service';

import { ApiQuery } from '@nestjs/swagger';

import { WebhookEventDto } from './dto/webhook-event.dto';

import { ApiBody } from '@nestjs/swagger';

@ApiTags('meta')
@Controller('meta')
export class MetaController {
  constructor(private readonly metaService: MetaService) {}

  @Post('signup/start')
  @ApiOperation({
    summary: 'Start mock Meta Embedded Signup flow',
  })
  startSignup() {
    return this.metaService.startSignup();
  }

  @Post('signup/callback')
  @ApiOperation({
    summary: 'Mock Meta signup callback',
  })
  signupCallback(
    @Body()
    body: {
      fail?: boolean;
    },
  ) {
    return this.metaService.signupCallback(body);
  }

  @Get('webhook')
  @ApiOperation({
    summary: 'Mock Meta webhook verification',
  })
  @ApiQuery({
    name: 'hub.verify_token',
    required: true,
    example: 'mock_verify_token',
  })
  @ApiQuery({
    name: 'hub.challenge',
    required: true,
    example: '12345',
  })
  verifyWebhook(
    @Query()
    query: Record<string, string>,
  ) {
    return this.metaService.verifyWebhook(query);
  }

  @Post('webhook')
  @ApiOperation({
    summary: 'Mock Meta webhook event',
  })
  @ApiBody({
    type: WebhookEventDto,
  })
  handleWebhook(
    @Body()
    payload: WebhookEventDto,
  ) {
    return this.metaService.handleWebhook(payload);
  }
}
