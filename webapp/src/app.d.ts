// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { DeviceReg, User } from '$lib/db/schema';

declare global {
	namespace App {
		// interface Error {}

		/**
		 * App.Locals - Server-side request context
		 * Contains auth helpers and security context
		 */
		interface Locals {
			/** Verify device token from request headers */
			verifyDevice: () => Promise<DeviceReg>;
			/** Verify admin session from cookies */
			verifyAdmin: () => Promise<User>;
			/** CSP nonce for this request */
			cspNonce: string;
		}

		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	// Web Serial API Types
	// @see https://wicg.github.io/serial/

	interface SerialPortInfo {
		usbVendorId?: number;
		usbProductId?: number;
	}

	interface SerialPortRequestOptions {
		filters?: USBDeviceFilter[];
	}

	interface SerialOutputSignals {
		dataTerminalReady?: boolean;
		requestToSend?: boolean;
		break?: boolean;
	}

	interface SerialInputSignals {
		dataCarrierDetect?: boolean;
		clearToSend?: boolean;
		ringIndicator?: boolean;
		dataSetReady?: boolean;
	}

	interface SerialOptions {
		baudRate: number;
		dataBits?: 7 | 8;
		stopBits?: 1 | 2;
		parity?: 'none' | 'even' | 'odd';
		bufferSize?: number;
		flowControl?: 'none' | 'hardware';
	}

	interface SerialPort extends EventTarget {
		readonly readable: ReadableStream<Uint8Array> | null;
		readonly writable: WritableStream<Uint8Array> | null;
		open(options: SerialOptions): Promise<void>;
		close(): Promise<void>;
		getInfo(): SerialPortInfo;
		getSignals(): Promise<SerialInputSignals>;
		setSignals(signals: SerialOutputSignals): Promise<void>;
	}

	interface USBDeviceFilter {
		usbVendorId?: number;
		usbProductId?: number;
	}

	interface Serial extends EventTarget {
		requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
		getPorts(): Promise<SerialPort[]>;
	}

	interface Navigator {
		readonly serial: Serial;
	}
}

export {};
