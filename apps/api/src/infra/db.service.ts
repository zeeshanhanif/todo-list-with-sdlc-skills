import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import { loadConfig } from './config';

/**
 * Thin Postgres access wrapper (ADR-003). In cloud environments the connection
 * string points at Supabase's pooler (Supavisor); locally it's the
 * docker-compose Postgres. Domain repositories (added per-slice) depend on this,
 * keeping provider specifics in one place.
 */
@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DbService.name);
  private readonly pool: Pool;

  constructor() {
    this.pool = new Pool({ connectionString: loadConfig().databaseUrl });
  }

  async onModuleInit(): Promise<void> {
    await this.pool.query('SELECT 1');
    this.logger.log(JSON.stringify({ msg: 'db pool ready' }));
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }
}
