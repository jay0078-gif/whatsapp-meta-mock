import { Injectable } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { WhatsAppProvider } from '../enums/whatsapp-provider.enum';

import { IWhatsAppProvider } from '../providers/interfaces/whatsapp-provider.interface';

import { MessageBirdProvider } from '../providers/messagebird/messagebird.provider';

import { MetaProvider } from '../providers/meta/meta.provider';

@Injectable()
export class WhatsAppProviderFactory {
  constructor(
    private readonly configService: ConfigService,

    private readonly messageBirdProvider: MessageBirdProvider,

    private readonly metaProvider: MetaProvider,
  ) {}

  getProvider(): IWhatsAppProvider {
    const provider =
      (this.configService.get<string>(
        'WHATSAPP_PROVIDER',
      ) as WhatsAppProvider) ?? WhatsAppProvider.MESSAGE_BIRD;

    switch (provider) {
      case WhatsAppProvider.META_WHATSAPP:
        return this.metaProvider;
      case WhatsAppProvider.MESSAGE_BIRD:
      default:
        return this.messageBirdProvider;
    }
  }

  getFallbackProvider(): IWhatsAppProvider {
    const provider =
      (this.configService.get<string>(
        'WHATSAPP_PROVIDER',
      ) as WhatsAppProvider) ?? WhatsAppProvider.MESSAGE_BIRD;

    // fallback is always the opposite of primary
    switch (provider) {
      case WhatsAppProvider.META_WHATSAPP:
        return this.messageBirdProvider;
      case WhatsAppProvider.MESSAGE_BIRD:
      default:
        return this.metaProvider;
    }
  }

  
}
