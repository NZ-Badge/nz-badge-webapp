<script>
	import '../app.css';
	import { Toaster } from '$lib/components/ui/sonner';
	const { children } = $props();
</script>

<Toaster
	richColors
	closeButton
	position="top-right"
	containerAriaLabel="Notifiche"
	closeButtonAriaLabel="Chiudi notifica"
/>
{@render children()}
