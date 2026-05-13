import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsAppProviderFactory } from 'src/whatsapp/factory/whatsapp-provider.factory';
import { SendTemplateDto, TemplateType } from './dto/send-template.dto';
import { WebhookDeliveryEventDto } from './dto/webhook-delivery-event.dto';
import {
  TemplateMessage,
  TemplateStatus,
} from './entities/template-message.entity';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 100;

@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);

  constructor(
    private readonly providerFactory: WhatsAppProviderFactory,
    @InjectRepository(TemplateMessage)
    private readonly templateRepo: Repository<TemplateMessage>,
  ) {}

  async sendConfirmation(dto: SendTemplateDto) {
    return this.sendWithRetry({
      ...dto,
      templateName: TemplateType.CONFIRMATION,
    });
  }

  async sendReminder(dto: SendTemplateDto) {
    return this.sendWithRetry({ ...dto, templateName: TemplateType.REMINDER });
  }

  async sendCancellation(dto: SendTemplateDto) {
    return this.sendWithRetry({
      ...dto,
      templateName: TemplateType.CANCELLATION,
    });
  }

  async handleDeliveryEvent(event: WebhookDeliveryEventDto) {
    this.logger.log(
      `Delivery event received | messageId: ${event.messageId} | status: ${event.status}`,
    );

    const record = await this.templateRepo.findOne({
      where: { messageId: event.messageId },
    });

    if (!record) {
      throw new NotFoundException(
        `No template message found for messageId: ${event.messageId}`,
      );
    }

    record.status = event.status;
    if (event.failureReason) {
      record.failureReason = event.failureReason;
    }

    await this.templateRepo.save(record);
    this.logger.log(
      `Status updated | messageId: ${event.messageId} | status: ${event.status}`,
    );

    return {
      success: true,
      messageId: event.messageId,
      status: event.status,
      updatedAt: new Date().toISOString(),
    };
  }

  async getStatus(messageId: string) {
    const record = await this.templateRepo.findOne({ where: { messageId } });
    if (!record) {
      throw new NotFoundException(
        `No template message found for messageId: ${messageId}`,
      );
    }
    return {
      messageId: record.messageId,
      templateName: record.templateName,
      provider: record.provider,
      status: record.status,
      retryCount: record.retryCount,
      failureReason: record.failureReason ?? null,
      sentAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private async sendWithRetry(dto: SendTemplateDto) {
    const primaryProvider = this.providerFactory.getProvider();
    const fallbackProvider = this.providerFactory.getFallbackProvider();
    let lastError: Error | null = null;
    let retryCount = 0;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        this.logger.log(
          `Attempt ${attempt} | template: ${dto.templateName} | to: ${dto.phoneNumber}`,
        );

        const response = await primaryProvider.sendTemplateMessage(
          dto.templateName,
          {
            patientName: dto.patientName,
            doctorName: dto.doctorName,
            appointmentDate: dto.appointmentDate,
            appointmentTime: dto.appointmentTime,
            hospitalName: dto.hospitalName,
            phoneNumber: dto.phoneNumber,
          },
        );

        const record = this.templateRepo.create({
          messageId: response.messageId,
          provider: response.provider,
          templateName: dto.templateName,
          patientName: dto.patientName,
          doctorName: dto.doctorName,
          hospitalName: dto.hospitalName,
          appointmentDate: dto.appointmentDate,
          appointmentTime: dto.appointmentTime,
          phoneNumber: dto.phoneNumber,
          status: TemplateStatus.SENT,
          retryCount,
        });

        await this.templateRepo.save(record);
        this.logger.log(
          `Template sent successfully | messageId: ${response.messageId}`,
        );
        return { ...response, retryCount };
      } catch (error) {
        lastError = error as Error;
        retryCount = attempt;
        this.logger.warn(
          `Attempt ${attempt} failed | reason: ${lastError.message}`,
        );

        if (attempt < MAX_RETRIES) {
          await new Promise((resolve) =>
            setTimeout(resolve, RETRY_DELAY_MS * attempt),
          );
        }
      }
    }

    // All retries exhausted — try fallback provider
    this.logger.warn(
      `Primary failed after ${MAX_RETRIES} attempts — trying fallback provider`,
    );
    try {
      const fallbackResponse = await fallbackProvider.sendTemplateMessage(
        dto.templateName,
        {
          patientName: dto.patientName,
          doctorName: dto.doctorName,
          appointmentDate: dto.appointmentDate,
          appointmentTime: dto.appointmentTime,
          hospitalName: dto.hospitalName,
          phoneNumber: dto.phoneNumber,
        },
      );

      const fallbackRecord = this.templateRepo.create({
        messageId: fallbackResponse.messageId,
        provider: fallbackResponse.provider,
        templateName: dto.templateName,
        patientName: dto.patientName,
        doctorName: dto.doctorName,
        hospitalName: dto.hospitalName,
        appointmentDate: dto.appointmentDate,
        appointmentTime: dto.appointmentTime,
        phoneNumber: dto.phoneNumber,
        status: TemplateStatus.SENT,
        retryCount,
        failureReason: `Primary failed: ${lastError?.message}. Sent via fallback.`,
      });

      await this.templateRepo.save(fallbackRecord);
      this.logger.log(
        `Fallback provider succeeded | messageId: ${fallbackResponse.messageId}`,
      );
      return { ...fallbackResponse, retryCount, usedFallback: true };
    } catch (fallbackError) {
      const fallbackErr = fallbackError as Error;
      this.logger.error(
        `Fallback provider also failed | reason: ${fallbackErr.message}`,
      );
    }

    // Both failed — save FAILED record
    const failedRecord = this.templateRepo.create({
      messageId: `failed-${Date.now()}`,
      provider: 'UNKNOWN',
      templateName: dto.templateName,
      patientName: dto.patientName,
      doctorName: dto.doctorName,
      hospitalName: dto.hospitalName,
      appointmentDate: dto.appointmentDate,
      appointmentTime: dto.appointmentTime,
      phoneNumber: dto.phoneNumber,
      status: TemplateStatus.FAILED,
      failureReason: lastError?.message ?? 'Unknown error',
      retryCount,
    });

    await this.templateRepo.save(failedRecord);
    this.logger.error(`All attempts including fallback failed`);

    return {
      success: false,
      status: TemplateStatus.FAILED,
      failureReason: lastError?.message,
      retryCount,
    };
  }
}
