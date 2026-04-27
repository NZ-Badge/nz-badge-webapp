import { sql } from 'drizzle-orm';
import { db } from '$lib/db';

/**
 * Health check endpoint for k3s/liveness and readiness probes.
 * Returns 200 if the application and database are healthy.
 * Returns 503 if the database is unreachable.
 */
export async function GET(): Promise<Response> {
	try {
		await db.execute(sql`SELECT 1`);
		return new Response(
			JSON.stringify({
				status: 'healthy',
				database: 'connected',
				timestamp: new Date().toISOString()
			}),
			{
				status: 200,
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'no-cache, no-store, must-revalidate'
				}
			}
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return new Response(
			JSON.stringify({
				status: 'unhealthy',
				database: 'disconnected',
				message,
				timestamp: new Date().toISOString()
			}),
			{
				status: 503,
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'no-cache, no-store, must-revalidate'
				}
			}
		);
	}
}
