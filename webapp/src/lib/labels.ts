// Etichette italiane e varianti dei badge condivise tra le pagine.

import type { BadgeVariant } from '$lib/components/ui/badge';

type LabelWithVariant = { label: string; variant: BadgeVariant };

function describe<K extends string>(
	map: Record<K, LabelWithVariant>,
	value: string | null | undefined,
	fallbackVariant: BadgeVariant = 'outline'
): LabelWithVariant {
	if (value && value in map) return map[value as K];
	return { label: value || '—', variant: fallbackVariant };
}

// ─── Tessere ──────────────────────────────────────────────────────────────────

export type CardStatus = 'active' | 'disabled' | 'replaced' | 'lost' | 'deleted';

export const CARD_STATUS: Record<CardStatus, LabelWithVariant> = {
	active: { label: 'Attiva', variant: 'positive' },
	disabled: { label: 'Disabilitata', variant: 'secondary' },
	replaced: { label: 'Sostituita', variant: 'outline' },
	lost: { label: 'Smarrita', variant: 'destructive' },
	deleted: { label: 'Eliminata', variant: 'destructive' }
};

/** Stati selezionabili nel filtro delle tessere non cancellate. */
export const CARD_FILTER_STATUSES = ['active', 'disabled', 'replaced', 'lost'] as const;

export function cardStatus(status: string | null | undefined): LabelWithVariant {
	return describe(CARD_STATUS, status);
}

// ─── Iscritti ─────────────────────────────────────────────────────────────────

export type SubscriberStatus = 'active' | 'completed' | 'suspended' | 'cancelled';

export const SUBSCRIBER_STATUS: Record<SubscriberStatus, LabelWithVariant> = {
	active: { label: 'Attivo', variant: 'positive' },
	completed: { label: 'Completato', variant: 'secondary' },
	suspended: { label: 'Sospeso', variant: 'warning' },
	cancelled: { label: 'Annullato', variant: 'destructive' }
};

export const SUBSCRIBER_STATUSES = Object.keys(SUBSCRIBER_STATUS) as SubscriberStatus[];

export function subscriberStatus(status: string | null | undefined): LabelWithVariant {
	return describe(SUBSCRIBER_STATUS, status, 'destructive');
}

// ─── Ingressi e uscite ───────────────────────────────────────────────────────

export type EventType = 'entry' | 'exit';

export const EVENT_TYPE: Record<EventType, LabelWithVariant & { lower: string }> = {
	entry: { label: 'Ingresso', lower: 'ingresso', variant: 'default' },
	exit: { label: 'Uscita', lower: 'uscita', variant: 'secondary' }
};

export function eventType(value: string | null | undefined) {
	return EVENT_TYPE[value === 'entry' ? 'entry' : 'exit'];
}

// ─── Ruoli e dispositivi ──────────────────────────────────────────────────────

export const USER_ROLE_LABEL: Record<string, string> = {
	admin: 'Amministratore',
	staff: 'Operatore',
	collaborator: 'Collaboratore'
};

export const DEVICE_TYPE: Record<'reader' | 'writer', LabelWithVariant> = {
	reader: { label: 'Reader', variant: 'default' },
	writer: { label: 'Writer', variant: 'secondary' }
};
