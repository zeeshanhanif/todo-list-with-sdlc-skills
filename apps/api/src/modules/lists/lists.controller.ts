import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  LIST_ERROR_CODES,
  type CreateListResponse,
  type DeleteListResponse,
  type ListsResponse,
  type RenameListResponse,
  type ReorderListsResponse,
  type SessionUser,
} from '@todo/shared';
import { SessionGuard } from '../../common/authz/session.guard';
import { ChangeSignalInterceptor } from '../../common/realtime/change-signal.interceptor';
import { CurrentUser } from '../../common/authz/current-user.decorator';
import { ListsService } from './lists.service';
import { CreateListDto } from './dto/create-list.dto';
import { RenameListDto } from './dto/rename-list.dto';
import { ReorderListsDto } from './dto/reorder-lists.dto';
import {
  ListNameInvalidError,
  ListNotDeletableError,
  ListNotFoundError,
  ListOrderInvalidError,
} from './lists.errors';

// List endpoints (FR-LIST-*) — the first owned-data surface (FEAT-009).
// Every route is authenticated (FR-AUTHZ-001) and scoped to the session user;
// no owner id is ever read from a path, query or body (FR-AUTHZ-004). Ownership
// itself is enforced in ListsRepository (technical-design D3), which is why a
// list that is unknown and one that belongs to someone else arrive here as the
// same error and leave as the same 404 (FR-AUTHZ-003).
// Not rate-limited: FR-AUTH-018 / NFR-SEC-006 scope throttling to auth endpoints
// (technical-design §8).
@Controller('lists')
@UseGuards(SessionGuard)
@UseInterceptors(ChangeSignalInterceptor)
export class ListsController {
  constructor(private readonly lists: ListsService) {}

  // GET /lists (FR-LIST-005, FR-LIST-008; UC-008 main 1) — matches LISTS_PATH.
  @Get()
  async findAll(@CurrentUser() user: SessionUser): Promise<ListsResponse> {
    return { lists: await this.lists.listAll(user.id) };
  }

  // POST /lists (FR-LIST-001/002; UC-008 main 2-3) — matches LISTS_PATH.
  @Post()
  @HttpCode(201)
  async create(
    @Body() dto: CreateListDto,
    @CurrentUser() user: SessionUser,
  ): Promise<CreateListResponse> {
    try {
      return { list: await this.lists.create(user.id, dto.name) };
    } catch (err) {
      throw toHttp(err, 'name');
    }
  }

  // POST /lists/reorder (FR-LIST-008; UC-008 main 4-5) — matches
  // LIST_REORDER_PATH. Declared BEFORE the `:id` routes so the static segment is
  // not captured as an id (technical-design §3).
  @Post('reorder')
  @HttpCode(200)
  async reorder(
    @Body() dto: ReorderListsDto,
    @CurrentUser() user: SessionUser,
  ): Promise<ReorderListsResponse> {
    try {
      return { lists: await this.lists.reorder(user.id, dto.listIds) };
    } catch (err) {
      throw toHttp(err, 'listIds');
    }
  }

  // PATCH /lists/{id} (FR-LIST-006, FR-LIST-004 rename clause; UC-008 main 4).
  @Patch(':id')
  @HttpCode(200)
  async rename(
    @Param('id') id: string,
    @Body() dto: RenameListDto,
    @CurrentUser() user: SessionUser,
  ): Promise<RenameListResponse> {
    try {
      return { list: await this.lists.rename(user.id, id, dto.name) };
    } catch (err) {
      throw toHttp(err, 'name');
    }
  }

  // DELETE /lists/{id} (FR-LIST-007, FR-LIST-004; UC-008 alt 4a / exc-4b).
  // The contained tasks go with it, permanently (technical-design D4).
  @Delete(':id')
  @HttpCode(200)
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<DeleteListResponse> {
    try {
      const deletedTaskCount = await this.lists.delete(user.id, id);
      return { status: 'list_deleted', deletedTaskCount };
    } catch (err) {
      throw toHttp(err, 'name');
    }
  }
}

/** Map the module's domain errors onto the designed HTTP responses
 * (technical-design §3); the global filter renders the ApiError envelope.
 * `field` names the request field a validation failure belongs to. Anything
 * unrecognized is returned as-is → 500 internal_error via the filter. */
function toHttp(err: unknown, field: string): unknown {
  if (err instanceof ListNotFoundError) {
    return new NotFoundException({
      code: LIST_ERROR_CODES.listNotFound,
      message: err.message,
    });
  }
  if (err instanceof ListNotDeletableError) {
    return new ConflictException({
      code: LIST_ERROR_CODES.listNotDeletable,
      message: err.message,
    });
  }
  if (err instanceof ListNameInvalidError) {
    return new BadRequestException({
      code: 'validation_failed',
      message: 'Validation failed.',
      fields: [{ field, message: err.requirement }],
    });
  }
  if (err instanceof ListOrderInvalidError) {
    return new BadRequestException({
      code: 'validation_failed',
      message: 'Validation failed.',
      fields: [{ field, message: err.requirement }],
    });
  }
  return err;
}
