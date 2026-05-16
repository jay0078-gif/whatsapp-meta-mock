import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappModule } from 'src/whatsapp/whatsapp.module';
import { TemplateController } from './template.controller';
import { TemplateService } from './template.service';
import { TemplateMessage } from './entities/template-message.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TemplateMessage]), WhatsappModule],
  controllers: [TemplateController],
  providers: [TemplateService],
})
export class TemplateModule {}
