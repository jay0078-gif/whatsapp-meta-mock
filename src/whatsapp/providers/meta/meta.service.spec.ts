import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { MetaService } from './meta.service';
import { SignupState } from './entities/signup-state.entity';

const mockSignupStateRepo = {
  create: jest.fn().mockImplementation((dto) => dto),
  save: jest.fn().mockResolvedValue({}),
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    if (key === 'WEBHOOK_VERIFY_TOKEN') return 'mock_verify_token';
    if (key === 'META_APP_SECRET') return null;
    return null;
  }),
};

const validWebhookPayload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'mock-business-account-id',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '+911234567890',
              phone_number_id: 'mock-phone-number-id',
            },
            messages: [
              {
                from: '919999999999',
                id: 'wamid.mock-001',
                type: 'text',
                text: { body: 'Appointment Confirmed' },
              },
            ],
          },
        },
      ],
    },
  ],
};

describe('MetaService', () => {
  let service: MetaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetaService,
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: getRepositoryToken(SignupState),
          useValue: mockSignupStateRepo,
        },
      ],
    }).compile();
    service = module.get<MetaService>(MetaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('startSignup', () => {
    it('should return a signup URL and state', async () => {
      const result = await service.startSignup();
      expect(result.success).toBe(true);
      expect(result.signupUrl).toContain('mock=true');
      expect(result.state).toMatch(/^mock-state-/);
      expect(result.expiresIn).toBe(600);
    });

    it('should return a unique state on each call', async () => {
      const r1 = await service.startSignup();
      const r2 = await service.startSignup();
      expect(r1.state).not.toBe(r2.state);
    });
  });

  describe('signupCallback', () => {
    it('should return businessId, phoneNumberId and accessToken on success', () => {
      const result = service.signupCallback();
      expect(result.success).toBe(true);
      expect(result.businessId).toMatch(/^mock-biz-/);
      expect(result.phoneNumberId).toMatch(/^mock-ph-/);
      expect(result.accessToken).toMatch(/^EAAMock/);
      expect(result.grantedScopes).toContain('whatsapp_business_messaging');
    });

    it('should throw BadRequestException when fail is true', () => {
      expect(() => service.signupCallback({ fail: true })).toThrow(
        BadRequestException,
      );
    });

    it('should include errorCode in failure response', () => {
      try {
        service.signupCallback({ fail: true, errorCode: 'USER_DENIED' });
      } catch (e) {
        expect((e as BadRequestException).getResponse()).toMatchObject({
          errorCode: 'USER_DENIED',
        });
      }
    });
  });

  describe('verifyWebhook', () => {
    it('should return challenge when token is valid', () => {
      const result = service.verifyWebhook({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'mock_verify_token',
        'hub.challenge': 'test-challenge-123',
      });
      expect(result).toBe('test-challenge-123');
    });

    it('should throw BadRequestException for invalid token', () => {
      expect(() =>
        service.verifyWebhook({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong_token',
          'hub.challenge': '12345',
        }),
      ).toThrow(BadRequestException);
    });

    it('should throw BadRequestException when hub.mode is not subscribe', () => {
      expect(() =>
        service.verifyWebhook({
          'hub.mode': 'invalid_mode',
          'hub.verify_token': 'mock_verify_token',
          'hub.challenge': '12345',
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('handleWebhook', () => {
    it('should process valid Meta webhook payload', () => {
      const result = service.handleWebhook(validWebhookPayload as any);
      expect(result.success).toBe(true);
      expect(result.processed).toBe(1);
      expect(result.messages![0]).toMatchObject({
        from: '919999999999',
        type: 'text',
        body: 'Appointment Confirmed',
        phoneNumberId: 'mock-phone-number-id',
      });
    });

    it('should return success false for unknown object type', () => {
      const result = service.handleWebhook({
        ...validWebhookPayload,
        object: 'page',
      } as any);
      expect(result.success).toBe(false);
    });

    it('should handle multiple messages in one webhook', () => {
      const multi = {
        ...validWebhookPayload,
        entry: [
          {
            ...validWebhookPayload.entry[0],
            changes: [
              {
                ...validWebhookPayload.entry[0].changes[0],
                value: {
                  ...validWebhookPayload.entry[0].changes[0].value,
                  messages: [
                    {
                      from: '91111',
                      id: 'wamid-1',
                      type: 'text',
                      text: { body: 'Msg 1' },
                    },
                    {
                      from: '91222',
                      id: 'wamid-2',
                      type: 'text',
                      text: { body: 'Msg 2' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };
      const result = service.handleWebhook(multi as any);
      expect(result.processed).toBe(2);
    });
  });
});
