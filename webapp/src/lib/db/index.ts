import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

// Singleton to avoid multiple pools during SSR hot-reload in development
declare global {
	var __db: ReturnType<typeof drizzle> | undefined;
}

function createDb() {
	const pool = mysql.createPool({
		uri: env.DATABASE_URL,
		connectionLimit: 10,
		waitForConnections: true,
		queueLimit: 0
	});
	return drizzle(pool, { schema, mode: 'default' });
}

export const db = globalThis.__db ?? (globalThis.__db = createDb());
