import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';

/**
 * Query parameters for `GET /search` (FEAT-015 technical-design §3.1).
 *
 * **Shallow on purpose.** This DTO only establishes *types* — that `limit`
 * arrived as a number and the rest as strings. The real rules (which values are
 * legal, the term's bounds and escaping, the no-criteria rule, the cursor's
 * shape) live in `search.criteria.ts`, because every one of them needs to name
 * a field in the error and several are not expressible as decorators. Splitting
 * them across both places is how two sources of truth start.
 *
 * `@Type(() => Number)` is load-bearing: query strings arrive as text, so
 * without it `limit=25` reaches the service as `"25"` and every numeric check
 * silently fails open.
 *
 * Unlike the PATCH DTOs (FEAT-011 D4, FEAT-008 D6), absent-vs-null needs no
 * special handling here — a query string cannot carry null, only absence.
 */
export class SearchQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  due?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Choose a whole number for the page size.' })
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}
