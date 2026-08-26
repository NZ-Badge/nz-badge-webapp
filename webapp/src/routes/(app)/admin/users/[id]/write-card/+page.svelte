<script lang="ts">
	import CardWriteFlow from '../../../../subscribers/[id]/write-card/+page.svelte';

	let { data } = $props();
</script>

<CardWriteFlow {data} />
