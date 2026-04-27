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

export class WebSerialCardWriter {
	private port: SerialPort | null = null;
	private _injected = false;

	private getControlSignals(port: SerialPort): SerialOutputSignals {
		const info = port.getInfo();

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
		// Chip USB-Serial comuni su devkit ESP32:
		//   CP210x  (Silicon Labs)  0x10c4  — ESP32-DevKitC ufficiale Espressif
		//   CH340/CH341/CH9102 (QinHeng) 0x1a86  — cloni economici e N4XX
		//   FT232x  (FTDI)         0x0403  — devkit di terze parti high-end
		this.port = await navigator.serial.requestPort({
			filters: [
				{ usbVendorId: 0x303a }, // ESP32-S3 native USB (Espressif)
				{ usbVendorId: 0x10c4 }, // CP210x
				{ usbVendorId: 0x1a86 }, // CH340 / CH341 / CH9102
				{ usbVendorId: 0x0403 } // FT232x
			]
		});
		await this.port.open({ baudRate: 115200 });
		await this.port.setSignals(this.getControlSignals(this.port));
	}

	async writeCard(data: CardWriteData): Promise<WriteResponse> {
		if (!this.port) {
			throw new Error('Porta seriale non connessa');
		}
		// port.readable/writable diventano null se il dispositivo si è disconnesso
		// dopo port.open() (es. auto-reset su ESP32 con USB nativa).
		if (!this.port.writable || !this.port.readable) {
			throw new Error('La porta seriale non è disponibile. Riconnettere il dispositivo.');
		}

		// Acquisisce writer e reader per questa singola operazione — non li
		// teniamo come stato della classe, così ogni write ottiene stream freschi.
		const writer = this.port.writable.getWriter();
		try {
			const command = JSON.stringify({ cmd: 'write_card', ...data }) + '\n';
			await writer.write(new TextEncoder().encode(command));
		} finally {
			writer.releaseLock();
		}

		const reader = this.port.readable.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let cancelled = false;

		try {
			return await new Promise<WriteResponse>((resolve) => {
				const timeout = setTimeout(() => {
					cancelled = true;
					resolve({ status: 'timeout', message: 'Timeout di risposta del dispositivo (30s)' });
				}, 30000);

				const readLoop = async () => {
					try {
						while (true) {
							const { value, done } = await reader.read();
							if (done || cancelled) break;
							buffer += decoder.decode(value, { stream: true });
							const lines = buffer.split('\n');
							for (const line of lines.slice(0, -1)) {
								if (!line.trim()) continue;
								try {
									const response = JSON.parse(line) as WriteResponse;
									clearTimeout(timeout);
									resolve(response);
									return;
								} catch {
									// Riga non-JSON — continua a leggere
								}
							}
							buffer = lines[lines.length - 1];
						}
					} catch (err) {
						if (cancelled) return; // cancellazione volontaria dal timeout
						clearTimeout(timeout);
						const msg = err instanceof Error ? err.message : String(err);
						console.error('[webserial] readLoop error:', err);
						resolve({ status: 'error', message: `Errore di lettura seriale: ${msg}` });
					}
				};

				readLoop();
			});
		} finally {
			if (cancelled) {
				// Il timeout è scattato con una read() ancora in sospeso — cancel() la sblocca.
				// NOTA: questo chiude port.readable in modo permanente; se necessario
				// disconnettere e ricollegare il dispositivo dalla toolbar.
				try {
					await reader.cancel();
				} catch {
					// Ignora
				}
			}
			try {
				reader.releaseLock();
			} catch {
				// Il reader potrebbe essere già in stato di errore/released
			}
		}
	}

	async readCard(): Promise<ReadUidResponse> {
		if (!this.port) throw new Error('Porta seriale non connessa');
		if (!this.port.writable || !this.port.readable) {
			throw new Error('La porta seriale non è disponibile. Riconnettere il dispositivo.');
		}

		const writer = this.port.writable.getWriter();
		try {
			await writer.write(new TextEncoder().encode(JSON.stringify({ cmd: 'read_card' }) + '\n'));
		} finally {
			writer.releaseLock();
		}

		const reader = this.port.readable.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let cancelled = false;

		try {
			return await new Promise<ReadUidResponse>((resolve) => {
				const timeout = setTimeout(() => {
					cancelled = true;
					resolve({ status: 'timeout', message: 'Nessun dispositivo rilevato (30s)' });
				}, 32000);

				const readLoop = async () => {
					try {
						while (true) {
							const { value, done } = await reader.read();
							if (done || cancelled) break;
							buffer += decoder.decode(value, { stream: true });
							const lines = buffer.split('\n');
							for (const line of lines.slice(0, -1)) {
								if (!line.trim()) continue;
								try {
									const response = JSON.parse(line) as ReadUidResponse;
									clearTimeout(timeout);
									resolve(response);
									return;
								} catch {
									// riga non-JSON — continua
								}
							}
							buffer = lines[lines.length - 1];
						}
					} catch (err) {
						if (cancelled) return;
						clearTimeout(timeout);
						const msg = err instanceof Error ? err.message : String(err);
						resolve({ status: 'error', message: `Errore di lettura seriale: ${msg}` });
					}
				};

				readLoop();
			});
		} finally {
			if (cancelled) {
				try {
					await reader.cancel();
				} catch {
					/* ignore */
				}
			}
			try {
				reader.releaseLock();
			} catch {
				/* ignore */
			}
		}
	}

