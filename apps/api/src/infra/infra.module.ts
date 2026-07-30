import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, readConfig } from './config';
import { DbService } from './db.service';

// Cross-cutting infrastructure (DB access, config). Global so capability modules
// can inject DbService and APP_CONFIG without re-importing (ADR-003).
//
// `APP_CONFIG` is built ONCE here (DEF-008) and shared by every consumer. It is a
// `useFactory`, not a `useValue`, deliberately: `useValue` evaluates when this
// module is imported — before `main.ts` calls `loadEnv()` — which would hand the
// whole app a defaults-only config and silently undo DEF-007's fix.
@Global()
@Module({
  providers: [
    { provide: APP_CONFIG, useFactory: () => readConfig() },
    DbService,
  ],
  exports: [APP_CONFIG, DbService],
})
export class InfraModule {}
