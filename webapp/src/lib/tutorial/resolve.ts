// Logica pura della guida Tutorial: nessun accesso al DOM, così è testabile in Node.

import {
	PAGE_DESCRIPTIONS,
	ROUTE_DESCRIPTIONS,
	TUTORIAL_COPY,
	type TutorialContext,
	type TutorialEntry
} from './copy';

export type TutorialCopy = { title: string; description: string };

export type TutorialElementKind =
	| 'link'
	| 'button'
	| 'submit'
	| 'switch'
	| 'checkbox'
	| 'radio'
	| 'file'
	| 'date'
	| 'datetime'
	| 'email'
	| 'password'
	| 'search'
	| 'text'
	| 'select'
	| 'textarea';

export type TutorialLink = {
	/** Percorso di destinazione senza slash finale. */
	path: string;
	search: string;
	external: boolean;
	newTab: boolean;
	mailto?: string;
};

/** Descrizione serializzabile dell'elemento cliccato, estratta dal DOM in `dom.ts`. */
export type TutorialTarget = {
	id?: string;
	title?: string;
	description?: string;
	/** Nome accessibile calcolato (label, aria-label, placeholder o testo). */
	label: string;
	kind: TutorialElementKind;
	link?: TutorialLink;
	/** Il pulsante invia un form in GET (filtri). */
	getForm?: boolean;
	dialogTitle?: string;
	pageTitle?: string;
	/** Pagina corrente, per riconoscere i link che azzerano i filtri. */
	currentPath?: string;
	currentSearch?: string;
};

export const DEFAULT_TITLE = 'Elemento interattivo';

export function compact(value: string | null | undefined): string {
	return (value ?? '').replace(/\s+/g, ' ').trim();
}

export function tutorialEntry(id: string | undefined): TutorialEntry | undefined {
	if (!id) return undefined;
	return (TUTORIAL_COPY as Record<string, TutorialEntry>)[id];
}

function entryDescription(entry: TutorialEntry | undefined, ctx: TutorialContext) {
	if (!entry) return undefined;
	return typeof entry.description === 'function' ? entry.description(ctx) : entry.description;
}

export function normalizePath(path: string): string {
	return path.replace(/\/+$/, '') || '/';
}

export function linkDescription(
	link: TutorialLink,
	title: string,
	current?: { path?: string; search?: string }
): string {
	if (link.mailto !== undefined) {
		return `Prepara una nuova email indirizzata a ${link.mailto} nel programma di posta del dispositivo.`;
	}
	if (link.external) {
		return `Apre il sito “${title}”${link.newTab ? ' in una nuova scheda' : ''}.`;
	}

	const path = normalizePath(link.path);
	if (current?.path && normalizePath(current.path) === path) {
		if (!link.search && current.search) {
			return 'Rimuove ricerca e filtri e mostra di nuovo l’elenco completo.';
		}
		if (link.search) {
			return 'Aggiorna l’elenco di questa pagina con l’ordinamento o la vista indicati.';
		}
	}

	for (const [pattern, describe] of ROUTE_DESCRIPTIONS) {
		if (pattern.test(path)) return describe(title);
	}
	return (
		PAGE_DESCRIPTIONS[path] ??
		`Apre “${title}” per continuare da una pagina dedicata senza modificare i dati attuali.`
	);
}

