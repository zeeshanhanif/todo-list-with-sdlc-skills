import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TasksRepository } from './tasks.repository';
import { SessionGuard } from '../../common/authz/session.guard';
import { SessionService } from '../../common/authz/session.service';
import { SessionsRepository } from '../../common/authz/sessions.repository';

// Tasks capability module (FR-TASK-*) — the second owned-data module (FEAT-010).
// Pulls the session guard + store from common/authz so every endpoint is
// authenticated (FR-AUTHZ-001); ownership is enforced inside TasksRepository,
// where every statement is owner-scoped (FEAT-009 D3, the convention
// modules/lists demonstrates). DbService comes from the global InfraModule.
@Module({
  controllers: [TasksController],
  providers: [
    TasksService,
    TasksRepository,
    SessionGuard,
    SessionService,
    SessionsRepository,
  ],
})
export class TasksModule {}
