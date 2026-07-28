import { IsIn, IsISO8601, IsString, ValidateIf } from 'class-validator';
import { TASK_PRIORITIES, type TaskPriority } from '@todo/shared';

/**
 * Request body for PATCH /tasks/{id} (FEAT-011 technical-design §3.2).
 *
 * **`@ValidateIf`, not `@IsOptional`, and the difference is the contract.**
 * `@IsOptional()` skips validation when a value is `null` *or* `undefined` —
 * which would silently accept `dueAt: "garbage"`... no: worse, it would treat an
 * explicit `null` as "not provided" and lose FR-TASK-006's *clear* operation
 * (technical-design D4). `@ValidateIf((_, v) => v !== undefined)` runs the
 * validators for every value the client actually sent, `null` included, and
 * skips only genuinely absent fields.
 *
 * `null` is then permitted for `dueAt` alone (it means "clear"), which is why
 * its guard also lets `null` through to the service — `title` and `priority`
 * have no null meaning and are rejected if sent as null.
 *
 * Absent keys must stay absent on the instance: TasksService branches on
 * `'dueAt' in patch`, so a DTO that materialized every declared property as
 * `undefined` would make every PATCH look like a clear. There are no property
 * initializers here for that reason, and the behaviour is asserted by contract
 * test rather than assumed.
 */
export class UpdateTaskDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString({ message: 'Enter a title for this task.' })
  title?: string;

  // null passes through (it is FR-TASK-006's "clear"); any other non-absent
  // value must be a real instant. Bounds are not checked — a past due date is
  // legal and necessary (D2).
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsISO8601({ strict: true }, { message: 'Enter a valid date and time.' })
  dueAt?: string | null;

  @ValidateIf((_, value) => value !== undefined)
  @IsIn(TASK_PRIORITIES, {
    message: `Choose one of: ${TASK_PRIORITIES.join(', ')}.`,
  })
  priority?: TaskPriority;
}
