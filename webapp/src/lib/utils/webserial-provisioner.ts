// Gestisce il provisioning automatico di un reader ESP32 via WebSerial.
// Apre la propria connessione seriale dedicata (indipendente dallo store globale)
// per evitare conflitti di lock sullo stream.

export type ProvisionState = 'idle' | 'connecting' | 'listening' | 'sending' | 'success' | 'error';

export interface ProvisionLogEntry {
	time: string;
	text: string;
	type: 'info' | 'rx' | 'tx' | 'success' | 'error';
}

const USB_FILTERS = [
	{ usbVendorId: 0x303a }, // ESP32-S3 native USB
	{ usbVendorId: 0x10c4 }, // CP210x (Silicon Labs)
	{ usbVendorId: 0x1a86 }, // CH340 / CH341 / CH9102
	{ usbVendorId: 0x0403 } // FT232x (FTDI)
];

// Timeout massimo (ms) in attesa di conferma dal firmware dopo l'invio del comando.
// Se scade, il dispositivo si è probabilmente riavviato ma la disconnessione USB
// non è stata rilevata (noto con ESP32-S3 native USB CDC).
const SEND_TIMEOUT_MS = 12_000;

export class WebSerialProvisioner {
	private port: SerialPort | null = null;
	private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
	private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
	private commandSent = false;
	private cancelled = false;
	private sendTimeoutId: ReturnType<typeof setTimeout> | null = null;

	private deviceId = '';
	private jwt = '';
	private apiUrl = '';

	public state: ProvisionState = 'idle';
	private stateCallbacks: Set<(s: ProvisionState) => void> = new Set();
	private logCallbacks: Set<(e: ProvisionLogEntry) => void> = new Set();

	onState(cb: (s: ProvisionState) => void): () => void {
		this.stateCallbacks.add(cb);
		return () => this.stateCallbacks.delete(cb);
	}

	onLog(cb: (e: ProvisionLogEntry) => void): () => void {
		this.logCallbacks.add(cb);
		return () => this.logCallbacks.delete(cb);
	}

	private setState(s: ProvisionState) {
		this.state = s;
		for (const cb of this.stateCallbacks) cb(s);
	}

	private log(text: string, type: ProvisionLogEntry['type'] = 'info') {
		const time = new Date().toLocaleTimeString('it-IT');
		for (const cb of this.logCallbacks) cb({ time, text, type });
	}

	/**
	 * Avvia il provisioning: apre la propria connessione seriale (mostra il picker).
	 * NON usa lo store globale per evitare conflitti di lock.
	 */
	async start(deviceId: string, jwt: string, apiUrl: string): Promise<void> {
		this.deviceId = deviceId;
		this.jwt = jwt;
		this.apiUrl = apiUrl;
		this.commandSent = false;
		this.cancelled = false;

		this.setState('connecting');
		this.log('Seleziona la porta USB del dispositivo nel picker...', 'info');

		try {
			this.port = await navigator.serial.requestPort({ filters: USB_FILTERS });
		} catch {
			// Utente ha annullato il picker
			this.setState('idle');
			return;
		}

		try {
			await this.port.open({ baudRate: 115200 });
			// Non impostiamo DTR/RTS: evita reset indesiderati su devkit con circuito auto-reset
		} catch (err) {
			this.setState('error');
			const msg = err instanceof Error ? err.message : String(err);
			this.log(`Impossibile aprire la porta: ${msg}`, 'error');
			this.port = null;
			return;
		}

		if (!this.port.readable || !this.port.writable) {
			this.setState('error');
			this.log('Porta seriale non disponibile — riconnetti il dispositivo.', 'error');
			await this.closePort();
			return;
		}

		try {
			this.reader = this.port.readable.getReader();
			this.writer = this.port.writable.getWriter();
		} catch (err) {
			this.setState('error');
			const msg = err instanceof Error ? err.message : String(err);
			this.log(`Impossibile acquisire i stream della porta: ${msg}`, 'error');
			await this.closePort();
			return;
		}

		this.setState('listening');
		this.log("Connesso. Resetta il dispositivo ora (premi il tasto RESET sull'ESP).", 'info');

		// Avvia il loop senza await — gira in background
		this.readLoop();
	}

