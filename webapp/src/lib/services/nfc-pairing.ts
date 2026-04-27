const PAIRING_TTL_MS = 60_000;

interface PairingSession {
	subscriberId: number;
	expiresAt: number;
	status: 'pending' | 'completed';
	pairedUid?: string;
}

// In-memory store: one active session per subscriber
const sessions = new Map<number, PairingSession>();

function purgeExpired() {
	const now = Date.now();
	for (const [id, session] of sessions) {
		if (session.status === 'pending' && now > session.expiresAt) {
			sessions.delete(id);
		}
	}
}

export function startPairing(subscriberId: number): number {
	purgeExpired();
	const expiresAt = Date.now() + PAIRING_TTL_MS;
	sessions.set(subscriberId, { subscriberId, expiresAt, status: 'pending' });
	return expiresAt;
}

export function getPairingStatus(subscriberId: number): {
	status: 'pending' | 'completed' | 'expired';
	pairedUid?: string;
	expiresAt?: number;
} {
	const session = sessions.get(subscriberId);
	if (!session) return { status: 'expired' };
	if (session.status === 'pending' && Date.now() > session.expiresAt) {
		sessions.delete(subscriberId);
		return { status: 'expired' };
	}
	return { status: session.status, pairedUid: session.pairedUid, expiresAt: session.expiresAt };
}

/**
 * Called from attendance processing when an unknown UID is scanned.
 * If there is an active pending session, claims it and returns the subscriberId.
 */
export function tryClaimPairing(uid: string): number | null {
	purgeExpired();
	for (const [subscriberId, session] of sessions) {
		if (session.status === 'pending') {
			session.status = 'completed';
			session.pairedUid = uid;
			return subscriberId;
		}
	}
	return null;
}

export function cancelPairing(subscriberId: number): void {
	sessions.delete(subscriberId);
}
