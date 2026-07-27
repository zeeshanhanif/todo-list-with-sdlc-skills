import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

/**
 * Request body for POST /lists/reorder — the caller's **complete** set of list
 * ids in the desired order (FR-LIST-008, technical-design D2). Shape is checked
 * here; set-equality against the caller's actual lists is ListsService's job,
 * because only it can look them up.
 */
export class ReorderListsDto {
  @IsArray({ message: 'Send your list ids in the order you want.' })
  @ArrayNotEmpty({ message: 'Send your list ids in the order you want.' })
  @IsUUID('4', {
    each: true,
    message: 'Send your list ids in the order you want.',
  })
  listIds!: string[];
}
