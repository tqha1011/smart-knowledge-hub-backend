import 'reflect-metadata';
/**
 * This is the main entry point of the application. It sets up the NestJS application, applies global validation pipes, and configures Swagger for API documentation. Finally, it starts the server on the specified port.
 */
import { ValidationPipe } from '@nestjs/common/pipes/validation.pipe';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './shared/common/exceptions.filter';
import { ALLOWED_ORIGINS } from './shared/common/cors';
import { RedisIoAdapter } from './shared/infrastructure/notification/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const redisIoAdapter = new RedisIoAdapter(app);
  redisIoAdapter.connectToRedis(configService.getOrThrow<string>('REDIS_URL'));
  app.useWebSocketAdapter(redisIoAdapter);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  const options = new DocumentBuilder()
    .setTitle('Smart Knowledge API')
    .setDescription('API documentation for Smart Knowledge Portal application')
    .setVersion('1.0')
    .addTag('auth', 'Authentication related endpoints')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      displayRequestDuration: true,
    },
  });
  app.enableCors({
    origin: ALLOWED_ORIGINS, // default react dev server port
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
