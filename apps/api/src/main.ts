import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { leerConfiguracion } from './config';
import type { Request, Response, NextFunction } from 'express';

async function iniciar() {
  const config = leerConfiguracion();
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.use(helmet());
  app.use(cookieParser(config.cookieSecret));
  app.enableCors({ origin: config.webUrl, credentials: true });
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.path.startsWith('/webhooks/meta/whatsapp')) {
      if (req.headers.origin !== config.webUrl) return next(new BadRequestException('Origen no permitido'));
    }
    next();
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(config.puerto, '0.0.0.0');
  console.log(JSON.stringify({ evento: 'api_iniciada', puerto: config.puerto, modo: config.whatsappMode }));
}
iniciar().catch(error => { console.error(JSON.stringify({ evento: 'inicio_fallido', error: error instanceof Error ? error.message : 'Error desconocido' })); process.exit(1); });
