import { IsString } from 'class-validator';

/**
 * Request body for POST /lists. Ownership comes from the resolved session, never
 * from the body (FR-AUTHZ-004). The FR-LIST-002 bounds (trim → non-empty →
 * LIST_NAME_MAX_LENGTH) are enforced server-side by ListsService so the
 * requirement message stays single-sourced — the shape the auth DTOs use for
 * password policy.
 */
export class CreateListDto {
  @IsString({ message: 'Enter a name for this list.' })
  name!: string;
}
