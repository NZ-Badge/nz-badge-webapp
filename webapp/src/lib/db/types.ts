import type { MySql2Database } from 'drizzle-orm/mysql2';
import type * as schema from './schema';

/** Drizzle database bound to the application schema. */
export type AppDatabase = MySql2Database<typeof schema>;

/** Transaction handle passed to `db.transaction(async (tx) => …)`. */
export type DbTransaction = Parameters<Parameters<AppDatabase['transaction']>[0]>[0];

/** Anything that can run queries: the pool or an open transaction. */
export type DbOrTx = AppDatabase | DbTransaction;
