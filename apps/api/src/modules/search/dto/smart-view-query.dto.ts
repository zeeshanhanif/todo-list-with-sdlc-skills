import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';

/**
 * Query parameters for `GET /views/{view}` (FEAT-016 technical-design §3.1).
 *
 * The same shallow shape as `SearchQueryDto`, and for the same reason: this
 * establishes *types* only, while the rules that must name a field in the error
 * — the limit's range, the cursor's decodability — live in `search.criteria.ts`
 * and are applied by `ViewsService` through the very same functions search uses.
 *
 * There is no `q`, no `status` and no `due`: a view **is** a fixed set of
 * criteria (D1), and the global `ValidationPipe` runs with `whitelist: true`, so
 * anything else a client sends is stripped rather than honoured.
 *
 * `@Type(() => Number)` is load-bearing: query strings arrive as text, so
 * without it `limit=25` reaches the service as `"25"` and every numeric check
 * silently fails open.
 */
export class SmartViewQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Choose a whole number for the page size.' })
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}
