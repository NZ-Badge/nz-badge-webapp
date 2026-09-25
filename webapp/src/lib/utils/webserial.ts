// Wrapper per Web Serial API per comunicare con il writer ESP32
// Protocollo: JSON line-delimited, 115200 baud

export interface CardEraseData {
	sector: number;
	key_a: string;
}

export interface CardForceEraseData {
	sector: number;
}

export interface ReadUidResponse {
	status: 'success' | 'error' | 'timeout';
	uid?: string;
	message: string;
}

export interface EraseResponse {
	status: 'success' | 'error' | 'timeout';
	uid?: string;
	message: string;
}

export interface CardWriteData {
	user_id: number;
	name: string;
	sector: number;
	key_a: string;
	key_b: string;
	timestamp: string;
}

export interface WriteResponse {
	status: 'success' | 'error' | 'timeout';
	uid?: string;
	uid_raw?: number[];
	blocks_written?: number[];
	message: string;
}

export interface CardScanResponse {
	status: 'success' | 'error' | 'timeout';
	uid?: string;
	message?: string;
}

// Chip USB-Serial comuni su devkit ESP32.
export const SERIAL_USB_FILTERS: USBDeviceFilter[] = [
	{ usbVendorId: 0x303a }, // ESP32-S3 native USB (Espressif)
	{ usbVendorId: 0x10c4 }, // CP210x (Silicon Labs) — ESP32-DevKitC ufficiale
	{ usbVendorId: 0x1a86 }, // CH340 / CH341 / CH9102 (QinHeng) — cloni economici
	{ usbVendorId: 0x0403 } // FT232x (FTDI) — devkit di terze parti
];

export const SERIAL_BAUD_RATE = 115200;

/**
 * TinyUSB CDC sull'USB nativa dell'ESP32-S3 richiede che l'host imposti DTR/RTS perché
 * la trasmissione verso il PC sia considerata attiva. I bridge USB-UART devono invece
 * tenerli bassi per non attivare il circuito di auto-reset.
 */
export function getControlSignals(port: SerialPort): SerialOutputSignals {
	const native = port.getInfo().usbVendorId === 0x303a;
	return { dataTerminalReady: native, requestToSend: native };
}

// ───────────────────────────────────────────────────────────────────────────────
// Primitive del protocollo condivise (writer, diagnostica e provisioning)
// ───────────────────────────────────────────────────────────────────────────────

type SerialReader = ReadableStreamDefaultReader<Uint8Array>;

/**
 * Legge lo stream e restituisce una riga completa (senza `\n`) alla volta, saltando quelle
 * vuote. Termina quando lo stream è chiuso, anche per effetto di `reader.cancel()`.
 * Il lock del reader resta al chiamante.
 */
export async function* readLines(reader: SerialReader): AsyncGenerator<string> {
	const decoder = new TextDecoder();
	let buffer = '';
	while (true) {
		const { value, done } = await reader.read();
		if (done) return;
		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop() ?? '';
		for (const line of lines) {
			if (line.trim()) yield line;
		}
	}
}

/** Interpreta una riga come JSON; `null` per log o testo non strutturato del firmware. */
export function parseJsonLine<T = unknown>(line: string): T | null {
	try {
		return JSON.parse(line) as T;
	} catch {
		return null;
	}
}

/** Come `readLines`, ma restituisce solo le righe JSON (le altre sono log del firmware). */
export async function* readJsonLines<T = unknown>(reader: SerialReader): AsyncGenerator<T> {
	for await (const line of readLines(reader)) {
		const parsed = parseJsonLine<T>(line);
		if (parsed !== null) yield parsed;
	}
}

type CommandResult = { status: 'success' | 'error' | 'timeout'; message?: string };

/**
 * Invia un comando JSON line-delimited e attende la prima risposta JSON.
 *
 * Writer e reader vengono acquisiti solo per questa operazione, così ogni comando ottiene
 * stream freschi. Allo scadere del timeout `reader.cancel()` sblocca la `read()` in
 * sospeso: questo chiude `port.readable` in modo permanente, quindi dopo un timeout può
 * servire disconnettere e ricollegare il dispositivo dalla toolbar.
 */
