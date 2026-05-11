import { Module } from '@nestjs/common';

import { WhatsappService } from './whatsapp.service';

import { WhatsappController } from './whatsapp.controller';

import { MessageBirdProvider } from './providers/messagebird/messagebird.provider';

import { MetaProvider } from './providers/meta/meta.provider';
import { MetaController } from './providers/meta/meta.controller';
import { MetaService } from './providers/meta/meta.service';

import { WhatsAppProviderFactory } from './factory/whatsapp-provider.factory';

@Module({
  controllers: [WhatsappController, MetaController],

  providers: [
    WhatsappService,

    MessageBirdProvider,

    MetaProvider,

    MetaService,

    WhatsAppProviderFactory,
  ],

  exports: [WhatsAppProviderFactory],
})
export class WhatsappModule {}
