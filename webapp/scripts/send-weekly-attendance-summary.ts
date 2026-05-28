import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { fromZonedTime } from 'date-fns-tz';
import * as schema from '../src/lib/db/schema';
import { sendWeeklyAttendanceSummaries } from '../src/lib/services/weekly-attendance-summary';
import { TIMEZONE } from '../src/lib/utils/date';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
	console.error('Missing DATABASE_URL env var');
	process.exit(1);
}

function parseArgs(args: string[]): { force: boolean; dryRun: boolean; referenceDate?: Date } {
	let referenceDate: Date | undefined;
	let force = false;
	let dryRun = false;

	for (const arg of args) {
		if (arg === '--force') {
			force = true;
			continue;
		}

		if (arg === '--dry-run') {
			dryRun = true;
			continue;
		}

		if (arg.startsWith('--date=')) {
			const dateKey = arg.slice('--date='.length);
			if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
				throw new Error('--date deve usare il formato YYYY-MM-DD');
			}
			referenceDate = fromZonedTime(`${dateKey}T12:00:00.000`, TIMEZONE);
			continue;
		}

		throw new Error(`Argomento non riconosciuto: ${arg}`);
	}

	return { force, dryRun, referenceDate };
}

let args: ReturnType<typeof parseArgs>;
try {
	args = parseArgs(process.argv.slice(2));
} catch (err) {
	console.error(err instanceof Error ? err.message : 'Invalid arguments');
	process.exit(1);
}

const connection = await mysql.createConnection(databaseUrl);

try {
	const db = drizzle(connection, { schema, mode: 'default' });
	const result = await sendWeeklyAttendanceSummaries(db, args);

	console.log(JSON.stringify(result, null, 2));
	process.exitCode = result.errors > 0 ? 1 : 0;
} catch (err) {
	console.error(err instanceof Error ? err.message : err);
	process.exitCode = 1;
} finally {
	await connection.end();
}
