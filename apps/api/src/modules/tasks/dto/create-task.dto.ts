import { IsString } from 'class-validator';

/**
 * Request body for POST /lists/{listId}/tasks. The list comes from the path and
 * the owner from the session — neither is ever read from the body (FR-AUTHZ-004,
 * FR-LIST-009). The FR-TASK-002 bounds (trim → non-empty → TASK_TITLE_MAX_LENGTH)
 * are enforced server-side by TasksService so the requirement message stays
 * single-sourced, the shape CreateListDto uses.
 */
export class CreateTaskDto {
  @IsString({ message: 'Enter a title for this task.' })
  title!: string;
}
