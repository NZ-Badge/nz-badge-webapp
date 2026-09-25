/**
 * Rate limiter in memoria per richieste dei dispositivi (finestra mobile).
 *
 * Ogni endpoint crea la propria istanza, cosi' i contatori restano separati per endpoint
 * (es. `attendance` e `attendance/batch`). Lo stato e' locale al processo: con piu' repliche
 * il limite vale per singola replica (vedi TODO punto 8).
 */
export interface DeviceRateLimiter {
	/** Registra una richiesta e restituisce true se il limite e' superato. */
	isLimited(deviceId: string): boolean;
}

export function createDeviceRateLimiter(
	maxRequests = 10,
	windowMs = 1000,
	now: () => number = Date.now
): DeviceRateLimiter {
	const deviceRequestLog = new Map<string, number[]>();

	return {
		isLimited(deviceId: string): boolean {
			const current = now();
			const timestamps = (deviceRequestLog.get(deviceId) ?? []).filter(
				(t) => current - t < windowMs
			);
			timestamps.push(current);
			deviceRequestLog.set(deviceId, timestamps);
			return timestamps.length > maxRequests;
		}
	};
}
