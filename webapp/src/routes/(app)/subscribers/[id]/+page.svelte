<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SubscriberFormDialog from '$lib/components/SubscriberFormDialog.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import {
		Dialog,
		DialogContent,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import { enhance } from '$app/forms';
	import { ArrowLeft, Pencil, Trash2 } from '@lucide/svelte';
	import { subscriberStatus } from '$lib/labels';
	import { toRomeDateInputValue } from '$lib/utils/date.js';
	import SubscriberInfoSection from './SubscriberInfoSection.svelte';
	import SubscriberCardsSection from './SubscriberCardsSection.svelte';
	import EnrollmentCard from './EnrollmentCard.svelte';
	import RecentAttendanceSection from './RecentAttendanceSection.svelte';

	let { data, form } = $props();

	let editDialogOpen = $state(false);
	let deleteDialogOpen = $state(false);

	const sub = $derived(data.subscriber);
	const status = $derived(subscriberStatus(sub.status));

	type EndDateForm = { action?: string; enrollmentId?: number; endDate?: string; error?: string };
	const endDateForm = $derived(
		(form as EndDateForm | null | undefined)?.action === 'updateEnrollmentEndDate'
			? (form as EndDateForm)
			: null
	);

	function endDateValue(enrollment: { id: number; endDate: Date | string | null }) {
		if (endDateForm?.enrollmentId === enrollment.id && endDateForm.endDate !== undefined) {
			return endDateForm.endDate ?? '';
		}
		return toRomeDateInputValue(enrollment.endDate);
	}

	const summaryFor = (enrollmentId: number) =>
		data.courseAttendance.find((row) => row.enrollmentId === enrollmentId);
</script>

<div class="space-y-6">
	<a
		href="/subscribers"
		class="app-link-muted inline-flex items-center gap-2 text-sm"
		data-tutorial-title="Torna agli iscritti"
		data-tutorial-description="Torna all’elenco per cercare e aprire la scheda di un’altra persona."
		><ArrowLeft size={16} aria-hidden="true" /> Tutti gli iscritti</a
	>
	<PageHeader
		title={`${sub.firstName} ${sub.lastName}`}
		description="Dati personali, corsi, tessere e presenze dell’iscritto."
	>
		{#snippet summary()}
			<Badge variant={status.variant}>{status.label}</Badge>
		{/snippet}
		<div class="flex gap-2">
			<Button
				variant="outline"
				size="sm"
				onclick={() => (editDialogOpen = true)}
				data-tutorial-title="Modifica iscritto"
				data-tutorial-description="Apre il modulo per correggere o completare dati anagrafici, contatti, note e stato dell’iscritto."
			>
				<Pencil size={14} aria-hidden="true" /> Modifica
			</Button>
			<Button
				variant="destructive"
				size="sm"
				onclick={() => (deleteDialogOpen = true)}
				data-tutorial-title="Elimina iscritto"
				data-tutorial-description="Apre la richiesta di conferma per annullare l’iscritto, senza agire immediatamente."
			>
				<Trash2 size={14} aria-hidden="true" /> Elimina
			</Button>
		</div>
	</PageHeader>

	<div class="grid items-stretch gap-6 xl:grid-cols-2">
		<SubscriberInfoSection subscriber={sub} />
		<SubscriberCardsSection subscriberId={sub.id} cards={data.cards} />
	</div>

	<section class="overflow-hidden rounded-xl border bg-card shadow-sm">
		<div class="border-b px-5 py-4">
			<h2 class="font-semibold">Iscrizioni ai corsi</h2>
			<p class="mt-1 text-sm text-muted-foreground">
				Ore registrate, periodo del corso e problemi che richiedono attenzione.
			</p>
		</div>
		{#if data.enrollments.length === 0}
			<p class="px-5 py-4 text-sm text-muted-foreground">Nessuna iscrizione trovata.</p>
		{:else}
			<div class="space-y-4 bg-muted/20 p-4 sm:p-5">
				{#each data.enrollments as enrollment (enrollment.id)}
					<EnrollmentCard
						subscriberId={sub.id}
						{enrollment}
						summary={summaryFor(enrollment.id)}
						endDateValue={endDateValue(enrollment)}
						endDateError={endDateForm?.enrollmentId === enrollment.id
							? endDateForm.error
							: undefined}
					/>
				{/each}
			</div>
		{/if}
	</section>

	<RecentAttendanceSection
		subscriberName={`${sub.firstName} ${sub.lastName}`}
		rows={data.recentAttendance}
	/>
</div>

<SubscriberFormDialog bind:open={editDialogOpen} subscriber={sub} formResult={form} />

<Dialog bind:open={deleteDialogOpen}>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>Elimina iscritto</DialogTitle>
		</DialogHeader>
		<p>
			Sei sicuro di voler eliminare <strong>{sub.firstName} {sub.lastName}</strong>?
		</p>
		<p class="text-sm text-muted-foreground">
			L'iscritto passerà allo stato «Annullato»: presenze, iscrizioni e tessere storiche restano
			collegate. Puoi ripristinarlo modificandone lo stato.
		</p>
		{#if form?.error && form?.action === 'delete'}
			<p class="text-sm text-red-600" role="alert">{form.error}</p>
		{/if}
		<DialogFooter>
			<Button
				variant="outline"
				onclick={() => (deleteDialogOpen = false)}
				data-tutorial="dialog.cancel">Annulla</Button
			>
			<form method="POST" action="?/delete" use:enhance>
				<Button type="submit" variant="destructive" data-tutorial="item.delete">Elimina</Button>
			</form>
		</DialogFooter>
	</DialogContent>
</Dialog>
