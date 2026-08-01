import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

/**
 * Request body for `POST /lists/{listId}/tasks/reorder` — the caller's
 * **complete** set of active, non-deleted task ids in that list, in the desired
 * order (FR-TASK-012, FEAT-014 technical-design D2).
 *
 * Shape is checked here; **set-equality against the list's actual active tasks
 * is TasksService's job**, because only it can look them up — the same division
 * `ReorderListsDto` draws. One message for every shape failure, matching the
 * service's single set-failure message, so no combination of a malformed body
 * and a probe can be used to learn anything about which ids exist.
 */
export class ReorderTasksDto {
  @IsArray({ message: 'Send your task ids in the order you want.' })
  @ArrayNotEmpty({ message: 'Send your task ids in the order you want.' })
  @IsUUID('4', {
    each: true,
    message: 'Send your task ids in the order you want.',
  })
  taskIds!: string[];
}
