import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { TemplateService } from './template.service';
import { SendTemplateDto } from './dto/send-template.dto';
import { WebhookDeliveryEventDto } from './dto/webhook-delivery-event.dto';

@ApiTags('templates')
@Controller('templates')
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  @Post('confirmation')
  @ApiOperation({ summary: 'Send appointment confirmation template' })
  @ApiBody({ type: SendTemplateDto })
  sendConfirmation(@Body() dto: SendTemplateDto) {
    return this.templateService.sendConfirmation(dto);
  }

  @Post('reminder')
  @ApiOperation({ summary: 'Send appointment reminder template' })
  @ApiBody({ type: SendTemplateDto })
  sendReminder(@Body() dto: SendTemplateDto) {
    return this.templateService.sendReminder(dto);
  }

  @Post('cancellation')
  @ApiOperation({ summary: 'Send appointment cancellation template' })
  @ApiBody({ type: SendTemplateDto })
  sendCancellation(@Body() dto: SendTemplateDto) {
    return this.templateService.sendCancellation(dto);
  }

  @Post('webhook/delivery')
  @ApiOperation({ summary: 'Simulate template delivery status webhook event' })
  @ApiBody({ type: WebhookDeliveryEventDto })
  handleDeliveryEvent(@Body() event: WebhookDeliveryEventDto) {
    return this.templateService.handleDeliveryEvent(event);
  }

  @Get('status/:messageId')
  @ApiOperation({ summary: 'Get template message delivery status' })
  @ApiParam({ name: 'messageId', example: 'meta-tmpl-abc-123' })
  getStatus(@Param('messageId') messageId: string) {
    return this.templateService.getStatus(messageId);
  }
}
