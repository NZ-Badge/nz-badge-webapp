<script lang="ts">
	import type { Snippet } from 'svelte';
	import { LayoutDashboard, Shield } from '@lucide/svelte';

	let {
		title,
		description,
		children,
		summary
	}: {
		title: string;
		description: string;
		children?: Snippet;
		summary?: Snippet;
	} = $props();
</script>

<header class="page-header">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="flex w-full min-w-0 items-start gap-3 sm:w-auto sm:flex-1 sm:gap-4">
			<div class="page-header-icon" aria-hidden="true">
				<LayoutDashboard size={24} class="operations-icon" />
				<Shield size={24} class="administration-icon" />
			</div>
			<div class="min-w-0">
				<h1 class="text-2xl font-bold tracking-tight break-words">{title}</h1>
				<p class="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
			</div>
		</div>
		{#if children}<div class="flex flex-wrap items-center gap-2">{@render children()}</div>{/if}
	</div>
	{#if summary}<div class="mt-4 flex flex-wrap items-center gap-2 text-sm">
			{@render summary()}
		</div>{/if}
</header>
