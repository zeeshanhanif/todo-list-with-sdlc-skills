import { IsIn, IsISO8601, IsString, ValidateIf } from 'class-validator';
import { TASK_PRIORITIES, type TaskPriority } from '@todo/shared';

/**
 * Request body for POST /lists/{listId}/tasks. The list comes from the path and
 * the owner from the session — neither is ever read from the body (FR-AUTHZ-004,
 * FR-LIST-009). The FR-TASK-002 bounds (trim → non-empty → TASK_TITLE_MAX_LENGTH)
 * are enforced server-side by TasksService so the requirement message stays
 * single-sourced, the shape CreateListDto uses.
 *
 * `dueAt` and `priority` were added by FEAT-011, closing UC-009 step 2 that
 * FEAT-010 D6 deferred. Both **optional with behaviour-preserving defaults**, so
 * a `{ title }` body is unchanged (D8) — the same guards as UpdateTaskDto, for
 * the same reason.
 */
export class CreateTaskDto {
  @IsString({ message: 'Enter a title for this task.' })
  title!: string;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsISO8601({ strict: true }, { message: 'Enter a valid date and time.' })
  dueAt?: string | null;

  @ValidateIf((_, value) => value !== undefined)
  @IsIn(TASK_PRIORITIES, {
    message: `Choose one of: ${TASK_PRIORITIES.join(', ')}.`,
  })
  priority?: TaskPriority;
}
