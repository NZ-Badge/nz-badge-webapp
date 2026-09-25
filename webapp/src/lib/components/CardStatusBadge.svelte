<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { cardStatus } from '$lib/labels';

	let { status, class: className }: { status: string | null | undefined; class?: string } =
		$props();

	const info = $derived(cardStatus(status));
</script>

<Badge variant={info.variant} class={className}>{info.label}</Badge>
