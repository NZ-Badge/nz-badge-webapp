<script lang="ts">
	import { DatabaseBackup, Download, FileUp, TriangleAlert } from '@lucide/svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';

	let selectedFile = $state<File | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let confirmOpen = $state(false);
	let confirmation = $state('');
	let importing = $state(false);
	let importError = $state('');
	let importSuccess = $state(false);

	function selectFile(event: Event) {
		selectedFile = (event.currentTarget as HTMLInputElement).files?.[0] ?? null;
		importError = '';
		importSuccess = false;
	}

	async function importBackup() {
		if (!selectedFile || confirmation !== 'SOVRASCRIVI' || importing) return;
		const file = selectedFile;
		confirmOpen = false;
		importing = true;
		importError = '';
		importSuccess = false;
		try {
			const response = await fetch('/admin/maintenance/import', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/gzip',
					'X-Confirm-Replace': 'SOVRASCRIVI'
				},
				body: file
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.error || 'Importazione non riuscita');
			importSuccess = true;
			selectedFile = null;
			if (fileInput) fileInput.value = '';
		} catch (err) {
			importError = err instanceof Error ? err.message : 'Importazione non riuscita';
		} finally {
			confirmation = '';
			importing = false;
		}
	}
</script>

<div class="space-y-6">
	<PageHeader
		title="Manutenzione"
		description="Scarica una copia del database o ripristina i dati da un backup."
	/>

	<div class="grid items-start gap-6 lg:grid-cols-2">
		<Card class="gap-0 py-0">
			<CardHeader class="px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
				<CardTitle class="flex items-center gap-2">
					<DatabaseBackup size={20} /> Backup database
				</CardTitle>
				<CardDescription>
					Scarica struttura e dati del database in un file SQL compresso con gzip.
				</CardDescription>
			</CardHeader>
			<CardContent class="space-y-5 px-5 pb-5 sm:px-6 sm:pb-6">
				<p class="text-sm leading-relaxed text-muted-foreground">
					Il file contiene informazioni riservate. Conservalo in un luogo sicuro e rimuovi le copie
					non più necessarie.
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

		<Card class="gap-0 py-0">
			<CardHeader class="px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
				<CardTitle class="flex items-center gap-2"><FileUp size={20} /> Importa database</CardTitle>
				<CardDescription
					>Ripristina un backup .sql.gz creato per questo database. Usa solo file provenienti da una
					fonte fidata.</CardDescription
				>
			</CardHeader>
			<CardContent class="space-y-5 px-5 pb-5 sm:px-6 sm:pb-6">
				<div
					class="rounded-lg border border-red-200 bg-red-50 p-4 text-sm leading-relaxed text-red-900"
				>
					<p class="flex items-center gap-2 font-semibold">
						<TriangleAlert size={18} /> Attenzione: operazione irreversibile
					</p>
					<p class="mt-2">
						Tutti i dati attuali, inclusi quelli aggiunti dopo il backup, verranno cancellati e
						sostituiti. Se l'importazione fallisce, il database potrebbe rimanere incompleto.
						Scarica prima un backup dei dati attuali.
					</p>
				</div>
				<div class="space-y-2">
					<label for="database-file" class="block text-sm font-medium">File di backup .sql.gz</label
					>
					<input
						id="database-file"
						type="file"
						accept=".sql.gz,application/gzip"
						bind:this={fileInput}
						onchange={selectFile}
						disabled={importing}
						class="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm file:mr-3 file:border-0 file:bg-transparent file:font-medium focus-visible:ring-2 focus-visible:ring-blue-500"
					/>
					<p class="text-xs text-muted-foreground">
						Massimo 100 MB compressi. Il nome del database nel backup deve coincidere con quello
						attuale.
					</p>
				</div>
				{#if importError}<p class="text-sm text-red-700" role="alert">
						{importError}
					</p>{/if}
				{#if importSuccess}<p class="text-sm text-emerald-700" role="status">
						Database ripristinato. Aggiorna la pagina o accedi di nuovo se la sessione non è più
						valida.
					</p>{/if}
				<Button
					variant="destructive"
					disabled={!selectedFile ||
						importing ||
						!selectedFile.name.toLowerCase().endsWith('.sql.gz') ||
						selectedFile.size > 100 * 1024 * 1024}
					onclick={() => {
						confirmation = '';
						confirmOpen = true;
					}}
					data-tutorial-title="Importa database"
					data-tutorial-description="Dopo aver scelto un backup .sql.gz, apre una conferma prima di cancellare il database attuale e ripristinare i dati del file."
				>
					<FileUp size={16} />
					{importing ? 'Importazione in corso…' : 'Importa e sostituisci i dati'}
				</Button>
			</CardContent>
		</Card>
	</div>
</div>

<Dialog.Root bind:open={confirmOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Sostituire tutto il database?</Dialog.Title>
			<Dialog.Description>
				Tutti i dati attuali verranno cancellati. Il ripristino può richiedere alcuni minuti e non
				può essere annullato. Verifica di avere un backup recente prima di proseguire.
			</Dialog.Description>
		</Dialog.Header>
		<p class="text-sm">File selezionato: <strong>{selectedFile?.name}</strong></p>
		<div class="space-y-2">
			<label for="confirm-import" class="block text-sm font-medium"
				>Scrivi SOVRASCRIVI per confermare</label
			>
			<input
				id="confirm-import"
				type="text"
				bind:value={confirmation}
				autocomplete="off"
				class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-blue-500"
			/>
		</div>
		<Dialog.Footer>
			<Button
				variant="secondary"
				onclick={() => {
					confirmation = '';
					confirmOpen = false;
				}}
				data-tutorial-title="Annulla importazione"
				data-tutorial-description="Chiude la conferma senza modificare il database.">Annulla</Button
			>
			<Button
				variant="destructive"
				disabled={confirmation !== 'SOVRASCRIVI'}
				onclick={importBackup}
				data-tutorial-title="Conferma sostituzione database"
				data-tutorial-description="Cancella il database attuale e ripristina tutti i dati contenuti nel backup selezionato."
				>Sì, sostituisci tutto</Button
			>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
