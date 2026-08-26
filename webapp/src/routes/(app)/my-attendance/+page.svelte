<script lang="ts">
	import StaffHoursSummary from '$lib/components/StaffHoursSummary.svelte';

	let { data } = $props();
</script>

<StaffHoursSummary
	user={data.targetUser}
	report={data.report}
	from={data.from}
	to={data.to}
	manualUsers={data.manualUsers}
/>
