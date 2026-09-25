import { sql } from 'drizzle-orm';
import { db } from '$lib/db';
import { createLogger } from '$lib/server/logger';

const log = createLogger('health');

/**
 * Liveness/readiness probe shared by `/api/v1/health` (canonical) and `/status` (alias).
 * Public endpoint: the body only carries the status; database errors go to the log.
 */
export async function healthCheckResponse(): Promise<Response> {
	let healthy = true;
	try {
		await db.execute(sql`SELECT 1`);
	} catch (err) {
		healthy = false;
		log.error('Database health check failed', { err });
	}

	return new Response(JSON.stringify({ status: healthy ? 'ok' : 'error' }), {
		status: healthy ? 200 : 503,
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'no-cache, no-store, must-revalidate'
		}
	});
}
