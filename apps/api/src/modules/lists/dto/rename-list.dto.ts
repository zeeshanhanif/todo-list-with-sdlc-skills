import { IsString } from 'class-validator';

/** Request body for PATCH /lists/{id} — rename only (FR-LIST-006). Same
 * single-sourced validation story as CreateListDto. */
export class RenameListDto {
  @IsString({ message: 'Enter a name for this list.' })
  name!: string;
}
