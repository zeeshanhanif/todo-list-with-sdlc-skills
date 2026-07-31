import { Module } from '@nestjs/common';
import { RealtimeModule } from '../../common/realtime/realtime.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { ProfileRepository } from './profile.repository';
import { SessionGuard } from '../../common/authz/session.guard';
import { SessionService } from '../../common/authz/session.service';
import { SessionsRepository } from '../../common/authz/sessions.repository';

// Profile & settings capability module (FR-PROF-*) — FEAT-008, the module
// src/modules/README.md reserved for this slice. Pulls the session guard + store
// from common/authz so both endpoints are authenticated (FR-AUTHZ-001), and
// RealtimeModule for the change signal a successful PATCH publishes
// (FR-PROF-005, ADR-006). DbService comes from the global InfraModule.
// No ownership plumbing: the subject is always the session user (§3).
@Module({
  imports: [RealtimeModule],
  controllers: [ProfileController],
  providers: [
    ProfileService,
    ProfileRepository,
    SessionGuard,
    SessionService,
    SessionsRepository,
  ],
})
export class ProfileModule {}
