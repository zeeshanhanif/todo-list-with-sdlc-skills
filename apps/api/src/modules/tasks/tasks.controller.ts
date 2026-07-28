import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  LIST_ERROR_CODES,
  type CreateTaskResponse,
  type ListTasksResponse,
  type SessionUser,
} from '@todo/shared';
import { SessionGuard } from '../../common/authz/session.guard';
import { CurrentUser } from '../../common/authz/current-user.decorator';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import {
  ListNotFoundError,
  TaskFieldInvalidError,
  TaskTitleInvalidError,
} from './tasks.errors';

// Task endpoints (FR-TASK-*) — the list view and the quick-add composer's target
// (FEAT-010). Every route is authenticated (FR-AUTHZ-001) and scoped to the
// session user; the list comes from the path and is verified by ownership before
// anything else, so a task can never land in — or be read from — a list the
// caller doesn't own (FR-AUTHZ-002/003, technical-design §3).
// The extra path segment keeps these clear of ListsController's /lists,
// /lists/reorder and /lists/:id routes.
// Not rate-limited: FR-AUTH-018 / NFR-SEC-006 scope throttling to auth endpoints.
@Controller('lists/:listId/tasks')
@UseGuards(SessionGuard)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  // GET /lists/{listId}/tasks (FR-TASK-003; UC-009 main 4) — the list view.
  // Returns the list itself alongside its tasks so the screen renders its header
  // without a second round trip (technical-design D3).
  @Get()
  async listView(
    @Param('listId') listId: string,
    @CurrentUser() user: SessionUser,
  ): Promise<ListTasksResponse> {
    try {
      return await this.tasks.listView(user.id, listId);
    } catch (err) {
      throw toHttp(err);
    }
  }

  // POST /lists/{listId}/tasks (FR-TASK-001/002, FR-LIST-009; UC-009 main 1/3).
  // FEAT-011 adds the optional dueAt/priority, closing UC-009 step 2 that
  // FEAT-010 D6 deferred. Additive: a { title } body behaves exactly as before.
  @Post()
  @HttpCode(201)
  async create(
    @Param('listId') listId: string,
    @Body() dto: CreateTaskDto,
    @CurrentUser() user: SessionUser,
  ): Promise<CreateTaskResponse> {
    try {
      return {
        task: await this.tasks.create(user.id, listId, dto.title, {
          dueAt: dto.dueAt,
          priority: dto.priority,
        }),
      };
    } catch (err) {
      throw toHttp(err);
    }
  }
}

/** Map the module's domain errors onto the designed HTTP responses
 * (technical-design §3); the global filter renders the ApiError envelope.
 * Anything unrecognized is returned as-is → 500 internal_error via the filter. */
function toHttp(err: unknown): unknown {
  if (err instanceof ListNotFoundError) {
    return new NotFoundException({
      code: LIST_ERROR_CODES.listNotFound,
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
  // dueAt / priority failures at creation (FEAT-011) — the same envelope, with
  // the offending field named by the error rather than hard-coded.
  if (err instanceof TaskFieldInvalidError) {
    return new BadRequestException({
      code: 'validation_failed',
      message: 'Validation failed.',
      fields: [{ field: err.field, message: err.requirement }],
    });
  }
  return err;
}
