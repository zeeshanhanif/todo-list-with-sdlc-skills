import { Module } from '@nestjs/common';
import { SessionGuard } from '../../common/authz/session.guard';
import { SessionService } from '../../common/authz/session.service';
import { SessionsRepository } from '../../common/authz/sessions.repository';
import { AuditService } from '../../common/audit/audit.service';
import { AuditRepository } from '../../common/audit/audit.repository';
import { AccountExportController } from './account-export.controller';
import { AccountExportService } from './account-export.service';
import { AccountExportRepository } from './account-export.repository';

// Account data & privacy capability module (FR-DATA-*) — the module
// src/modules/README.md reserved for EPIC-G. FEAT-017 builds the export;
// FEAT-018 adds account deletion to this same module.
//
// Pulls the session guard + store from common/authz (FR-AUTHZ-001) and the
// audit log from common/audit (NFR-SEC-009, technical-design D6). No
// RealtimeModule: the export is a read and publishes no change signal.
// DbService comes from the global InfraModule.
@Module({
  controllers: [AccountExportController],
  providers: [
    AccountExportService,
    AccountExportRepository,
    AuditService,
    AuditRepository,
    SessionGuard,
    SessionService,
    SessionsRepository,
  ],
})
export class AccountDataModule {}
