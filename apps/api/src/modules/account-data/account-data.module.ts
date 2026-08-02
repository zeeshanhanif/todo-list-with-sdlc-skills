import { Module } from '@nestjs/common';
import { SessionGuard } from '../../common/authz/session.guard';
import { SessionService } from '../../common/authz/session.service';
import { SessionsRepository } from '../../common/authz/sessions.repository';
import { AuditService } from '../../common/audit/audit.service';
import { AuditRepository } from '../../common/audit/audit.repository';
import { PasswordHasher } from '../../common/crypto/password-hasher';
import { RateLimitGuard } from '../../common/rate-limit/rate-limit.guard';
import { RateLimitRepository } from '../../common/rate-limit/rate-limit.repository';
import { AccountExportController } from './account-export.controller';
import { AccountExportService } from './account-export.service';
import { AccountExportRepository } from './account-export.repository';
import { AccountDeleteController } from './account-delete.controller';
import { AccountDeleteService } from './account-delete.service';
import { AccountDeleteRepository } from './account-delete.repository';

// Account data & privacy capability module (FR-DATA-*) — the module
// src/modules/README.md reserved for EPIC-G. FEAT-017 built the export;
// FEAT-018 adds account deletion to this same module.
//
// Pulls the session guard + store from common/authz (FR-AUTHZ-001), the audit
// log from common/audit (NFR-SEC-009), the Argon2id hasher from common/crypto
// (FEAT-018 D2 — the deletion verifies a password, and the boundary rule
// forbids importing `auth`'s copy) and the per-IP limiter from
// common/rate-limit (FEAT-018 D9 — it applies to the deletion, not the export).
// No RealtimeModule: the export is a read, and the deletion deliberately
// publishes no change signal (FEAT-018 D7). DbService comes from the global
// InfraModule.
@Module({
  controllers: [AccountExportController, AccountDeleteController],
  providers: [
    AccountExportService,
    AccountExportRepository,
    AccountDeleteService,
    AccountDeleteRepository,
    PasswordHasher,
    AuditService,
    AuditRepository,
    SessionGuard,
    SessionService,
    SessionsRepository,
    RateLimitGuard,
    RateLimitRepository,
  ],
})
export class AccountDataModule {}
