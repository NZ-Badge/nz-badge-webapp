/**
 * Standalone migration runner for production use.
 * Usage: tsx scripts/migrate.ts
 * Init container: npx tsx scripts/migrate.ts
 */
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface MigrationRow extends RowDataPacket {
	id: number;
	hash: string;
	created_at: number;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error('ERROR: DATABASE_URL environment variable is required');
	process.exit(1);
}

const migrationsFolder = path.join(__dirname, '../src/lib/db/migrations');

// Debug logging
console.log('Migration runner starting...');
console.log('Migrations folder:', migrationsFolder);

// Check if migrations folder exists
if (!fs.existsSync(migrationsFolder)) {
	console.error('ERROR: Migrations folder does not exist:', migrationsFolder);
	process.exit(1);
}

// List migration files
const files = fs.readdirSync(migrationsFolder).filter((f) => f.endsWith('.sql'));
console.log('Found migration files:', files);

// Check journal
const journalPath = path.join(migrationsFolder, 'meta', '_journal.json');
if (fs.existsSync(journalPath)) {
	const journal = JSON.parse(fs.readFileSync(journalPath, 'utf-8'));
	console.log('Journal entries:', journal.entries?.length || 0);
	console.log('Journal tags:', journal.entries?.map((e: { tag: string }) => e.tag).join(', '));
} else {
	console.warn('WARNING: Journal file not found at', journalPath);
}

console.log('Connecting to database...');
const connection = await mysql.createConnection(databaseUrl);

// Check existing migrations in DB
try {
	const [rows] = await connection.query<MigrationRow[]>(
		'SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY created_at'
	);
	console.log(
		'Existing migrations in DB:',
		rows.map((row) => `${row.id}:${row.created_at}`).join(', ') || 'none'
	);
} catch (e) {
	console.warn('Could not query existing migrations:', e);
}

try {
	const db = drizzle(connection);
	console.log('Running pending migrations...');

	const result = await migrate(db, { migrationsFolder });

	console.log('Migrations result:', result);
	console.log('Migrations complete.');
} catch (error) {
	console.error('Migration failed:', error);
	process.exit(1);
} finally {
	await connection.end();
}
