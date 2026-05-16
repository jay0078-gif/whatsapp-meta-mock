import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { MessageBirdProvider } from './providers/messagebird/messagebird.provider';
import { MetaProvider } from './providers/meta/meta.provider';
import { MetaModule } from './providers/meta/meta.module';
import { WhatsAppProviderFactory } from './factory/whatsapp-provider.factory';

@Module({
  imports: [MetaModule],
  controllers: [WhatsappController],
  providers: [
    WhatsappService,
    MessageBirdProvider,
    MetaProvider,
    WhatsAppProviderFactory,
  ],
  exports: [WhatsAppProviderFactory],
})
export class WhatsappModule {}