	async eraseCard(data: CardEraseData): Promise<EraseResponse> {
		if (!this.port) {
			throw new Error('Porta seriale non connessa');
		}
		if (!this.port.writable || !this.port.readable) {
			throw new Error('La porta seriale non è disponibile. Riconnettere il dispositivo.');
		}

		const writer = this.port.writable.getWriter();
		try {
			const command = JSON.stringify({ cmd: 'erase_card', ...data }) + '\n';
			await writer.write(new TextEncoder().encode(command));
		} finally {
			writer.releaseLock();
		}

		const reader = this.port.readable.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let cancelled = false;

		try {
			return await new Promise<EraseResponse>((resolve) => {
				const timeout = setTimeout(() => {
					cancelled = true;
					resolve({ status: 'timeout', message: 'Timeout di risposta del dispositivo (30s)' });
				}, 30000);

				const readLoop = async () => {
					try {
						while (true) {
							const { value, done } = await reader.read();
							if (done || cancelled) break;
							buffer += decoder.decode(value, { stream: true });
							const lines = buffer.split('\n');
							for (const line of lines.slice(0, -1)) {
								if (!line.trim()) continue;
								try {
									const response = JSON.parse(line) as EraseResponse;
									clearTimeout(timeout);
									resolve(response);
									return;
								} catch {
									// Riga non-JSON — continua a leggere
								}
							}
							buffer = lines[lines.length - 1];
						}
					} catch (err) {
						if (cancelled) return;
						clearTimeout(timeout);
						const msg = err instanceof Error ? err.message : String(err);
						console.error('[webserial] readLoop error:', err);
						resolve({ status: 'error', message: `Errore di lettura seriale: ${msg}` });
					}
				};

				readLoop();
			});
		} finally {
			if (cancelled) {
				try {
					await reader.cancel();
				} catch {
					// Ignora
				}
			}
			try {
				reader.releaseLock();
			} catch {
				// Il reader potrebbe essere già in stato di errore/released
			}
		}
	}

	async forceEraseCard(data: CardForceEraseData): Promise<EraseResponse> {
		if (!this.port) {
			throw new Error('Porta seriale non connessa');
		}
		if (!this.port.writable || !this.port.readable) {
			throw new Error('La porta seriale non è disponibile. Riconnettere il dispositivo.');
		}

		const writer = this.port.writable.getWriter();
		try {
			const command = JSON.stringify({ cmd: 'force_erase_card', ...data }) + '\n';
			await writer.write(new TextEncoder().encode(command));
		} finally {
			writer.releaseLock();
		}

		const reader = this.port.readable.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let cancelled = false;

		try {
			return await new Promise<EraseResponse>((resolve) => {
				const timeout = setTimeout(() => {
					cancelled = true;
					resolve({ status: 'timeout', message: 'Timeout di risposta del dispositivo (30s)' });
				}, 30000);

				const readLoop = async () => {
					try {
						while (true) {
							const { value, done } = await reader.read();
							if (done || cancelled) break;
							buffer += decoder.decode(value, { stream: true });
							const lines = buffer.split('\n');
							for (const line of lines.slice(0, -1)) {
								if (!line.trim()) continue;
								try {
									const response = JSON.parse(line) as EraseResponse;
									clearTimeout(timeout);
									resolve(response);
									return;
								} catch {
									// Riga non-JSON — continua a leggere
								}
							}
							buffer = lines[lines.length - 1];
						}
					} catch (err) {
						if (cancelled) return;
						clearTimeout(timeout);
						const msg = err instanceof Error ? err.message : String(err);
						console.error('[webserial] readLoop error:', err);
						resolve({ status: 'error', message: `Errore di lettura seriale: ${msg}` });
					}
				};

				readLoop();
			});
		} finally {
			if (cancelled) {
				try {
					await reader.cancel();
				} catch {
					// Ignora
				}
			}
			try {
				reader.releaseLock();
			} catch {
				// Il reader potrebbe essere già in stato di errore/released
			}
		}
	}

	async scanCard(): Promise<CardScanResponse> {
		if (!this.port) {
			throw new Error('Porta seriale non connessa');
		}
		if (!this.port.writable || !this.port.readable) {
			throw new Error('La porta seriale non è disponibile. Riconnettere il dispositivo.');
		}

		const writer = this.port.writable.getWriter();
		try {
			const command =
				JSON.stringify({ cmd: 'scan_card', timestamp: new Date().toISOString() }) + '\n';
			await writer.write(new TextEncoder().encode(command));
		} finally {
			writer.releaseLock();
		}

		const reader = this.port.readable.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let cancelled = false;

		try {
			return await new Promise<CardScanResponse>((resolve) => {
				const timeout = setTimeout(() => {
					cancelled = true;
					resolve({ status: 'timeout', message: 'Timeout waiting for card scan' });
				}, 30000);

				const readLoop = async () => {
					try {
						while (true) {
							const { value, done } = await reader.read();
							if (done || cancelled) break;
							buffer += decoder.decode(value, { stream: true });
							const lines = buffer.split('\n');
							for (const line of lines.slice(0, -1)) {
								if (!line.trim()) continue;
								try {
									const response = JSON.parse(line) as CardScanResponse;
									clearTimeout(timeout);
									if (response.status === 'success') {
										resolve({ status: 'success', uid: response.uid });
									} else {
										resolve({ status: 'error', message: response.message });
									}
									return;
								} catch {
									// Riga non-JSON — continua a leggere
								}
							}
							buffer = lines[lines.length - 1];
						}
					} catch (err) {
						if (cancelled) return;
						clearTimeout(timeout);
						const msg = err instanceof Error ? err.message : String(err);
						console.error('[webserial] readLoop error:', err);
						resolve({ status: 'error', message: `Errore di lettura seriale: ${msg}` });
					}
				};

				readLoop();
			});
		} finally {
			if (cancelled) {
				try {
					await reader.cancel();
				} catch {
					// Ignora
				}
			}
			try {
				reader.releaseLock();
			} catch {
				// Il reader potrebbe essere già in stato di errore/released
			}
		}
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
