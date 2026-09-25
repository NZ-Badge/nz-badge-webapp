// Wrapper WebSerial per modalità diagnostica ESP32 RFID
// Protocollo: JSON line-delimited, 115200 baud
// A differenza di webserial.ts, mantiene un loop di lettura continuo
// e smista le righe in arrivo tra risposte a comandi e log generici.

export interface ReadCardResponse {
	status: 'success' | 'error' | 'timeout';
	uid?: string;
	uid_raw?: number[];
	sector_data?: unknown;
	message: string;
}

import {
	getControlSignals,
	parseJsonLine,
	readLines,
	SERIAL_BAUD_RATE,
	SERIAL_USB_FILTERS
} from './webserial';

type PendingCommand = {
	resolve: (response: ReadCardResponse) => void;
};

export class WebSerialDiagnostic {
	public connected: boolean = false;

	private port: SerialPort | null = null;
	private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
	private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
	private _injected = false;

	private pendingCommand: PendingCommand | null = null;
	private logCallbacks: Set<(line: string) => void> = new Set();

	async connect(port?: SerialPort): Promise<void> {
		if (!('serial' in navigator)) {
			throw new Error('WebSerial API non supportata. Usa Chrome o Edge.');
		}

		if (port) {
			this.port = port;
			this._injected = true;
		} else {
			this._injected = false;
			this.port = await navigator.serial.requestPort({ filters: SERIAL_USB_FILTERS });
			await this.port.open({ baudRate: SERIAL_BAUD_RATE });
			await this.port.setSignals(getControlSignals(this.port));
		}

		if (!this.port.readable || !this.port.writable) {
			throw new Error('Stream della porta non disponibili.');
		}
		this.reader = this.port.readable.getReader();
		this.writer = this.port.writable.getWriter();
		this.connected = true;

		// Avvia il loop di lettura continuo in background — non si fa await
		this.readLoop();
	}

	async disconnect(): Promise<void> {
		this.connected = false;

		// Risolvi il pending command con errore se presente
		if (this.pendingCommand) {
			this.pendingCommand.resolve({ status: 'error', message: 'Disconnesso' });
			this.pendingCommand = null;
		}

		// Rilascia il write lock PRIMA di cancellare il reader: reader.cancel() fa uscire
		// readLoop() che altrimenti nullerebbe this.writer prima che noi possiamo rilasciarlo.
		try {
			this.writer?.releaseLock();
		} catch {
			// Ignora
		}
		this.writer = null;

		try {
			await this.reader?.cancel();
		} catch {
			// Ignora
		}
		try {
			this.reader?.releaseLock();
		} catch {
			// Ignora
		}
		this.reader = null;

		if (!this._injected) {
			try {
				await this.port?.close();
			} catch {
				// Ignora
			}
		}

		this.port = null;
		this._injected = false;
	}

	async readCard(): Promise<ReadCardResponse> {
		if (!this.writer) {
			return { status: 'error', message: 'Porta seriale non connessa' };
		}
		if (this.pendingCommand) {
			return { status: 'error', message: 'Un altro comando è già in attesa' };
		}

		const command = JSON.stringify({ cmd: 'read_card' }) + '\n';
		await this.writer.write(new TextEncoder().encode(command));

		return new Promise<ReadCardResponse>((resolve) => {
			const timeout = setTimeout(() => {
				this.pendingCommand = null;
				resolve({ status: 'timeout', message: 'Timeout di risposta del dispositivo (30s)' });
			}, 30000);

			this.pendingCommand = {
				resolve: (response: ReadCardResponse) => {
					clearTimeout(timeout);
					this.pendingCommand = null;
					resolve(response);
				}
			};
		});
	}

	onLogLine(callback: (line: string) => void): () => void {
		this.logCallbacks.add(callback);
		return () => {
			this.logCallbacks.delete(callback);
		};
	}

	// Loop di lettura continuo: gira finché la porta non viene chiusa o si verifica un errore.
	private async readLoop(): Promise<void> {
		if (!this.reader) return;
		try {
			for await (const line of readLines(this.reader)) {
				const parsed = parseJsonLine<ReadCardResponse>(line);
				if (parsed !== null && this.pendingCommand) {
					// Risposta JSON a un comando in attesa
					this.pendingCommand.resolve(parsed);
				} else {
					// Log generico: notifica tutti i callback con la riga raw
					for (const cb of this.logCallbacks) cb(line);
				}
			}
		} catch {
			// La porta è stata chiusa o si è verificato un errore
		}

		// Il loop è uscito (stream chiuso o errore): rilascia i lock e marca la connessione morta.
		// Nota: disconnect() rilascia il writer PRIMA di chiamare cancel(), quindi normalmente
		// this.writer è già null qui. Il try/catch è una difesa per il caso in cui il loop
		// esca per un errore hardware senza che disconnect() sia stato chiamato.
		this.connected = false;
		if (this.writer) {
			try {
				this.writer.releaseLock();
			} catch {
				/* ignora */
			}
			this.writer = null;
		}
		// Chiama releaseLock() PRIMA di azzerare il riferimento, altrimenti
		// disconnect() non potrà farlo (trova this.reader già null) e port.readable
		// rimarrebbe locked in modo permanente.
		if (this.reader) {
			try {
				this.reader.releaseLock();
			} catch {
				/* ignora */
			}
		}
		this.reader = null;
		if (this.pendingCommand) {
			this.pendingCommand.resolve({ status: 'error', message: 'Connessione seriale persa' });
			this.pendingCommand = null;
		}
	}
}
