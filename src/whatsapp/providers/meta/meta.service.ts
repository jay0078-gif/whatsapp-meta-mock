import { BadRequestException, Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MetaService {
  private readonly logger = new Logger(MetaService.name);

  startSignup() {
    this.logger.log('Starting mock Meta Embedded Signup flow');

    return {
      success: true,

      signupUrl: 'https://mock-meta-signup.local',

      state: 'mock-state-123',
    };
  }

  signupCallback(body?: { fail?: boolean }) {
    this.logger.log('Processing mock signup callback');

    if (body?.fail === true) {
      this.logger.error('Mock signup failure simulated');

      throw new BadRequestException({
        success: false,
        message: 'Mock Meta signup failed',
      });
    }

    return {
      success: true,

      businessId: 'mock-business-id',

      phoneNumberId: 'mock-phone-number-id',

      accessToken: 'mock-access-token',
    };
  }

  verifyWebhook(query: Record<string, string>) {
    this.logger.log('Verifying Meta webhook');

    const verifyToken = query['hub.verify_token'];

    if (verifyToken !== 'mock_verify_token') {
      this.logger.error('Webhook verification failed');

      throw new BadRequestException('Invalid verify token');
    }

    this.logger.log('Webhook verification successful');

    return query['hub.challenge'];
  }

  handleWebhook(payload: unknown) {
    this.logger.log(
      `Webhook event received:
       ${JSON.stringify(payload)}`,
    );

    return {
      success: true,

      message: 'Webhook processed successfully',
    };
  }
}
