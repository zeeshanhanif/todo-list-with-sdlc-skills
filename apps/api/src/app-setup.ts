import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { HttpExceptionFilter } from './common/http-exception.filter';

/**
 * Applies the app-wide HTTP conventions (technical-design §7 D6) — the global
 * ValidationPipe and the error-envelope filter. Called by both main.ts (runtime)
 * and the contract tests, so request handling is identical in both.
 */
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      // Turn field validation failures into the ApiError envelope with fields[].
      exceptionFactory: (errors: ValidationError[]) => {
        const fields = errors.map((e) => ({
          field: e.property,
          message: Object.values(e.constraints ?? {})[0] ?? 'Invalid value.',
        }));
        return new BadRequestException({
          code: 'validation_failed',
          message: 'Validation failed.',
          fields,
        });
      },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
}
