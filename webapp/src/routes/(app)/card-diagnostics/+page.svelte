<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CardQuickReader from '$lib/components/CardQuickReader.svelte';
</script>

<div class="space-y-6">
	<PageHeader
		title="Verifica tessera"
		description="Collega il lettore USB e avvicina una tessera per verificarne intestatario, stato e dati tecnici."
	/>
	<CardQuickReader
		title="Lettore card"
		description={'Avvicina il badge al lettore e clicca "Leggi carta".'}
		showLog={true}
	/>
</div>
