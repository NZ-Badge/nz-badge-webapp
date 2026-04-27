/**
 * Type definitions for Web Serial API
 * @see https://wicg.github.io/serial/
 */

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

	addEventListener(
		type: 'disconnect',
		listener: (this: SerialPort, ev: Event) => void,
		options?: boolean | AddEventListenerOptions
	): void;
	addEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | AddEventListenerOptions
	): void;

	removeEventListener(
		type: 'disconnect',
		listener: (this: SerialPort, ev: Event) => void,
		options?: boolean | EventListenerOptions
	): void;
	removeEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | EventListenerOptions
	): void;
}

interface USBDeviceFilter {
	usbVendorId?: number;
	usbProductId?: number;
}

interface Serial extends EventTarget {
	requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
	getPorts(): Promise<SerialPort[]>;

	addEventListener(
		type: 'connect' | 'disconnect',
		listener: (this: Serial, ev: SerialConnectionEvent) => void,
		options?: boolean | AddEventListenerOptions
	): void;
	addEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | AddEventListenerOptions
	): void;

	removeEventListener(
		type: 'connect' | 'disconnect',
		listener: (this: Serial, ev: SerialConnectionEvent) => void,
		options?: boolean | EventListenerOptions
	): void;
	removeEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | EventListenerOptions
	): void;
}

interface SerialConnectionEvent extends Event {
	readonly port: SerialPort;
}

declare global {
	interface Navigator {
		readonly serial: Serial;
	}

	interface WindowEventMap {
		connect: SerialConnectionEvent;
		disconnect: SerialConnectionEvent;
	}
}

export {};
