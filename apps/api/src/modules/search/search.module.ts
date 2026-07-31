import { Module } from '@nestjs/common';
import { PreferencesModule } from '../../common/preferences/preferences.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SearchRepository } from './search.repository';
import { ViewsController } from './views.controller';
import { ViewsService } from './views.service';
import { SessionGuard } from '../../common/authz/session.guard';
import { SessionService } from '../../common/authz/session.service';
import { SessionsRepository } from '../../common/authz/sessions.repository';

// Search capability module (FR-SRCH-*) — FEAT-015 and FEAT-016, the two slices
// src/modules/README.md reserved it for. It now serves two controllers: search
// (GET /search) and the smart views (GET /views/{view}), which are the same
// query with fixed criteria (FEAT-016 D1) rather than a second query builder.
// Pulls the session guard + store from common/authz so both endpoints are
// authenticated (FR-AUTHZ-001), and PreferencesModule for the caller's
// timezone, which FR-SRCH-004's and FR-SRCH-008's date buckets are computed in
// (FEAT-015 technical-design D1).
// No RealtimeModule: this module writes nothing, so it publishes nothing.
@Module({
  imports: [PreferencesModule],
  controllers: [SearchController, ViewsController],
  providers: [
    SearchService,
    ViewsService,
    SearchRepository,
    SessionGuard,
    SessionService,
    SessionsRepository,
  ],
})
export class SearchModule {}
