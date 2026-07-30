import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { loadConfig } from './infra/config';
import { loadEnv } from './infra/load-env';
import { AppModule } from './app.module';
import { configureApp } from './app-setup';

async function bootstrap() {
  // Bring the repo's .env into process.env before anything reads config
  // (DEF-007). Resolved by walking up, so a workspace-script start finds the
  // same file the root scripts use.
  const envFile = loadEnv();
  const config = loadConfig();
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Global ValidationPipe + error-envelope filter (technical-design §7 D6).
  configureApp(app);

  // Web tier is a separate origin (ADR-002); allow it to call the API.
  app.enableCors({ origin: config.webOrigin, credentials: true });

  await app.listen(config.port);
  // Structured line so Cloud Logging ingests it as JSON (NFR-OBS-001).
  new Logger('Bootstrap').log(
    JSON.stringify({
      msg: 'api listening',
      port: config.port,
      env: config.nodeEnv,
      // Names the file, or says none was found. DEF-007's failure mode was
      // silence: config that looked applied and was not.
      envFile: envFile ?? 'none (using defaults + process env)',
      realtime: config.realtimeProvider,
    }),
  );
}

void bootstrap();
