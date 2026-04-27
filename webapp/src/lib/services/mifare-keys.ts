import { eq } from 'drizzle-orm';
import { db } from '$lib/db';
import { settings, mifareKeys } from '$lib/db/schema';

// ── Key generation helpers ───────────────────────────────────────────────────

function generateHexKey(): string {
	return Buffer.from(crypto.getRandomValues(new Uint8Array(6))).toString('hex');
}

// ── Global MIFARE Key Management ─────────────────────────────────────────────

const DEFAULT_KEY_NAME = 'default';
const SETTING_SINGLE_KEY = 'use_single_mifare_key';
const SETTING_USE_MIFARE = 'use_mifare';

export interface MifareKeyPair {
	keyA: string;
	keyB: string;
}

export interface MifareKeyConfig {
	useMifare: boolean;
	useSingleKey: boolean;
	keys: MifareKeyPair | null;
}

/**
 * Verifica se la modalità MIFARE è abilitata (scrittura chiavi su carta)
 */
export async function isMifareEnabled(): Promise<boolean> {
	const [setting] = await db
		.select()
		.from(settings)
		.where(eq(settings.key, SETTING_USE_MIFARE))
		.limit(1);

	return setting?.value === 'true';
}

/**
 * Verifica se è abilitata la modalità chiave unica
 */
export async function isSingleKeyModeEnabled(): Promise<boolean> {
	const [setting] = await db
		.select()
		.from(settings)
		.where(eq(settings.key, SETTING_SINGLE_KEY))
		.limit(1);

	return setting?.value === 'true';
}

/**
 * Abilita/disabilita la modalità chiave unica
 */
export async function setSingleKeyMode(enabled: boolean, userId?: number): Promise<void> {
	await db
		.update(settings)
		.set({
			value: String(enabled),
			updatedByUserId: userId
		})
		.where(eq(settings.key, SETTING_SINGLE_KEY));
}

/**
 * Recupera la coppia di chiavi globali (default)
 * Se non esistono o sono vuote, le genera automaticamente
 */
export async function getOrCreateGlobalKeys(): Promise<MifareKeyPair> {
	const [keyRecord] = await db
		.select()
		.from(mifareKeys)
		.where(eq(mifareKeys.name, DEFAULT_KEY_NAME))
		.limit(1);

	// Se esistono e hanno valori validi, le restituisco
	if (keyRecord && keyRecord.keyA && keyRecord.keyB && keyRecord.keyA.length === 12 && keyRecord.keyB.length === 12) {
		return {
			keyA: keyRecord.keyA,
			keyB: keyRecord.keyB
		};
	}

	// Altrimenti genero nuove chiavi
	const newKeyA = generateHexKey();
	const newKeyB = generateHexKey();

	if (keyRecord) {
		// Aggiorna record esistente
		await db
			.update(mifareKeys)
			.set({
				keyA: newKeyA,
				keyB: newKeyB,
				isActive: true
			})
			.where(eq(mifareKeys.id, keyRecord.id));
	} else {
		// Crea nuovo record
		await db.insert(mifareKeys).values({
			name: DEFAULT_KEY_NAME,
			keyA: newKeyA,
			keyB: newKeyB,
			isActive: true
		});
	}

	return { keyA: newKeyA, keyB: newKeyB };
}

/**
 * Recupera la configurazione completa delle chiavi MIFARE
 */
export async function getMifareKeyConfig(): Promise<MifareKeyConfig> {
	const useMifare = await isMifareEnabled();

	if (!useMifare) {
		return { useMifare, useSingleKey: false, keys: null };
	}

	const useSingleKey = await isSingleKeyModeEnabled();

	if (useSingleKey) {
		const keys = await getOrCreateGlobalKeys();
		return { useMifare, useSingleKey, keys };
	}

	return { useMifare, useSingleKey, keys: null };
}

/**
 * Rigenera le chiavi globali (utile se si vuole cambiare chiave)
 */
export async function regenerateGlobalKeys(): Promise<MifareKeyPair> {
	const newKeyA = generateHexKey();
	const newKeyB = generateHexKey();

	const [existing] = await db
		.select()
		.from(mifareKeys)
		.where(eq(mifareKeys.name, DEFAULT_KEY_NAME))
		.limit(1);

	if (existing) {
		await db
			.update(mifareKeys)
			.set({
				keyA: newKeyA,
				keyB: newKeyB
			})
			.where(eq(mifareKeys.id, existing.id));
	} else {
		await db.insert(mifareKeys).values({
			name: DEFAULT_KEY_NAME,
			keyA: newKeyA,
			keyB: newKeyB,
			isActive: true
		});
	}

	return { keyA: newKeyA, keyB: newKeyB };
}

/**
 * Recupera solo le chiavi globali (senza generarle se non esistono)
 */
export async function getGlobalKeys(): Promise<MifareKeyPair | null> {
	const [keyRecord] = await db
		.select()
		.from(mifareKeys)
		.where(eq(mifareKeys.name, DEFAULT_KEY_NAME))
		.limit(1);

	if (keyRecord && keyRecord.keyA && keyRecord.keyB) {
		return {
			keyA: keyRecord.keyA,
			keyB: keyRecord.keyB
		};
	}

	return null;
}
