import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  TASK_ERROR_CODES,
  type DeleteTaskResponse,
  type RestoreTaskResponse,
  type SessionUser,
  type TaskDetailResponse,
  type TaskStatusResponse,
  type UpdateTaskResponse,
} from '@todo/shared';
import { SessionGuard } from '../../common/authz/session.guard';
import { CurrentUser } from '../../common/authz/current-user.decorator';
import { TasksService } from './tasks.service';
import { UpdateTaskDto } from './dto/update-task.dto';
import {
  TaskFieldInvalidError,
  TaskNotFoundError,
  TaskTitleInvalidError,
} from './tasks.errors';

// The SINGLE-TASK resource (FEAT-011) — `/tasks/{id}`, separate from
// TasksController's `/lists/{listId}/tasks` collection because a task id is
// globally unique and ownership is checked on tasks.owner_id directly; no list
// is needed to address one. Named for the *item* so it never reads as a
// near-duplicate of the collection controller.
//
// FEAT-012's complete/reopen and FEAT-013's delete/restore land here.
//
// Every route is authenticated (FR-AUTHZ-001) and scoped to the session user;
// unknown, not-owned, malformed and soft-deleted ids all leave as one uniform
// 404 so the response can never disclose which (FR-AUTHZ-002/003/005).
// Not rate-limited: FR-AUTH-018 / NFR-SEC-006 scope throttling to auth endpoints.
@Controller('tasks')
@UseGuards(SessionGuard)
export class TaskItemController {
  constructor(private readonly tasks: TasksService) {}

  // GET /tasks/{id} (FR-TASK-004; UC-010 main 1) — the five details the FR names,
  // with the owning list alongside so the detail surface needs no second call.
  @Get(':id')
  async detail(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<TaskDetailResponse> {
    try {
      return await this.tasks.detail(user.id, id);
    } catch (err) {
      throw toHttp(err);
    }
  }

  // PATCH /tasks/{id} (FR-TASK-005/006/008; UC-010 main 2/3, alt 2a/3a).
  // Partial: absent fields are untouched, `dueAt: null` clears (D4).
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: SessionUser,
  ): Promise<UpdateTaskResponse> {
    try {
      return { task: await this.tasks.update(user.id, id, dto) };
    } catch (err) {
      throw toHttp(err);
    }
  }

  // POST /tasks/{id}/complete (FR-TASK-009; UC-011 main 1/2) and
  // POST /tasks/{id}/reopen (FR-TASK-010; UC-011 main 3/4) — FEAT-012.
  //
  // Verb routes rather than a field on PATCH above: the completion instant is
  // the server's fact, and that PATCH's contract refuses `completedAt` outright
  // (FEAT-012 D1). **No `@Body()` and no DTO** — method, path and session fully
  // specify both operations, so there is nowhere for a client to send something
  // the server would have to decide to ignore (D8). @HttpCode(200) because
  // neither creates anything; Nest's POST default of 201 would be a lie.
  //
  // Both are **idempotent** (D2): a repeat returns 200 with the state already
  // stored, never a 409. The only failures are the two below.
  @Post(':id/complete')
  @HttpCode(200)
  async complete(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<TaskStatusResponse> {
    try {
      return { task: await this.tasks.complete(user.id, id) };
    } catch (err) {
      throw toHttp(err);
    }
  }

  @Post(':id/reopen')
  @HttpCode(200)
  async reopen(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<TaskStatusResponse> {
    try {
      return { task: await this.tasks.reopen(user.id, id) };
    } catch (err) {
      throw toHttp(err);
    }
  }

  // DELETE /tasks/{id} (FR-TASK-013; UC-012 main 1/2) — SOFT: the row stays,
  // `deleted_at` is set, and every other statement in the module stops seeing
  // it. Nest's default status for DELETE is 200, and the body is deliberate
  // (FEAT-009's DELETE /lists/{id} set the precedent): `deletedAt` is the
  // instant the retention clock started, which is also what makes a repeat's
  // idempotency observable without reading the database (FEAT-013 D4).
  //
  // 200 on a repeat, never 404 (D3): the UI must not report "that task no
  // longer exists" for an operation that in fact succeeded.
  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<DeleteTaskResponse> {
    try {
      return await this.tasks.softDelete(user.id, id);
    } catch (err) {
      throw toHttp(err);
    }
  }

  // POST /tasks/{id}/restore (FR-TASK-014; UC-012 main 3/4) — the undo. No
  // server-side time limit: FR-TASK-014's window is "until purge", so the ~7s
  // snackbar is a UI affordance, not the contract. Once FEAT-020 purges the
  // row, the uniform 404 is the honest answer.
  @Post(':id/restore')
  @HttpCode(200)
  async restore(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<RestoreTaskResponse> {
    try {
      return { task: await this.tasks.restore(user.id, id) };
    } catch (err) {
      throw toHttp(err);
    }
  }
}

/** Map the module's domain errors onto the designed HTTP responses
 * (technical-design §3); the global filter renders the ApiError envelope.
 * Anything unrecognized is returned as-is → 500 internal_error via the filter. */
function toHttp(err: unknown): unknown {
  if (err instanceof TaskNotFoundError) {
    return new NotFoundException({
      code: TASK_ERROR_CODES.taskNotFound,
      message: err.message,
    });
  }
  if (err instanceof TaskTitleInvalidError) {
    return new BadRequestException({
      code: 'validation_failed',
      message: 'Validation failed.',
      fields: [{ field: 'title', message: err.requirement }],
    });
  }
  if (err instanceof TaskFieldInvalidError) {
    return new BadRequestException({
      code: 'validation_failed',
      message: 'Validation failed.',
      fields: [{ field: err.field, message: err.requirement }],
    });
  }
  return err;
}
