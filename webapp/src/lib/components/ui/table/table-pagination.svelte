<script lang="ts">
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';

	type Props = {
		page: number;
		totalPages: number;
		total: number;
		getPageHref?: (page: number) => string;
		onPageChange?: (page: number) => void;
		disabled?: boolean;
		ariaLabel?: string;
	};

	let {
		page,
		totalPages,
		total,
		getPageHref,
		onPageChange,
		disabled = false,
		ariaLabel = 'Paginazione'
	}: Props = $props();

	const normalizedTotalPages = $derived(Math.max(1, totalPages));
	const normalizedPage = $derived(Math.min(Math.max(1, page), normalizedTotalPages));

	function getPageNumbers(current: number, pageCount: number): (number | null)[] {
		if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);

		const pages = new Set<number>([1, pageCount]);
		for (
			let pageNumber = Math.max(2, current - 2);
			pageNumber <= Math.min(pageCount - 1, current + 2);
			pageNumber++
		) {
			pages.add(pageNumber);
		}

		const sorted = [...pages].sort((left, right) => left - right);
		const result: (number | null)[] = [];
		for (let index = 0; index < sorted.length; index++) {
			if (index > 0 && sorted[index] - sorted[index - 1] > 1) result.push(null);
			result.push(sorted[index]);
		}

		return result;
	}

	function selectPage(pageNumber: number) {
		if (disabled || pageNumber === normalizedPage) return;
		onPageChange?.(pageNumber);
	}
</script>

<footer data-slot="table-panel-footer">
	<span class="text-muted-foreground">
		Pagina <strong class="text-foreground">{normalizedPage}</strong> di {normalizedTotalPages} · {total}
		totali
	</span>
	{#if normalizedTotalPages > 1}
		<nav class="flex flex-wrap items-center gap-1.5" aria-label={ariaLabel}>
			<Button
				href={getPageHref?.(normalizedPage - 1)}
				onclick={getPageHref ? undefined : () => selectPage(normalizedPage - 1)}
				variant="outline"
				size="sm"
				disabled={disabled || normalizedPage <= 1}
				data-tutorial-title="Pagina precedente"
				data-tutorial-description="Mostra la pagina precedente mantenendo i filtri correnti."
			>
				<ChevronLeft size={14} /> Precedente
			</Button>

			{#each getPageNumbers(normalizedPage, normalizedTotalPages) as pageNumber}
				{#if pageNumber === null}
					<span class="px-1 text-muted-foreground" aria-hidden="true">…</span>
				{:else if pageNumber === normalizedPage}
					<span
						class="grid size-8 place-items-center rounded-md bg-blue-600 text-sm font-semibold text-white"
						aria-current="page"
					>
						{pageNumber}
					</span>
				{:else}
					<Button
						href={getPageHref?.(pageNumber)}
						onclick={getPageHref ? undefined : () => selectPage(pageNumber)}
						variant="outline"
						size="icon-sm"
						{disabled}
						aria-label={`Vai a pagina ${pageNumber}`}
						data-tutorial-title={`Pagina ${pageNumber}`}
						data-tutorial-description="Mostra questa pagina mantenendo i filtri correnti."
					>
						{pageNumber}
					</Button>
				{/if}
			{/each}

			<Button
				href={getPageHref?.(normalizedPage + 1)}
				onclick={getPageHref ? undefined : () => selectPage(normalizedPage + 1)}
				variant="outline"
				size="sm"
				disabled={disabled || normalizedPage >= normalizedTotalPages}
				data-tutorial-title="Pagina successiva"
				data-tutorial-description="Mostra la pagina successiva mantenendo i filtri correnti."
			>
				Successiva <ChevronRight size={14} />
			</Button>
		</nav>
	{/if}
</footer>