export function kindDescription(target: TutorialTarget, ctx: TutorialContext): string {
	const { title } = ctx;
	switch (target.kind) {
		case 'submit':
			if (target.getForm) {
				return `Aggiorna “${ctx.pageTitle}” mostrando soltanto i risultati che corrispondono ai criteri inseriti.`;
			}
			return ctx.dialogTitle
				? `Controlla i dati inseriti e conferma “${title}” in “${ctx.dialogTitle}”. Se qualcosa non è valido, il modulo indica cosa correggere.`
				: `Controlla i dati inseriti e conferma “${title}”. Se qualcosa non è valido, resterai nella pagina con le indicazioni da correggere.`;
		case 'switch':
			return `Decide se usare “${title}”. La scelta diventa effettiva quando salvi le impostazioni.`;
		case 'checkbox':
		case 'radio':
			return `Scegli questa opzione per includere “${title}” nella ricerca o nell’operazione.`;
		case 'file':
			return `Scegli dal dispositivo il file richiesto per “${title}”. Prima di continuare, controlla formato e versione.`;
		case 'date':
			return `Scegli la data da usare per “${title}”.`;
		case 'datetime':
			return `Scegli data e ora da usare per “${title}”.`;
		case 'email':
			return `Inserisci un indirizzo email valido nel campo “${title}”.`;
		case 'password':
			return `Inserisci il valore riservato richiesto da “${title}”. I caratteri restano nascosti mentre scrivi.`;
		case 'search':
			return `Scrivi una o più parole per cercare in “${title}”; poi applica il filtro per aggiornare i risultati.`;
		case 'select':
			return `Scegli il valore più adatto per “${title}”. La selezione verrà applicata quando salvi o filtri.`;
		case 'textarea':
			return `Aggiungi in “${title}” le informazioni che possono essere utili a chi consulterà questi dati.`;
		case 'text':
			return `Inserisci il dato richiesto in “${title}”. Il valore verrà usato quando confermi il modulo.`;
		case 'link':
		case 'button':
		default:
			return ctx.dialogTitle
				? `Esegue “${title}” nella finestra “${ctx.dialogTitle}”. Prima di modificare dati importanti, la webapp mostra una conferma o il risultato dell’operazione.`
				: `Avvia “${title}”. Prima di modificare dati importanti, la webapp mostra una conferma o il risultato dell’operazione.`;
	}
}

/**
 * Priorità: attributi espliciti dell'elemento, voce `data-tutorial` in TUTORIAL_COPY,
 * destinazione del link, descrizione generica per tipo di elemento.
 */
export function resolveTutorialCopy(target: TutorialTarget): TutorialCopy {
	const entry = tutorialEntry(target.id);
	const title = compact(target.title) || entry?.title || compact(target.label) || DEFAULT_TITLE;
	const ctx: TutorialContext = {
		title,
		dialogTitle: compact(target.dialogTitle) || undefined,
		pageTitle: compact(target.pageTitle) || 'questa pagina'
	};

	const description =
		compact(target.description) ||
		entryDescription(entry, ctx) ||
		(target.link
			? linkDescription(target.link, title, {
					path: target.currentPath,
					search: target.currentSearch
				})
			: kindDescription(target, ctx));

	return { title, description };
}

// ─── Geometria ────────────────────────────────────────────────────────────────

export type Rect = { top: number; left: number; width: number; height: number };
export type Viewport = { width: number; height: number };

const HIGHLIGHT_PADDING = 4;
const TOOLTIP_MAX_WIDTH = 336;
const TOOLTIP_MARGIN = 14;
const TOOLTIP_EDGE = 12;
/** Altezza stimata del fumetto, usata per decidere se mostrarlo sopra l'elemento. */
export const TOOLTIP_ESTIMATED_HEIGHT = 190;

/** Riquadro evidenziato attorno all'elemento; `null` se l'elemento non è visibile. */
export function highlightRect(rect: Rect, viewport: Viewport): Rect | null {
	if (rect.width === 0 || rect.height === 0) return null;
	return {
		top: Math.max(HIGHLIGHT_PADDING, rect.top - HIGHLIGHT_PADDING),
		left: Math.max(HIGHLIGHT_PADDING, rect.left - HIGHLIGHT_PADDING),
		width: Math.min(viewport.width - HIGHLIGHT_PADDING * 2, rect.width + HIGHLIGHT_PADDING * 2),
		height: Math.min(viewport.height - HIGHLIGHT_PADDING * 2, rect.height + HIGHLIGHT_PADDING * 2)
	};
}

/** Posizione del fumetto: sotto l'elemento, oppure sopra se non c'è spazio. */
export function tooltipPosition(
	rect: Rect,
	viewport: Viewport,
	tooltipHeight = TOOLTIP_ESTIMATED_HEIGHT
): { top: number; left: number; width: number } {
	const width = Math.min(TOOLTIP_MAX_WIDTH, viewport.width - TOOLTIP_EDGE * 2);
	const left = Math.min(Math.max(TOOLTIP_EDGE, rect.left), viewport.width - width - TOOLTIP_EDGE);
	let top = rect.top + rect.height + TOOLTIP_MARGIN;
	if (top + tooltipHeight > viewport.height) {
		top = Math.max(TOOLTIP_EDGE, rect.top - tooltipHeight - TOOLTIP_MARGIN);
	}
	return { top, left, width };
}
