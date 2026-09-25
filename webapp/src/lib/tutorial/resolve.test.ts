import { describe, expect, it } from 'vitest';
import {
	DEFAULT_TITLE,
	highlightRect,
	linkDescription,
	resolveTutorialCopy,
	tooltipPosition,
	type TutorialTarget
} from './resolve';
import { PAGE_DESCRIPTIONS, TUTORIAL_COPY } from './copy';

const base: TutorialTarget = { label: '', kind: 'button', pageTitle: 'Tessere' };

describe('resolveTutorialCopy', () => {
	it('gives precedence to explicit data-tutorial-title/description', () => {
		const copy = resolveTutorialCopy({
			...base,
			id: 'card.read',
			title: ' Leggi  badge ',
			description: 'Descrizione specifica',
			label: 'Leggi carta'
		});
		expect(copy).toEqual({ title: 'Leggi badge', description: 'Descrizione specifica' });
	});

	it('uses the id-keyed copy when no explicit text is present', () => {
		const copy = resolveTutorialCopy({ ...base, id: 'card.read', label: 'Lettura in corso...' });
		expect(copy.title).toBe(TUTORIAL_COPY['card.read'].title);
		expect(copy.description).toBe(TUTORIAL_COPY['card.read'].description);
	});

	it('keeps an explicit title while reading the description from the id', () => {
		const copy = resolveTutorialCopy({ ...base, id: 'copy', title: 'Copia token' });
		expect(copy).toEqual({
			title: 'Copia token',
			description: TUTORIAL_COPY.copy.description
		});
	});

	it('passes dialog and page titles to contextual copy', () => {
		expect(
			resolveTutorialCopy({ ...base, id: 'dialog.cancel', dialogTitle: 'Elimina iscritto' })
				.description
		).toContain('“Elimina iscritto”');
		expect(resolveTutorialCopy({ ...base, id: 'filter.reset' }).description).toContain('“Tessere”');
	});

	it('ignores unknown ids and falls back to the accessible label', () => {
		const copy = resolveTutorialCopy({ ...base, id: 'does-not-exist', label: 'Esegui' });
		expect(copy.title).toBe('Esegui');
		expect(copy.description).toContain('Avvia “Esegui”');
	});

	it('falls back to a default title', () => {
		expect(resolveTutorialCopy(base).title).toBe(DEFAULT_TITLE);
	});

	it('describes GET form submits as filters and other submits as confirmations', () => {
		expect(
			resolveTutorialCopy({ ...base, kind: 'submit', label: 'Filtra', getForm: true }).description
		).toContain('Aggiorna “Tessere”');
		expect(
			resolveTutorialCopy({
				...base,
				kind: 'submit',
				label: 'Salva',
				dialogTitle: 'Modifica dispositivo'
			}).description
		).toContain('in “Modifica dispositivo”');
	});

	it('describes fields by type', () => {
		expect(resolveTutorialCopy({ ...base, kind: 'email', label: 'Email' }).description).toBe(
			'Inserisci un indirizzo email valido nel campo “Email”.'
		);
		expect(resolveTutorialCopy({ ...base, kind: 'select', label: 'Stato' }).description).toContain(
			'“Stato”'
		);
	});
});

describe('linkDescription', () => {
	const internal = (path: string, search = '') => ({
		path,
		search,
		external: false,
		newTab: false
	});

	it('handles mailto and external links', () => {
		expect(
			linkDescription({ ...internal(''), external: true, mailto: 'a@b.it' }, 'a@b.it')
		).toContain('indirizzata a a@b.it');
		expect(linkDescription({ ...internal('/x'), external: true, newTab: true }, 'Sito')).toBe(
			'Apre il sito “Sito” in una nuova scheda.'
		);
	});

	it('matches parametric routes before page descriptions', () => {
		expect(linkDescription(internal('/subscribers/12'), 'Mario Rossi')).toContain(
			'scheda di Mario Rossi'
		);
		expect(linkDescription(internal('/subscribers/12/write-card'), 'Scrivi')).toContain(
			'associarla a questo iscritto'
		);
		expect(linkDescription(internal('/cards/3/erase/'), 'Cancella')).toContain('formattazione');
		expect(linkDescription(internal('/cards'), 'Tessere')).toBe(PAGE_DESCRIPTIONS['/cards']);
	});

	it('recognises reset and sort links on the current page', () => {
		const current = { path: '/subscribers', search: '?q=rossi' };
		expect(linkDescription(internal('/subscribers'), 'Azzera', current)).toContain(
			'Rimuove ricerca e filtri'
		);
		expect(linkDescription(internal('/subscribers', '?sort=email'), 'Email', current)).toContain(
			'ordinamento'
		);
		expect(
			linkDescription(internal('/subscribers'), 'Iscritti', { path: '/subscribers', search: '' })
		).toBe(PAGE_DESCRIPTIONS['/subscribers']);
	});

	it('uses a generic description for unknown pages', () => {
		expect(linkDescription(internal('/altro'), 'Altro')).toContain('Apre “Altro”');
	});
});

describe('geometry', () => {
	const viewport = { width: 1000, height: 800 };

	it('pads the highlight and keeps it inside the viewport', () => {
		expect(highlightRect({ top: 0, left: 0, width: 100, height: 20 }, viewport)).toEqual({
			top: 4,
			left: 4,
			width: 108,
			height: 28
		});
		expect(highlightRect({ top: 0, left: 0, width: 2000, height: 20 }, viewport)?.width).toBe(992);
	});

	it('returns null for hidden elements', () => {
		expect(highlightRect({ top: 10, left: 10, width: 0, height: 10 }, viewport)).toBeNull();
	});

	it('places the tooltip below, or above when there is no room', () => {
		expect(tooltipPosition({ top: 100, left: 50, width: 80, height: 30 }, viewport)).toEqual({
			top: 144,
			left: 50,
			width: 336
		});
		const above = tooltipPosition({ top: 700, left: 50, width: 80, height: 30 }, viewport);
		expect(above.top).toBe(700 - 190 - 14);
	});

	it('clamps the tooltip horizontally on narrow screens', () => {
		const pos = tooltipPosition(
			{ top: 100, left: 380, width: 10, height: 10 },
			{ width: 390, height: 800 }
		);
		expect(pos.width).toBe(336);
		expect(pos.left).toBe(390 - 336 - 12);
	});
});
