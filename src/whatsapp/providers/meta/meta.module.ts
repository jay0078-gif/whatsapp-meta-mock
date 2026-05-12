import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { MetaController } from './meta.controller';
import { MetaService } from './meta.service';
import { SignupState } from './entities/signup-state.entity';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([SignupState])],
  controllers: [MetaController],
  providers: [MetaService],
  exports: [MetaService],
})
export class MetaModule {}
