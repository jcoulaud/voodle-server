import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './services/config/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.use(cookieParser());

  app.enableCors({
    origin: configService.get('BASE_URL'),
    credentials: true,
  });

  const port = configService.get('PORT', { infer: true });
  await app.listen(port);

  console.log(`Environment: ${configService.get('NODE_ENV', { infer: true })}`);
  console.log(`Application is running on: ${await app.getUrl()}`);
}

bootstrap();
