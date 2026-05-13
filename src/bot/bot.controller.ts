import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { BotService, BotResponse } from './bot.service';
import { BotMessageDto } from './dto/bot-message.dto';

@ApiTags('Bot')
@Controller('bot')
export class BotController {
  constructor(private readonly botService: BotService) {}

  @Post('message')
  @ApiOperation({ summary: 'Send a message to the WhatsApp bot' })
  async handleMessage(@Body() dto: BotMessageDto): Promise<BotResponse> {
    return this.botService.handleMessage(dto.userId, dto.message);
  }
}
