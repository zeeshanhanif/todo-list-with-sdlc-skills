import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  TASK_ERROR_CODES,
  type SessionUser,
  type TaskDetailResponse,
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
