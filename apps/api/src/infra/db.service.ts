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
/** A query executor bound to an open transaction (BEGIN/COMMIT/ROLLBACK).
 * Repositories accept this so registration's multi-table write is atomic (ADR-003). */
export interface TxClient {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
}

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

  /** Run `fn` inside a single transaction on one pooled connection: BEGIN,
   * then COMMIT if it resolves, or ROLLBACK if it throws (the error propagates). */
  async transaction<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const tx: TxClient = {
        query: (text, params) => client.query(text, params),
      };
      const result = await fn(tx);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
