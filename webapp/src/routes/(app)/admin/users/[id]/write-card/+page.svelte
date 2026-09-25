<script lang="ts">
	import CardWriteFlow from '$lib/components/CardWriteFlow.svelte';

	let { data } = $props();
</script>

<CardWriteFlow {data} />
