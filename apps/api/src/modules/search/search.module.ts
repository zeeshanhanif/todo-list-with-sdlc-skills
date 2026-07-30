import { Module } from '@nestjs/common';
import { PreferencesModule } from '../../common/preferences/preferences.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SearchRepository } from './search.repository';
import { SessionGuard } from '../../common/authz/session.guard';
import { SessionService } from '../../common/authz/session.service';
import { SessionsRepository } from '../../common/authz/sessions.repository';

// Search capability module (FR-SRCH-*) — FEAT-015, the module
// src/modules/README.md reserved for this slice and FEAT-016. Pulls the session
// guard + store from common/authz so the endpoint is authenticated
// (FR-AUTHZ-001), and PreferencesModule for the caller's timezone, which
// FR-SRCH-004's date buckets are computed in (technical-design D1).
// No RealtimeModule: this module writes nothing, so it publishes nothing.
@Module({
  imports: [PreferencesModule],
  controllers: [SearchController],
  providers: [
    SearchService,
    SearchRepository,
    SessionGuard,
    SessionService,
    SessionsRepository,
  ],
})
export class SearchModule {}
