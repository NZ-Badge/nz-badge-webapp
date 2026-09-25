<script lang="ts">
	import { tick } from 'svelte';
	import { CircleHelp, X } from '@lucide/svelte';
	import { INTERACTIVE_SELECTOR, readTutorialTarget } from '$lib/tutorial/dom';
	import {
		highlightRect,
		resolveTutorialCopy,
		tooltipPosition,
		type Rect,
		type TutorialCopy
	} from '$lib/tutorial/resolve';

	let { enabled, onDisable }: { enabled: boolean; onDisable: () => void } = $props();

	let activeElement = $state<HTMLElement | null>(null);
	let activeRect = $state<Rect | null>(null);
	let copy = $state<TutorialCopy | null>(null);
	let viewport = $state({ width: 0, height: 0 });
	let dialogElement = $state<HTMLElement | null>(null);
	let closeButton = $state<HTMLButtonElement | null>(null);

	const position = $derived(activeRect ? tooltipPosition(activeRect, viewport) : null);

	function updateRect() {
		if (!activeElement) return;
		if (!activeElement.isConnected) {
			closeExplanation({ restoreFocus: false });
			return;
		}
		viewport = { width: window.innerWidth, height: window.innerHeight };
		activeRect = highlightRect(activeElement.getBoundingClientRect(), viewport);
		if (!activeRect) closeExplanation({ restoreFocus: false });
	}

	/** Un dialog bits-ui aperto intrappola il focus: in quel caso lo lasciamo dov'è. */
	function insideModal(element: HTMLElement) {
		return Boolean(element.closest('[data-slot="dialog-content"], [role="alertdialog"]'));
	}

	async function openExplanation(element: HTMLElement) {
		activeElement?.classList.remove('tutorial-active');
		activeElement = element;
		element.classList.add('tutorial-active');
		copy = resolveTutorialCopy(readTutorialTarget(element));
		updateRect();
		await tick();
		if (!insideModal(element)) closeButton?.focus();
	}

	function closeExplanation({ restoreFocus = true } = {}) {
		const previous = activeElement;
		previous?.classList.remove('tutorial-active');
		activeElement = null;
		activeRect = null;
		copy = null;
		if (restoreFocus && previous?.isConnected && document.activeElement !== previous) {
			previous.focus();
		}
	}

	function handleClick(event: MouseEvent) {
		if (!enabled) return;
		const target = event.target;
		if (!(target instanceof Element) || target.closest('[data-tutorial-ignore]')) return;

		const interactive = target.closest<HTMLElement>(INTERACTIVE_SELECTOR);
		if (!interactive || interactive.getAttribute('aria-hidden') === 'true') return;

		event.preventDefault();
		event.stopImmediatePropagation();
		void openExplanation(interactive);
	}

	function focusableInDialog(): HTMLElement[] {
		return Array.from(dialogElement?.querySelectorAll<HTMLElement>('button, [href]') ?? []);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!activeElement) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopImmediatePropagation();
			closeExplanation();
			return;
		}
		// Trappola del focus finché la spiegazione è aperta (dialog modale).
		if (event.key === 'Tab' && dialogElement?.contains(document.activeElement)) {
			const items = focusableInDialog();
			if (items.length === 0) return;
			const first = items[0];
			const last = items[items.length - 1];
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		}
	}

	function disableTutorial() {
		closeExplanation();
		onDisable();
	}

	$effect(() => {
		document.documentElement.classList.toggle('tutorial-mode', enabled);
		if (!enabled) closeExplanation({ restoreFocus: false });
		return () => document.documentElement.classList.remove('tutorial-mode');
	});

	$effect(() => {
		// Rimuove l'evidenziazione se il componente viene smontato con una spiegazione aperta.
		return () => activeElement?.classList.remove('tutorial-active');
	});
</script>

<svelte:window
	onkeydowncapture={handleKeydown}
	onresize={updateRect}
	onscrollcapture={updateRect}
/>
<svelte:document onclickcapture={handleClick} />

{#if enabled && activeRect && copy && position}
	<div
		class="pointer-events-none fixed z-[60] rounded-md ring-4 ring-amber-400 ring-offset-2 ring-offset-transparent transition-all duration-150"
		style:top="{activeRect.top}px"
		style:left="{activeRect.left}px"
		style:width="{activeRect.width}px"
		style:height="{activeRect.height}px"
		style:box-shadow="0 0 0 9999px rgb(15 23 42 / 0.72)"
		aria-hidden="true"
	></div>

	<div
		bind:this={dialogElement}
		class="fixed z-[70] rounded-xl border border-amber-200 bg-card p-4 text-card-foreground shadow-2xl"
		style:top="{position.top}px"
		style:left="{position.left}px"
		style:width="{position.width}px"
		role="dialog"
		aria-modal="true"
		aria-labelledby="tutorial-title"
		aria-describedby="tutorial-description"
		data-tutorial-ignore
	>
		<div class="flex items-start gap-3">
			<div class="mt-0.5 rounded-lg bg-amber-100 p-2 text-amber-700">
				<CircleHelp size={19} aria-hidden="true" />
			</div>
			<div class="min-w-0 flex-1">
				<p class="text-xs font-semibold uppercase tracking-wide text-amber-700">Guida Tutorial</p>
				<h2 id="tutorial-title" class="mt-1 text-base font-semibold">{copy.title}</h2>
				<p id="tutorial-description" class="mt-2 text-sm leading-6 text-muted-foreground">
					{copy.description}
				</p>
			</div>
			<button
				bind:this={closeButton}
				type="button"
				class="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
				onclick={() => closeExplanation()}
				aria-label="Chiudi spiegazione"
			>
				<X size={18} aria-hidden="true" />
			</button>
		</div>
		<div class="mt-4 flex items-center justify-between border-t pt-3">
			<span class="text-xs text-muted-foreground"
				>Clicca un altro elemento evidenziato per scoprirlo.</span
			>
			<button
				type="button"
				class="ml-3 shrink-0 rounded-sm text-xs font-medium text-blue-700 hover:text-blue-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
				onclick={disableTutorial}
			>
				Termina
			</button>
		</div>
	</div>
{/if}
