<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { Save } from '@lucide/svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button';
	import AttendanceRulesCard from './AttendanceRulesCard.svelte';
	import EnrollmentApiCard from './EnrollmentApiCard.svelte';
	import MifareKeysCard from './MifareKeysCard.svelte';
	import WebhookCard from './WebhookCard.svelte';
	import WeeklySummaryCard from './WeeklySummaryCard.svelte';

	let { data } = $props();

	// Valori modificabili: ripartono dai dati salvati a ogni ricaricamento (es. dopo "Salva").
	let resetEntryTypeDaily = $derived(data.values.reset_entry_type_daily ?? true);
	let minSwipeIntervalMinutes = $derived(data.values.min_swipe_interval_minutes ?? 15);
	let enforceCourseDateRange = $derived(data.values.enforce_course_date_range ?? true);
	let weeklyAttendanceSummaryEnabled = $derived(
		data.values.weekly_attendance_summary_enabled ?? false
	);
	let useMifare = $derived(data.values.use_mifare ?? false);
	let useSingleMifareKey = $derived(data.values.use_single_mifare_key ?? false);
	let mifareKeys = $derived(data.mifareKeys);
	let enrollmentApiUrl = $derived(data.enrollmentApi.url ?? '');
	let enrollmentApiKey = $state('');
	let clearEnrollmentApiKey = $state(false);

	let saving = $state(false);
	let showSingleKeyWarning = $state(false);

	const webhookUrl = $derived(`${page.url.origin}/api/v1/webhooks/enrollments`);

	const submitSave: SubmitFunction = ({ cancel }) => {
		showSingleKeyWarning = false;
		// Abilitare la chiave unica con card attive non è consentito: avvisa prima di inviare.
		if (
			useMifare &&
			useSingleMifareKey &&
			data.activeCardsCount > 0 &&
			!data.values.use_single_mifare_key
		) {
			showSingleKeyWarning = true;
			cancel();
			return;
		}
		saving = true;
		return async ({ result, update }) => {
			try {
				if (result.type === 'success') {
					enrollmentApiKey = '';
					clearEnrollmentApiKey = false;
					await update({ reset: false });
					toast.success('Impostazioni salvate');
				} else if (result.type === 'failure') {
					const message = result.data?.message;
					toast.error(
						typeof message === 'string' ? message : 'Impossibile salvare le impostazioni'
					);
				} else if (result.type === 'error') {
					toast.error('Impossibile salvare le impostazioni');
				} else {
					await update();
				}
			} finally {
				saving = false;
			}
		};
	};
</script>

<div class="mx-auto max-w-2xl space-y-6">
	<PageHeader
		title="Impostazioni"
		description="Configura le regole delle presenze, la sicurezza delle tessere e i collegamenti con gli altri servizi."
	/>

	<AttendanceRulesCard
		bind:resetEntryTypeDaily
		bind:enforceCourseDateRange
		bind:minSwipeIntervalMinutes
	/>

	<WeeklySummaryCard bind:enabled={weeklyAttendanceSummaryEnabled} />

	<MifareKeysCard
		bind:useMifare
		bind:useSingleMifareKey
		bind:mifareKeys
		bind:showSingleKeyWarning
		savedUseSingleMifareKey={data.values.use_single_mifare_key ?? false}
		activeCardsCount={data.activeCardsCount ?? 0}
	/>

	<EnrollmentApiCard
		bind:url={enrollmentApiUrl}
		bind:apiKey={enrollmentApiKey}
		bind:clearKey={clearEnrollmentApiKey}
		hasKey={data.enrollmentApi.hasKey}
	/>

	<WebhookCard {webhookUrl} hasSecret={data.webhook.hasSecret} />

	<!-- I valori delle card vengono inviati tutti insieme dall'action "save". -->
	<form method="POST" action="?/save" use:enhance={submitSave} class="flex justify-end">
		<input type="hidden" name="reset_entry_type_daily" value={String(resetEntryTypeDaily)} />
		<input type="hidden" name="min_swipe_interval_minutes" value={minSwipeIntervalMinutes} />
		<input type="hidden" name="enforce_course_date_range" value={String(enforceCourseDateRange)} />
		<input
			type="hidden"
			name="weekly_attendance_summary_enabled"
			value={String(weeklyAttendanceSummaryEnabled)}
		/>
		{#if useMifare}
			<input type="hidden" name="use_single_mifare_key" value={String(useSingleMifareKey)} />
		{/if}
		<input type="hidden" name="enrollment_api_url" value={enrollmentApiUrl} />
		<input type="hidden" name="enrollment_api_key" value={enrollmentApiKey} />
		<input type="hidden" name="clear_enrollment_api_key" value={String(clearEnrollmentApiKey)} />

		<Button
			type="submit"
			disabled={saving}
			class="min-w-32"
			data-tutorial-title="Salva impostazioni"
			data-tutorial-description="Salva regole presenze, riepilogo settimanale, modalità chiave unica e configurazione dell'API iscrizioni."
		>
			{#if saving}
				<span
					class="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
				></span>
				Salvataggio...
			{:else}
				<Save size={16} class="mr-2" />
				Salva impostazioni
			{/if}
		</Button>
	</form>
</div>
