import { NestFactory } from '@nestjs/core';

import { ValidationPipe } from '@nestjs/common';

import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()

    .setTitle('WhatsApp Meta Mock API')

    .setDescription('Mock Meta Embedded Signup Integration APIs')

    .setVersion('1.0')

    .addTag('appointments')

    .addTag('meta')

    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api-docs', app, document);

  await app.listen(process.env.PORT ?? 3000);

  console.log(
    `Application running on:
     http://localhost:3000`,
  );

  console.log(
    `Swagger docs:
     http://localhost:3000/api-docs`,
  );
}

void bootstrap();
