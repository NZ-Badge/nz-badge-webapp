<script lang="ts">
	import { DatabaseBackup, Download } from '@lucide/svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
</script>

<PageHeader
	title="Manutenzione"
	description="Strumenti per conservare una copia dei dati dell'applicazione."
/>

<Card class="max-w-2xl">
	<CardHeader>
		<CardTitle class="flex items-center gap-2"
			><DatabaseBackup size={20} /> Backup database</CardTitle
		>
		<CardDescription>
			Scarica una copia completa del database, con struttura e dati, in formato SQL compresso con
			gzip.
		</CardDescription>
	</CardHeader>
	<CardContent class="space-y-4">
		<p class="text-sm text-muted-foreground">
			Il file contiene anche informazioni riservate. Conservalo in un luogo sicuro e rimuovi le
			copie non più necessarie.
		</p>
		<Button
			href="/admin/maintenance/backup"
			data-tutorial-title="Scarica backup completo"
			data-tutorial-description="Crea e scarica un file SQL compresso con gzip che contiene la struttura e tutti i dati del database. Il file può contenere informazioni riservate."
		>
			<Download size={16} /> Scarica backup .sql.gz
		</Button>
	</CardContent>
</Card>
