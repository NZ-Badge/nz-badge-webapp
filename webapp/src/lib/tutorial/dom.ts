// Estrazione dal DOM dei dati che servono a `resolveTutorialCopy`. Legge solo attributi
// strutturali (data-tutorial-*, label, aria-label, tipo di elemento): nessun testo è
// interpretato per indovinare la funzione di un elemento.

import { compact, type TutorialElementKind, type TutorialTarget } from './resolve';

export const INTERACTIVE_SELECTOR = [
	'a[href]',
	'button:not([disabled])',
	'input:not([type="hidden"]):not([disabled])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'[role="button"]',
	'[role="menuitem"]',
	'[role="switch"]',
	'[role="checkbox"]',
	'[role="spinbutton"]'
].join(',');

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function isField(element: Element): element is Field {
	return (
		element instanceof HTMLInputElement ||
		element instanceof HTMLSelectElement ||
		element instanceof HTMLTextAreaElement
	);
}

function labelText(label: HTMLElement | null | undefined): string {
	return compact(label?.innerText);
}

function associatedLabel(element: HTMLElement): string {
	const wrapping = labelText(element.closest<HTMLLabelElement>('label'));
	if (wrapping) return wrapping;

	const target = element.id || (isField(element) ? element.name : '');
	if (!target) return '';
	return labelText(document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(target)}"]`));
}

function labelledBy(element: HTMLElement): string {
	const ids = element.getAttribute('aria-labelledby');
	if (!ids) return '';
	return compact(
		ids
			.split(/\s+/)
			.map((id) => document.getElementById(id)?.innerText ?? '')
			.join(' ')
	);
}

/** Nome accessibile semplificato, nello stesso ordine usato dalle tecnologie assistive. */
export function accessibleLabel(element: HTMLElement): string {
	return (
		labelledBy(element) ||
		compact(element.getAttribute('aria-label')) ||
		associatedLabel(element) ||
		(isField(element) ? compact(element.getAttribute('placeholder')) : '') ||
		compact(element.innerText) ||
		compact(element.getAttribute('title'))
	);
}

function elementKind(element: HTMLElement): TutorialElementKind {
	if (element.closest('a[href]')) return 'link';
	const role = element.getAttribute('role');
	if (role === 'switch') return 'switch';
	if (role === 'checkbox') return 'checkbox';
	if (element instanceof HTMLSelectElement) return 'select';
	if (element instanceof HTMLTextAreaElement) return 'textarea';
	if (element instanceof HTMLInputElement) {
		switch (element.type) {
			case 'checkbox':
			case 'radio':
			case 'file':
			case 'date':
			case 'email':
			case 'password':
			case 'search':
				return element.type;
			case 'datetime-local':
				return 'datetime';
			case 'submit':
				return 'submit';
			default:
				return element.placeholder?.toLocaleLowerCase('it-IT').includes('cerca')
					? 'search'
					: 'text';
		}
	}
	if (element instanceof HTMLButtonElement && element.type === 'submit' && element.form) {
		return 'submit';
	}
	return 'button';
}

function dialogTitle(element: HTMLElement): string {
	return compact(
		element
			.closest<HTMLElement>('[role="dialog"], [data-slot="dialog-content"]')
			?.querySelector<HTMLElement>('[data-slot="dialog-title"], h2, h3')?.innerText
	);
}

function closestData(element: HTMLElement, attribute: string): string | undefined {
	return element.closest<HTMLElement>(`[${attribute}]`)?.getAttribute(attribute) ?? undefined;
}

export function readTutorialTarget(element: HTMLElement): TutorialTarget {
	const anchor = element.closest<HTMLAnchorElement>('a[href]');
	const kind = elementKind(element);
	const form =
		element instanceof HTMLButtonElement || element instanceof HTMLInputElement
			? element.form
			: null;

	let link: TutorialTarget['link'];
	if (anchor) {
		const href = anchor.getAttribute('href') ?? '';
		if (href.startsWith('mailto:')) {
			link = {
				path: '',
				search: '',
				external: true,
				newTab: false,
				mailto: href.slice('mailto:'.length)
			};
		} else {
			const url = new URL(anchor.href, window.location.href);
			link = {
				path: url.pathname,
				search: url.search,
				external: url.origin !== window.location.origin,
				newTab: anchor.target === '_blank'
			};
		}
	}

	return {
		id: closestData(element, 'data-tutorial'),
		title: closestData(element, 'data-tutorial-title'),
		description: closestData(element, 'data-tutorial-description'),
		label: accessibleLabel(element),
		kind,
		link,
		getForm: kind === 'submit' && form?.method.toLowerCase() === 'get',
		dialogTitle: dialogTitle(element),
		pageTitle: compact(document.querySelector<HTMLElement>('main h1')?.innerText),
		currentPath: window.location.pathname,
		currentSearch: window.location.search
	};
}
