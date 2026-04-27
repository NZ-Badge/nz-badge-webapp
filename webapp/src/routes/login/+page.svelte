<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';

	let { form } = $props();
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-50">
	<div class="w-full max-w-sm space-y-6 rounded-lg bg-white p-8 shadow">
		<h1 class="text-center text-2xl font-bold">Accesso admin</h1>

		{#if form?.error}
			<p class="text-center text-sm text-red-600">{form.error}</p>
		{/if}

		<form method="POST" action="?/login" use:enhance class="space-y-4">
			<div class="space-y-1">
				<Label for="email">Email</Label>
				<Input id="email" name="email" type="email" required autocomplete="email" />
			</div>
			<div class="space-y-1">
				<Label for="password">Password</Label>
				<Input
					id="password"
					name="password"
					type="password"
					required
					autocomplete="current-password"
				/>
			</div>
			<Button type="submit" class="w-full">Accedi</Button>
		</form>
	</div>
</div>