	/** Invia subito il comando senza attendere il prompt di boot. */
	async sendNow(): Promise<void> {
		if (!this.writer || this.commandSent) return;
		const cmd = `PROVISION:${this.deviceId},${this.jwt},${this.apiUrl}\n`;
		this.commandSent = true;
		this.setState('sending');
		this.log(`→ ${cmd.trim()}`, 'tx');
		try {
			await this.writer.write(new TextEncoder().encode(cmd));
			// Avvia il timeout: se entro SEND_TIMEOUT_MS non arriva "Provisioned OK"
			// né una disconnessione USB, il firmware probabilmente si è riavviato ma la
			// disconnessione non è stata rilevata (problema noto con ESP32-S3 native USB CDC).
			this.sendTimeoutId = setTimeout(() => this.onSendTimeout(), SEND_TIMEOUT_MS);
		} catch (err) {
			this.setState('error');
			const msg = err instanceof Error ? err.message : String(err);
			this.log(`Errore di scrittura: ${msg}`, 'error');
		}
	}

	private clearSendTimeout() {
		if (this.sendTimeoutId !== null) {
			clearTimeout(this.sendTimeoutId);
			this.sendTimeoutId = null;
		}
	}

	private async onSendTimeout(): Promise<void> {
		if (this.state !== 'sending' || this.cancelled) return;
		this.log('Nessuna conferma ricevuta entro il timeout.', 'error');
		this.log(
			'Il dispositivo si è probabilmente riavviato ma la disconnessione USB non è stata rilevata (ESP32-S3 USB CDC). ' +
				'Verifica il display del reader: se mostra "OFFLINE" o l\'AP WiFi, il provisioning è andato a buon fine.',
			'info'
		);
		this.setState('error');
		await this.release();
	}

	/** Annulla e chiude la connessione. */
	async cancel(): Promise<void> {
		this.cancelled = true;
		this.clearSendTimeout();
		await this.release();
		if (this.state !== 'success') {
			this.setState('idle');
		}
	}

	private async release(): Promise<void> {
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
		try {
			this.writer?.releaseLock();
		} catch {
			// Ignora
		}
		this.reader = null;
		this.writer = null;
		await this.closePort();
	}

	private async closePort(): Promise<void> {
		try {
			await this.port?.close();
		} catch {
			// Ignora
		}
		this.port = null;
	}

	private async readLoop(): Promise<void> {
		const decoder = new TextDecoder();
		let buffer = '';

		try {
			while (!this.cancelled) {
				if (!this.reader) break;
				const { value, done } = await this.reader.read();

				if (done) {
					// Lo stream si è chiuso. Se eravamo in 'sending', il firmware ha chiamato
					// ESP.restart() (USB drop = provisioning ok).
					if (!this.cancelled && this.state === 'sending') {
						this.clearSendTimeout();
						this.log('Dispositivo riavviato — provisioning completato.', 'success');
						this.setState('success');
					}
					break;
				}

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');

				for (const raw of lines.slice(0, -1)) {
					const line = raw.trim();
					if (!line) continue;

					this.log(line, 'rx');

					// Auto-invio quando il firmware entra nella finestra di provisioning
					if (!this.commandSent && line.includes('[BOOT]') && line.includes('PROVISION')) {
						await this.sendNow();
					}

					// Conferma di successo dal firmware (ricevuta prima del disconnect USB)
					if (line.includes('Provisioned OK')) {
						this.clearSendTimeout();
						this.setState('success');
						this.log('Provisioning completato con successo!', 'success');
						await this.release();
						return;
					}

					// Errori firmware
					if (line.includes('PROVISION format error') || line.includes('Provisioning FAILED')) {
						this.clearSendTimeout();
						this.setState('error');
						this.log('Errore riportato dal firmware — verifica il comando.', 'error');
						await this.release();
						return;
					}
				}

				buffer = lines[lines.length - 1];
			}
		} catch {
			if (!this.cancelled) {
				if (this.state === 'sending') {
					// Eccezione dopo l'invio = quasi certamente il firmware si è riavviato
					this.clearSendTimeout();
					this.log('Dispositivo riavviato — provisioning completato.', 'success');
					this.setState('success');
				} else if (this.state === 'listening') {
					this.log('Connessione interrotta.', 'error');
					this.setState('error');
				}
			}
		}

		await this.release();
	}
}
