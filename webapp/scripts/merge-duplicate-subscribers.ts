/**
 * Unisce i subscriber duplicati (stessa persona importata una volta per ogni corso).
 *
 * Uso:
 *   DATABASE_URL=... npm run db:merge-duplicate-subscribers            # anteprima, non modifica nulla
 *   DATABASE_URL=... npm run db:merge-duplicate-subscribers -- --apply  # esegue l'unione
 *
 * Opzioni:
 *   --apply        esegue l'unione (senza, è solo un'anteprima)
 *   --only=ID,...  limita l'operazione ai gruppi che contengono questi subscriber
 *   --user-id=ID   utente admin a cui attribuire l'operazione nell'audit log
 *
 * I gruppi con conflitti (più card attive, codici fiscali diversi) vengono solo segnalati
 * e vanno sistemati a mano. Fare un backup del database prima di usare --apply.
 */
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from '../src/lib/db/schema';
import {
	applySubscriberMerge,
	planDuplicateSubscriberMerges,
	SubscriberMergeSkippedError,
	type MergeCandidate,
	type MergePlan
} from '../src/lib/services/subscriber-merge';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
	console.error('Missing DATABASE_URL env var');
	process.exit(1);
}

interface Args {
	apply: boolean;
	only: Set<number> | null;
	userId?: number;
}

function parsePositiveInt(value: string, option: string): number {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${option} richiede id numerici`);
	return parsed;
}

function parseArgs(args: string[]): Args {
	const parsed: Args = { apply: false, only: null };

	for (const arg of args) {
		if (arg === '--apply') {
			parsed.apply = true;
		} else if (arg.startsWith('--only=')) {
			parsed.only = new Set(
				arg
					.slice('--only='.length)
					.split(',')
					.map((id) => parsePositiveInt(id.trim(), '--only'))
			);
		} else if (arg.startsWith('--user-id=')) {
			parsed.userId = parsePositiveInt(arg.slice('--user-id='.length), '--user-id');
		} else {
			throw new Error(`Argomento non riconosciuto: ${arg}`);
		}
	}

	return parsed;
}

// Non importare `maskEmail` da utils/security: quel modulo avvia un setInterval
// (rate limiter) che impedirebbe allo script di terminare.
function maskEmail(email: string): string {
	const [local = '', domain = ''] = email.split('@');
	return `${local.charAt(0)}***@${domain}`;
}

function describe(candidate: MergeCandidate): string {
	const cards = [
		candidate.activeRfidCards ? `${candidate.activeRfidCards} RFID` : '',
		candidate.activeNfcCards ? `${candidate.activeNfcCards} NFC` : ''
	]
		.filter(Boolean)
		.join(', ');
	return [
		`#${candidate.id}`,
		`${candidate.firstName} ${candidate.lastName}`,
		maskEmail(candidate.email),
		candidate.taxId ? `CF ${candidate.taxId.slice(0, 6)}…` : 'CF —',
		`stato ${candidate.status ?? '—'}`,
		`${candidate.enrollmentCount} iscrizioni`,
		`card attive: ${cards || 'nessuna'}`
	].join(' · ');
}

function printPlan(plan: MergePlan, index: number): void {
	console.log(`\nGruppo ${index + 1}${plan.conflicts.length ? '  [CONFLITTO]' : ''}`);
	console.log(`  mantiene  ${describe(plan.survivor)}`);
	for (const duplicate of plan.duplicates) console.log(`  unisce    ${describe(duplicate)}`);
	const updated = Object.keys(plan.survivorUpdate);
	if (updated.length) console.log(`  aggiorna  ${updated.join(', ')}`);
	for (const conflict of plan.conflicts) console.log(`  conflitto ${conflict}`);
}

let args: Args;
try {
	args = parseArgs(process.argv.slice(2));
} catch (err) {
	console.error(err instanceof Error ? err.message : 'Invalid arguments');
	process.exit(1);
}

const connection = await mysql.createConnection(databaseUrl);

try {
	const db = drizzle(connection, { schema, mode: 'default' });
	const only = args.only;
	const plans = (await planDuplicateSubscriberMerges(db)).filter(
		(plan) =>
			!only ||
			only.has(plan.survivor.id) ||
			plan.duplicates.some((duplicate) => only.has(duplicate.id))
	);

	if (plans.length === 0) {
		console.log('Nessun subscriber duplicato trovato.');
	} else {
		plans.forEach(printPlan);
		const mergeable = plans.filter((plan) => plan.conflicts.length === 0);
		const subscribersToRemove = mergeable.reduce((sum, plan) => sum + plan.duplicates.length, 0);
		console.log(
			`\n${plans.length} gruppi trovati: ${mergeable.length} unibili ` +
				`(${subscribersToRemove} subscriber da rimuovere), ${plans.length - mergeable.length} con conflitti.`
		);

		if (!args.apply) {
			console.log('Anteprima: nessuna modifica. Rilancia con --apply per eseguire.');
		} else {
			let merged = 0;
			let failed = 0;
			for (const plan of mergeable) {
				try {
					const result = await applySubscriberMerge(db, plan, args.userId);
					merged++;
					console.log(
						`Unito in #${result.survivorId}: ${result.mergedIds.map((id) => `#${id}`).join(', ')} ` +
							`(${result.moved.enrollments} iscrizioni, ${result.moved.cards} card, ` +
							`${result.moved.attendance} presenze, ${result.moved.weeklySummaries} riepiloghi spostati` +
							`${result.droppedWeeklySummaries ? `, ${result.droppedWeeklySummaries} riepiloghi doppi rimossi` : ''})`
					);
				} catch (err) {
					failed++;
					const reason =
						err instanceof SubscriberMergeSkippedError ? err.message : 'errore del database';
					console.error(`Gruppo #${plan.survivor.id} non unito: ${reason}`);
					if (!(err instanceof SubscriberMergeSkippedError)) console.error(err);
				}
			}
			console.log(`\nCompletato: ${merged} gruppi uniti, ${failed} non uniti.`);
			process.exitCode = failed > 0 ? 1 : 0;
		}
	}
} catch (err) {
	console.error(err instanceof Error ? err.message : err);
	process.exitCode = 1;
} finally {
	await connection.end();
}
