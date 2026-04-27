import { sql } from 'drizzle-orm';
import { db } from '$lib/db';

export async function GET(): Promise<Response> {
	const timestamp = new Date().toISOString();

	try {
		await db.execute(sql`SELECT 1`);
		return new Response(JSON.stringify({ status: 'ok', db: 'connected', timestamp }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return new Response(
			JSON.stringify({ status: 'error', db: 'unreachable', message, timestamp }),
			{ status: 503, headers: { 'Content-Type': 'application/json' } }
		);
	}
}
