import { healthCheckResponse } from '$lib/services/health';

/** Health check (Dockerfile HEALTHCHECK, k3s probes): `{ status: 'ok' | 'error' }`. */
export function GET(): Promise<Response> {
	return healthCheckResponse();
}
