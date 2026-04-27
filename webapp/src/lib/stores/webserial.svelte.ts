/**
 * WebSerial Store - Secure USB device connection management
 * Svelte 5 runes-based global state for RFID writer communication
 */

import { browser } from '$app/environment';

// ───────────────────────────────────────────────────────────────────────────────
// Types & Constants
// ───────────────────────────────────────────────────────────────────────────────

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface SerialConnection {
	state: ConnectionState;
	error: string | null;
	port: SerialPort | null;
	/** Device info when connected */
	deviceInfo?: {
		vendorId: number;
		productId: number;
		serialNumber?: string;
	};
}

// Supported USB vendor IDs for ESP32-based devices
const USB_FILTERS: USBDeviceFilter[] = [
	{ usbVendorId: 0x303a }, // ESP32-S3 native USB (Espressif)
	{ usbVendorId: 0x10c4 }, // CP210x (Silicon Labs)
	{ usbVendorId: 0x1a86 }, // CH340 / CH341 / CH9102 (QinHeng)
	{ usbVendorId: 0x0403 } // FT232x (FTDI)
];

const BAUD_RATE = 115200;
const CONNECTION_TIMEOUT_MS = 10000;

function getControlSignals(port: SerialPort): SerialOutputSignals {
	const info = port.getInfo();

	// TinyUSB CDC on native ESP32-S3 USB requires the host to assert line state
	// for device->host TX to be considered connected. USB-UART bridges instead
	// should keep DTR/RTS low to avoid auto-reset circuitry side effects.
	if (info.usbVendorId === 0x303a) {
		return {
			dataTerminalReady: true,
			requestToSend: true
		};
	}

	return {
		dataTerminalReady: false,
		requestToSend: false
	};
}

// ───────────────────────────────────────────────────────────────────────────────
// Global State (Svelte 5 runes)
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Global connection state - shared across all components
 */
export const connection = $state<SerialConnection>({
	state: 'disconnected',
	error: null,
	port: null
});

// Track connection attempts for rate limiting
let lastConnectionAttempt = 0;
const MIN_RETRY_INTERVAL_MS = 2000;

// ───────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Check if Web Serial API is supported
 */
export function isWebSerialSupported(): boolean {
	return browser && 'serial' in navigator;
}

/**
 * Get human-readable device name from vendor ID
 */
export function getDeviceName(vendorId: number): string {
	const names: Record<number, string> = {
		0x303a: 'ESP32-S3 Native',
		0x10c4: 'CP210x (Silicon Labs)',
		0x1a86: 'CH340/CH341 (QinHeng)',
		0x0403: 'FT232x (FTDI)'
	};
	return names[vendorId] ?? 'Dispositivo sconosciuto';
}

/**
 * Validate port is still usable
 */
function isPortValid(port: SerialPort | null): boolean {
	if (!port) return false;
	// Check if port was disconnected
	return port.readable !== null && port.writable !== null;
}

// ───────────────────────────────────────────────────────────────────────────────
// Connection Management
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Connect to a USB serial device
 */
