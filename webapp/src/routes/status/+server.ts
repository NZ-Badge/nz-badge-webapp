import { healthCheckResponse } from '$lib/services/health';

/** Alias of `/api/v1/health`, kept for existing probes: same `{ status }` body. */
export function GET(): Promise<Response> {
	return healthCheckResponse();
}