export async function sendAndAwait<T extends CommandResult>(
	port: SerialPort,
	command: Record<string, unknown>,
	{ timeoutMs, timeoutMessage }: { timeoutMs: number; timeoutMessage: string }
): Promise<T> {
	if (!port.writable || !port.readable) {
		throw new Error('La porta seriale non è disponibile. Riconnettere il dispositivo.');
	}

	const writer = port.writable.getWriter();
	try {
		await writer.write(new TextEncoder().encode(JSON.stringify(command) + '\n'));
	} finally {
		writer.releaseLock();
	}

	const reader = port.readable.getReader();
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		reader.cancel().catch(() => {
			// La read() in sospeso termina comunque con done o con un errore
		});
	}, timeoutMs);

	try {
		for await (const response of readJsonLines<T>(reader)) {
			return response;
		}
		return (
			timedOut
				? { status: 'timeout', message: timeoutMessage }
				: { status: 'error', message: 'Connessione seriale chiusa dal dispositivo' }
		) as T;
	} catch (err) {
		if (timedOut) return { status: 'timeout', message: timeoutMessage } as T;
		const msg = err instanceof Error ? err.message : String(err);
		console.error('[webserial] errore di lettura:', err);
		return { status: 'error', message: `Errore di lettura seriale: ${msg}` } as T;
	} finally {
		clearTimeout(timer);
		try {
			reader.releaseLock();
		} catch {
			// Il reader potrebbe essere già in stato di errore/released
		}
	}
}

export class WebSerialCardWriter {
	private port: SerialPort | null = null;
	private _injected = false;

	async connect(port?: SerialPort): Promise<void> {
		if (port) {
			this.port = port;
			this._injected = true;
			return;
		}
		this._injected = false;
		if (!('serial' in navigator)) {
			throw new Error('WebSerial API non supportata. Usa Chrome o Edge.');
		}
		this.port = await navigator.serial.requestPort({ filters: SERIAL_USB_FILTERS });
		await this.port.open({ baudRate: SERIAL_BAUD_RATE });
		await this.port.setSignals(getControlSignals(this.port));
	}

	/** Porta aperta e utilizzabile; altrimenti un errore esplicito per l'interfaccia. */
	private requirePort(): SerialPort {
		if (!this.port) {
			throw new Error('Porta seriale non connessa');
		}
		// port.readable/writable diventano null se il dispositivo si è disconnesso
		// dopo port.open() (es. auto-reset su ESP32 con USB nativa).
		if (!this.port.writable || !this.port.readable) {
			throw new Error('La porta seriale non è disponibile. Riconnettere il dispositivo.');
		}
		return this.port;
	}

	async writeCard(data: CardWriteData): Promise<WriteResponse> {
		return sendAndAwait<WriteResponse>(
			this.requirePort(),
			{ cmd: 'write_card', ...data },
			{ timeoutMs: 30_000, timeoutMessage: 'Timeout di risposta del dispositivo (30s)' }
		);
	}

	async readCard(): Promise<ReadUidResponse> {
		return sendAndAwait<ReadUidResponse>(
			this.requirePort(),
			{ cmd: 'read_card' },
			{ timeoutMs: 32_000, timeoutMessage: 'Nessun dispositivo rilevato (30s)' }
		);
	}

	async eraseCard(data: CardEraseData): Promise<EraseResponse> {
		return sendAndAwait<EraseResponse>(
			this.requirePort(),
			{ cmd: 'erase_card', ...data },
			{ timeoutMs: 30_000, timeoutMessage: 'Timeout di risposta del dispositivo (30s)' }
		);
	}

	async forceEraseCard(data: CardForceEraseData): Promise<EraseResponse> {
		return sendAndAwait<EraseResponse>(
			this.requirePort(),
			{ cmd: 'force_erase_card', ...data },
			{ timeoutMs: 30_000, timeoutMessage: 'Timeout di risposta del dispositivo (30s)' }
		);
	}

	async scanCard(): Promise<CardScanResponse> {
		const response = await sendAndAwait<CardScanResponse>(
			this.requirePort(),
			{ cmd: 'scan_card', timestamp: new Date().toISOString() },
			{ timeoutMs: 30_000, timeoutMessage: 'Timeout waiting for card scan' }
		);
		if (response.status === 'success') return { status: 'success', uid: response.uid };
		if (response.status === 'timeout') return response;
		return { status: 'error', message: response.message };
	}

	async disconnect(): Promise<void> {
		if (!this._injected) {
			try {
				await this.port?.close();
			} catch {
				// Ignora errori di chiusura
			}
		}
		this.port = null;
		this._injected = false;
	}
}
