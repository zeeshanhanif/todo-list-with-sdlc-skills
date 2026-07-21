import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { loadConfig } from './infra/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Web tier is a separate origin (ADR-002); allow it to call the API.
  app.enableCors({ origin: config.webOrigin, credentials: true });

  await app.listen(config.port);
  // Structured line so Cloud Logging ingests it as JSON (NFR-OBS-001).
  new Logger('Bootstrap').log(
    JSON.stringify({
      msg: 'api listening',
      port: config.port,
      env: config.nodeEnv,
    }),
  );
}

void bootstrap();
