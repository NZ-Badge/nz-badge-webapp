<script lang="ts">
	import CardQuickReader from '$lib/components/CardQuickReader.svelte';
</script>

<div class="space-y-6">
	<h1 class="text-2xl font-bold">Diagnostica card</h1>
	<CardQuickReader
		title="Lettore card"
		description='Avvicina il badge al lettore e clicca "Leggi carta".'
		showLog={true}
	/>
</div>
