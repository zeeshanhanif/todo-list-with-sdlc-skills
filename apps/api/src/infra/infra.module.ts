import { Global, Module } from '@nestjs/common';
import { DbService } from './db.service';

// Cross-cutting infrastructure (DB access, config). Global so capability modules
// can inject DbService without re-importing (ADR-003).
@Global()
@Module({
  providers: [DbService],
  exports: [DbService],
})
export class InfraModule {}
