<script lang="ts">
	import { DatePicker } from '../index';
	import * as Dialog from '$lib/components/ui/dialog';
	import StaffManualEntryDialog from '$lib/components/StaffManualEntryDialog.svelte';
	import SubscriberManualEntryDialog from '$lib/components/SubscriberManualEntryDialog.svelte';
	import AttendanceExportDialog from '$lib/components/AttendanceExportDialog.svelte';
	import StaffHoursSummary from '$lib/components/StaffHoursSummary.svelte';
	import type { StaffAttendancePeriodSummary } from '$lib/services/staff-attendance';
	let date = $state('2026-01-05');
	let timestamp = $state('2026-01-05T13:45');
	let open = $state(false);
	let submitted = $state('');
	let staffOpen = $state(false);
	let subscriberOpen = $state(false);
	let exportOpen = $state(false);
	const people = [{ id: 1, name: 'Persona di prova', email: 'test@example.com' }];
	const period: StaffAttendancePeriodSummary = {
		from: '2026-01-05',
		to: '2026-01-31',
		totalMinutes: 60,
		totalLabel: '1h',
		validSessions: 1,
		eventCount: 2,
		sessions: [
			{
				entryAt: '2026-01-05T12:00:00Z',
				exitAt: '2026-01-05T13:00:00Z',
				durationMinutes: 60,
				durationLabel: '1h'
			}
		],
		issues: []
	};
</script>

<form
	onsubmit={(event) => {
		event.preventDefault();
		submitted = JSON.stringify(Object.fromEntries(new FormData(event.currentTarget)));
	}}
>
	<label for="date">Data</label>
	<DatePicker id="date" name="date" bind:value={date} required />
	<label for="timestamp">Data e ora</label>
	<DatePicker id="timestamp" name="timestamp" withTime bind:value={timestamp} />
	<DatePicker id="disabled" name="disabled" value="2026-01-05" disabled />
	<button type="submit">Invia</button>
</form>
<output data-testid="date-value">{date}</output>
<output data-testid="timestamp-value">{timestamp}</output>
<output data-testid="submitted">{submitted}</output>
<button
	onclick={() => {
		date = '2028-02-29';
		timestamp = '2028-02-29T00:05';
	}}>Carica</button
>
<button
	onclick={() => {
		date = '';
		timestamp = '';
	}}>Svuota</button
>
<button onclick={() => (open = true)}>Dialog</button>
<Dialog.Root bind:open>
	<Dialog.Content>
		<Dialog.Title>Selezione nel dialog</Dialog.Title>
		<Dialog.Description>Prova del calendario nel dialog.</Dialog.Description>
		<DatePicker id="dialog-date" bind:value={date} />
	</Dialog.Content>
</Dialog.Root>
<button onclick={() => (staffOpen = true)}>Inserimento collaboratore</button>
<button onclick={() => (subscriberOpen = true)}>Inserimento corsista</button>
<button onclick={() => (exportOpen = true)}>Esportazione</button>
<StaffManualEntryDialog
	bind:open={staffOpen}
	users={people}
	defaultUserId={1}
	canSelectUser={false}
/>
<SubscriberManualEntryDialog bind:open={subscriberOpen} subscribers={people} />
<AttendanceExportDialog
	bind:open={exportOpen}
	endpoint="/api/v1/attendance/export"
	subjectLabel="corsista"
	emailOptions={people}
	defaultFrom="2026-01-05"
	defaultTo="2026-01-31"
	listId="export"
/>
<section data-testid="hours">
	<StaffHoursSummary
		user={people[0]}
		report={{ week: period, month: period, custom: period }}
		from={period.from}
		to={period.to}
		manualUsers={people}
		showManualAction={false}
	/>
</section>
