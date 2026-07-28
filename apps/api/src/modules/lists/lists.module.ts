import { Module } from '@nestjs/common';
import { ListsController } from './lists.controller';
import { ListsService } from './lists.service';
import { ListsRepository } from './lists.repository';
import { SessionGuard } from '../../common/authz/session.guard';
import { SessionService } from '../../common/authz/session.service';
import { SessionsRepository } from '../../common/authz/sessions.repository';

// Lists capability module (FR-LIST-*) — the first owned-data module (FEAT-009).
// Pulls the session guard + store from common/authz so every endpoint is
// authenticated (FR-AUTHZ-001); ownership itself is enforced inside
// ListsRepository, where every statement is owner-scoped (technical-design D3).
// DbService comes from the global InfraModule.
@Module({
  controllers: [ListsController],
  providers: [
    ListsService,
    ListsRepository,
    SessionGuard,
    SessionService,
    SessionsRepository,
  ],
})
export class ListsModule {}
