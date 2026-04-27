// Script to insert the first admin user into the DB
// Uses: SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD as environment variables
// Le variabili sono iniettate da ddev (web_environment) o esportate manualmente
import bcrypt from 'bcryptjs';
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { users } from '../src/lib/db/schema';
import { eq } from 'drizzle-orm';

const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;
const name = process.env.SEED_ADMIN_NAME || 'Administrator';

if (!email || !password) {
	console.error('Missing SEED_ADMIN_EMAIL or SEED_ADMIN_PASSWORD env vars');
	process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error('Missing DATABASE_URL env var');
	process.exit(1);
}

const connection = await mysql.createConnection(databaseUrl);
const db = drizzle(connection);

// Check if email already exists
const [existing] = await db
	.select({ id: users.id })
	.from(users)
	.where(eq(users.email, email))
	.limit(1);
if (existing) {
	console.log(`Admin user "${email}" already exists (id: ${existing.id}). Nothing to do.`);
	await connection.end();
	process.exit(0);
}

const passwordHash = await bcrypt.hash(password, 12);
await db.insert(users).values({ name, email, passwordHash, role: 'admin' });
console.log(`Admin user "${name}" <${email}> created successfully.`);
await connection.end();
