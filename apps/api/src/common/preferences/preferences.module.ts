import { Module } from '@nestjs/common';
import { UserTimeZoneService } from './user-timezone.service';

// Cross-cutting user preferences (FEAT-015 technical-design D1) — the explicit
// cross-module read interface FEAT-010 D8 said the third case should mint.
// Read-only: capability modules that need a stored preference to shape a query
// import THIS, never `modules/profile`. FEAT-015 (search buckets) is its first
// consumer, FEAT-016 (smart views) its second.
@Module({
  providers: [UserTimeZoneService],
  exports: [UserTimeZoneService],
})
export class PreferencesModule {}
