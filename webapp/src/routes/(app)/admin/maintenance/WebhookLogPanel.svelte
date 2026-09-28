<script lang="ts">
	import { Trash2 } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TablePagination,
		TablePanel,
		TableRow
	} from '$lib/components/ui/table';
	import type { PageData } from './$types';

	let { logs }: { logs: NonNullable<PageData['logs']> } = $props();
	let selectedId = $state<number | null>(null);
	let deleteOpen = $state(false);
	let clearOpen = $state(false);
	let confirmation = $state('');

	const dateTime = new Intl.DateTimeFormat('it-IT', {
		dateStyle: 'short',
		timeStyle: 'medium',
		timeZone: 'Europe/Rome'
	});
	const statusLabels: Record<string, string> = {
		received: 'Ricevuto',
		processed: 'Elaborato',
		ignored: 'Ignorato',
		invalid_json: 'JSON non valido',
		invalid_payload: 'Payload non valido',
		failed: 'Errore'
	};
</script>

<div class="space-y-4">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="space-y-1">
			<h2 class="text-lg font-semibold">Webhook iscrizioni ricevuti</h2>
			<p class="text-sm text-muted-foreground">
				Il registro contiene dati personali dei corsisti. Mostra solo webhook autenticati e oscura i
				campi con credenziali.
			</p>
		</div>
		<Button
			variant="destructive"
			disabled={logs.total === 0}
			onclick={() => {
				confirmation = '';
				clearOpen = true;
			}}
			data-tutorial-title="Svuota registro webhook"
			data-tutorial-description="Apre una conferma per cancellare tutte le voci del registro dei webhook ricevuti. Le iscrizioni non vengono eliminate."
		>
			<Trash2 size={16} /> Svuota registro
		</Button>
	</div>

	<TablePanel>
		<Table embedded class="min-w-[52rem]">
			<TableHeader>
				<TableRow>
					<TableHead>Ricevuto</TableHead>
					<TableHead>Esito</TableHead>
					<TableHead>Iscrizione esterna</TableHead>
					<TableHead>Payload</TableHead>
					<TableHead>Azioni</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{#if logs.rows.length === 0}
					<TableRow
						><TableCell colspan={5} data-empty>Nessun webhook registrato.</TableCell></TableRow
					>
				{/if}
				{#each logs.rows as row (row.id)}
					<TableRow>
						<TableCell class="whitespace-nowrap"
							>{dateTime.format(new Date(row.receivedAt))}</TableCell
						>
						<TableCell>
							<span
								class={row.status === 'failed' || row.status.startsWith('invalid')
									? 'text-red-700 dark:text-red-400'
									: 'text-foreground'}
							>
								{statusLabels[row.status] ?? row.status}{row.httpStatus
									? ` · HTTP ${row.httpStatus}`
									: ''}
							</span>
						</TableCell>
						<TableCell class="max-w-48 break-all font-mono text-xs"
							>{row.externalId ?? '—'}</TableCell
						>
						<TableCell>
							<details class="max-w-[32rem]">
								<summary
									class="cursor-pointer text-sm text-blue-700 underline-offset-4 hover:underline focus-visible:rounded focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-300"
									data-tutorial-title="Mostra payload webhook"
									data-tutorial-description="Espande il corpo JSON ricevuto per verificare date, partecipanti e altri dati inviati dallo shop."
									>Mostra payload</summary
								>
								<pre
									class="mt-2 max-h-96 overflow-auto rounded-md border bg-muted p-3 text-xs whitespace-pre-wrap break-all">{row.payload}</pre>
							</details>
						</TableCell>
						<TableCell>
							<Button
								variant="destructive-ghost"
								size="sm"
								onclick={() => {
									selectedId = row.id;
									deleteOpen = true;
								}}
								data-tutorial-title="Elimina voce webhook"
								data-tutorial-description="Apre una conferma per eliminare soltanto questa voce di log. L'iscrizione importata rimane invariata."
							>
								<Trash2 size={15} /> Elimina
							</Button>
						</TableCell>
					</TableRow>
				{/each}
			</TableBody>
		</Table>
		<TablePagination
			page={logs.page}
			totalPages={logs.totalPages}
			total={logs.total}
			getPageHref={(page) => `/admin/maintenance?tab=webhooks&page=${page}`}
			ariaLabel="Paginazione registro webhook"
		/>
	</TablePanel>
</div>

<Dialog.Root bind:open={deleteOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Eliminare la voce di log?</Dialog.Title>
			<Dialog.Description
				>Il payload registrato verrà cancellato. L'iscrizione importata non cambia.</Dialog.Description
			>
		</Dialog.Header>
		<form method="POST" action="?/deleteLog">
			<input type="hidden" name="id" value={selectedId ?? ''} />
			<input type="hidden" name="page" value={logs.page} />
			<Dialog.Footer>
				<Button
					variant="secondary"
					onclick={() => (deleteOpen = false)}
					data-tutorial-title="Annulla eliminazione log"
					data-tutorial-description="Chiude la conferma e conserva la voce di log.">Annulla</Button
				>
				<Button
					type="submit"
					variant="destructive"
					data-tutorial-title="Conferma eliminazione log"
					data-tutorial-description="Cancella definitivamente il payload e l'esito di questo webhook dal registro."
					>Elimina voce</Button
				>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={clearOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Svuotare tutto il registro webhook?</Dialog.Title>
			<Dialog.Description
				>Verranno cancellati tutti i payload e gli esiti registrati. Le iscrizioni importate non
				cambiano.</Dialog.Description
			>
		</Dialog.Header>
		<form method="POST" action="?/clearLogs" class="space-y-4">
			<div class="space-y-2">
				<label for="clear-webhook-confirmation" class="text-sm font-medium"
					>Scrivi SVUOTA per confermare</label
				>
				<input
					id="clear-webhook-confirmation"
					name="confirmation"
					bind:value={confirmation}
					autocomplete="off"
					class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-blue-500"
				/>
			</div>
			<Dialog.Footer>
				<Button
					variant="secondary"
					onclick={() => (clearOpen = false)}
					data-tutorial-title="Annulla svuotamento registro"
					data-tutorial-description="Chiude la conferma senza eliminare alcuna voce."
					>Annulla</Button
				>
				<Button
					type="submit"
					variant="destructive"
					disabled={confirmation !== 'SVUOTA'}
					data-tutorial-title="Conferma svuotamento registro"
					data-tutorial-description="Elimina definitivamente tutte le voci del registro webhook."
					>Svuota tutto</Button
				>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
