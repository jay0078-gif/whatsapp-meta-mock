import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { WebhookEventDto } from './dto/webhook-event.dto';
import { SignupState } from './entities/signup-state.entity';

@Injectable()
export class MetaService {
  private readonly logger = new Logger(MetaService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(SignupState)
    private readonly signupStateRepo: Repository<SignupState>,
  ) {}

  async startSignup(body?: {
    businessId?: string;
    businessName?: string;
    phoneNumber?: string;
  }) {
    this.logger.log(
      `Starting mock Meta Embedded Signup flow for business: ${body?.businessName ?? 'unknown'}`,
    );

    // ✅ Fix 1: crypto-random state, not Date.now()
    const state = `mock-state-${crypto.randomUUID()}`;

    // ✅ Fix 2: persist state to Postgres
    const record = this.signupStateRepo.create({
      state,
      businessId: body?.businessId ?? 'mock-biz-001',
      businessName: body?.businessName ?? 'Mock Business',
      phoneNumber: body?.phoneNumber ?? 'mock-phone',
      expiresAt: new Date(Date.now() + 600_000), // 10 minutes
    });
    await this.signupStateRepo.save(record);

    return {
      success: true,
      signupUrl: `https://www.facebook.com/dialog/oauth?mock=true&state=${state}&business_id=${body?.businessId ?? 'mock-biz'}`,
      state,
      businessId: record.businessId,
      businessName: record.businessName,
      phoneNumber: record.phoneNumber,
      expiresIn: 600,
      instructions:
        'Redirect the business user to signupUrl to begin onboarding.',
    };
  }

  signupCallback(body?: { fail?: boolean; errorCode?: string }) {
    this.logger.log('Processing mock signup callback');

    if (body?.fail === true) {
      const errorCode = body.errorCode ?? 'ACCESS_DENIED';
      this.logger.error(
        `Mock signup failure simulated | errorCode: ${errorCode}`,
      );
      throw new BadRequestException({
        success: false,
        errorCode,
        message:
          'Mock Meta signup failed — business user declined or an error occurred.',
      });
    }

    const businessId = `mock-biz-${crypto.randomUUID()}`;
    const phoneNumberId = `mock-ph-${crypto.randomUUID()}`;
    const accessToken = `EAAMock${crypto.randomBytes(12).toString('hex').toUpperCase()}`;

    this.logger.log(`Signup successful | businessId: ${businessId}`);

    return {
      success: true,
      businessId,
      phoneNumberId,
      accessToken,
      tokenType: 'bearer',
      grantedScopes: [
        'whatsapp_business_messaging',
        'whatsapp_business_management',
      ],
    };
  }

  verifyWebhook(query: Record<string, string>) {
    this.logger.log('Verifying Meta webhook');

    const mode = query['hub.mode'];
    const verifyToken = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode !== 'subscribe') {
      this.logger.error(
        `Webhook verification failed: invalid hub.mode "${mode}"`,
      );
      throw new BadRequestException('hub.mode must be "subscribe"');
    }

    // ✅ Fix 3: read token from config, not hardcoded
    const expectedToken = this.configService.get<string>(
      'WEBHOOK_VERIFY_TOKEN',
    );
    if (verifyToken !== expectedToken) {
      this.logger.error('Webhook verification failed: invalid verify token');
      throw new BadRequestException('Invalid verify token');
    }

    this.logger.log('Webhook verification successful — returning challenge');
    return challenge;
  }

  handleWebhook(payload: WebhookEventDto, signature?: string) {
    // ✅ Fix 4: HMAC signature verification
    const appSecret = this.configService.get<string>('META_APP_SECRET');
    if (appSecret && signature) {
      const expected = `sha256=${crypto
        .createHmac('sha256', appSecret)
        .update(JSON.stringify(payload))
        .digest('hex')}`;

      if (signature !== expected) {
        this.logger.error(
          'Webhook signature mismatch — possible spoofed request',
        );
        throw new BadRequestException('Invalid webhook signature');
      }
    }

    this.logger.log(`Webhook received | object: ${payload.object}`);

    if (payload.object !== 'whatsapp_business_account') {
      this.logger.warn(`Unexpected webhook object type: ${payload.object}`);
      return { success: false, message: 'Unrecognised webhook object type' };
    }

    const results: object[] = [];

    for (const entry of payload.entry) {
      this.logger.log(`Processing entry | businessAccountId: ${entry.id}`);
      for (const change of entry.changes) {
        if (change.field !== 'messages') {
          this.logger.warn(`Skipping unhandled field: ${change.field}`);
          continue;
        }
        for (const message of change.value.messages) {
          this.logger.log(
            `Message received | from: ${message.from} | type: ${message.type} | text: "${message.text?.body}"`,
          );
          results.push({
            messageId: message.id,
            from: message.from,
            type: message.type,
            body: message.text?.body,
            phoneNumberId: change.value.metadata.phone_number_id,
            processedAt: new Date().toISOString(),
          });
        }
      }
    }

    return { success: true, processed: results.length, messages: results };
  }
}