export async function connect(): Promise<void> {
	// Guard: browser environment
	if (!browser || !isWebSerialSupported()) {
		connection.error = 'Web Serial API non supportata. Usa Chrome o Edge.';
		connection.state = 'error';
		return;
	}

	// Guard: already connected
	if (connection.state === 'connected' && connection.port) {
		if (isPortValid(connection.port)) {
			return; // Already connected and port is valid
		}
		// Port became invalid, reset state
		connection.port = null;
		connection.state = 'disconnected';
	}

	// Guard: connection in progress
	if (connection.state === 'connecting') {
		return;
	}

	// Rate limiting
	const now = Date.now();
	if (now - lastConnectionAttempt < MIN_RETRY_INTERVAL_MS) {
		connection.error = 'Attendi prima di riprovare';
		connection.state = 'error';
		return;
	}
	lastConnectionAttempt = now;

	// Set connecting state
	connection.state = 'connecting';
	connection.error = null;

	try {
		// Request port from user
		const port = await navigator.serial.requestPort({ filters: USB_FILTERS });

		// Check if already connected to avoid re-opening
		if (port.readable || port.writable) {
			// Port already open, just update state
			connection.port = port;
			connection.state = 'connected';

			// Try to get device info
			const info = port.getInfo();
			connection.deviceInfo = {
				vendorId: info.usbVendorId ?? 0,
				productId: info.usbProductId ?? 0
			};

			setupDisconnectHandler(port);
			return;
		}

		// Open port with timeout
		const openPromise = port.open({ baudRate: BAUD_RATE });
		const timeoutPromise = new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error('Timeout di connessione')), CONNECTION_TIMEOUT_MS)
		);

		await Promise.race([openPromise, timeoutPromise]);

		// Configure line state based on native USB vs USB-UART bridge.
		await port.setSignals(getControlSignals(port));

		// Update state
		connection.port = port;
		connection.state = 'connected';
		connection.error = null;

		// Store device info
		const info = port.getInfo();
		connection.deviceInfo = {
			vendorId: info.usbVendorId ?? 0,
			productId: info.usbProductId ?? 0
		};

		// Setup disconnect handler
		setupDisconnectHandler(port);

		console.log('[WebSerial] Connected:', getDeviceName(info.usbVendorId ?? 0));
	} catch (err) {
		console.error('[WebSerial] Connection failed:', err);

		connection.state = 'error';
		connection.port = null;

		if (err instanceof Error) {
			// User-friendly error messages
			if (err.message.includes('No port selected')) {
				connection.error = 'Nessun dispositivo selezionato';
			} else if (err.message.includes('Failed to open port')) {
				connection.error =
					'Impossibile aprire la porta. Il dispositivo potrebbe essere già in uso.';
			} else if (err.message.includes('Timeout di connessione')) {
				connection.error = 'Connessione scaduta. Controlla il dispositivo e riprova.';
			} else {
				connection.error = err.message;
			}
		} else {
			connection.error = 'Connessione non riuscita';
		}
	}
}

/**
 * Setup disconnect event handler
 */
function setupDisconnectHandler(port: SerialPort): void {
	const handleDisconnect = () => {
		console.log('[WebSerial] Device disconnected');

		// Only update if this is the current port
		if (connection.port === port) {
			connection.state = 'disconnected';
			connection.port = null;
			connection.error = null;
			connection.deviceInfo = undefined;
		}

		port.removeEventListener('disconnect', handleDisconnect);
	};

	port.addEventListener('disconnect', handleDisconnect);
}

/**
 * Disconnect from USB device
 */
export async function disconnect(): Promise<void> {
	const port = connection.port;

	// Reset state immediately for responsive UI
	connection.port = null;
	connection.state = 'disconnected';
	connection.error = null;
	connection.deviceInfo = undefined;

	if (!port) return;

	try {
		// Check if port is still open
		if (port.readable || port.writable) {
			// Release any locks before closing
			// Note: The caller should ensure no readers/writers are active
			await port.close();
			console.log('[WebSerial] Disconnected');
		}
	} catch (err) {
		// Ignore close errors - port may already be closed
		console.log('[WebSerial] Disconnect (port already closed)');
	}
}

/**
 * Check connection health and reconnect if needed
 */
export async function checkConnection(): Promise<boolean> {
	if (connection.state !== 'connected') return false;

	const port = connection.port;
	if (!port || !isPortValid(port)) {
		// Port became invalid
		connection.state = 'disconnected';
		connection.port = null;
		connection.error = 'Dispositivo disconnesso';
		return false;
	}

	return true;
}

// ───────────────────────────────────────────────────────────────────────────────
// Helper Types for UI
// ───────────────────────────────────────────────────────────────────────────────

export interface ConnectionStatus {
	label: string;
	color: 'green' | 'yellow' | 'red' | 'gray';
	icon: string;
	canConnect: boolean;
	canDisconnect: boolean;
}

/**
 * Get connection status (non-reactive, use for initial values)
 * For reactive status, use $derived in your component:
 *   const status = $derived(getConnectionStatusSnapshot(connection.state))
 */
export function getConnectionStatusFromState(
	state: ConnectionState,
	error: string | null = null
): ConnectionStatus {
	switch (state) {
		case 'connected':
			return {
				label: 'Connesso',
				color: 'green',
				icon: 'check-circle',
				canConnect: false,
				canDisconnect: true
			};
		case 'connecting':
			return {
				label: 'Connessione...',
				color: 'yellow',
				icon: 'loader',
				canConnect: false,
				canDisconnect: false
			};
		case 'error':
			return {
				label: error ?? 'Errore',
				color: 'red',
				icon: 'alert-circle',
				canConnect: true,
				canDisconnect: false
			};
		default:
			return {
				label: 'Disconnesso',
				color: 'gray',
				icon: 'usb',
				canConnect: true,
				canDisconnect: false
			};
	}
}
