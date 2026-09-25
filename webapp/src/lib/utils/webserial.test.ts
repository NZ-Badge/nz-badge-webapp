import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseJsonLine, readJsonLines, readLines, sendAndAwait } from './webserial';

const encoder = new TextEncoder();

/** Reader finto: restituisce i chunk indicati, poi resta in attesa finché non viene cancellato. */
function fakeReader(chunks: string[], { hang = true } = {}) {
	const queue = chunks.map((c) => encoder.encode(c));
	let cancel: (() => void) | null = null;
	const reader = {
		read: vi.fn(
			() =>
				new Promise<ReadableStreamReadResult<Uint8Array>>((resolve) => {
					const next = queue.shift();
					if (next) return resolve({ value: next, done: false });
					if (!hang) return resolve({ value: undefined, done: true });
					cancel = () => resolve({ value: undefined, done: true });
				})
		),
		cancel: vi.fn(async () => cancel?.()),
		releaseLock: vi.fn()
	};
	return reader as unknown as ReadableStreamDefaultReader<Uint8Array> & typeof reader;
}

function fakePort(reader: ReturnType<typeof fakeReader>) {
	const written: string[] = [];
	const writer = {
		write: vi.fn(async (chunk: Uint8Array) => {
			written.push(new TextDecoder().decode(chunk));
		}),
		releaseLock: vi.fn()
	};
	const port = {
		readable: { getReader: () => reader },
		writable: { getWriter: () => writer }
	} as unknown as SerialPort;
	return { port, written, writer };
}

async function collect<T>(iterable: AsyncIterable<T>) {
	const out: T[] = [];
	for await (const item of iterable) out.push(item);
	return out;
}

afterEach(() => vi.useRealTimers());

describe('readLines', () => {
	it('joins partial chunks and skips blank lines', async () => {
		const reader = fakeReader(['[BO', 'OT] ready\n\n  \r\n{"a":', '1}\ntail'], { hang: false });
		expect(await collect(readLines(reader))).toEqual(['[BOOT] ready', '{"a":1}']);
	});
});

describe('readJsonLines / parseJsonLine', () => {
	it('keeps only JSON lines', async () => {
		const reader = fakeReader(['log line\n{"status":"success"}\nnot json\n'], { hang: false });
		expect(await collect(readJsonLines(reader))).toEqual([{ status: 'success' }]);
	});

	it('returns null for non-JSON text', () => {
		expect(parseJsonLine('hello')).toBeNull();
		expect(parseJsonLine('{"x":2}')).toEqual({ x: 2 });
	});
});

describe('sendAndAwait', () => {
	const options = { timeoutMs: 1000, timeoutMessage: 'Timeout (1s)' };

	it('writes a JSON line and resolves with the first JSON response', async () => {
		const reader = fakeReader(['[LOG] waiting\n', '{"status":"success","uid":"AA"}\n']);
		const { port, written, writer } = fakePort(reader);

		const result = await sendAndAwait(port, { cmd: 'read_card' }, options);

		expect(written).toEqual(['{"cmd":"read_card"}\n']);
		expect(writer.releaseLock).toHaveBeenCalled();
		expect(result).toEqual({ status: 'success', uid: 'AA' });
		expect(reader.cancel).not.toHaveBeenCalled();
		expect(reader.releaseLock).toHaveBeenCalledTimes(1);
	});

	it('cancels the pending read and releases the lock on timeout', async () => {
		vi.useFakeTimers();
		const reader = fakeReader([]);
		const { port } = fakePort(reader);

		const pending = sendAndAwait(port, { cmd: 'scan_card' }, options);
		await vi.advanceTimersByTimeAsync(1000);

		await expect(pending).resolves.toEqual({ status: 'timeout', message: 'Timeout (1s)' });
		expect(reader.cancel).toHaveBeenCalledTimes(1);
		expect(reader.releaseLock).toHaveBeenCalledTimes(1);
	});

	it('reports read errors', async () => {
		const reader = fakeReader([]);
		reader.read.mockRejectedValueOnce(new Error('device lost'));
		const { port } = fakePort(reader);
		vi.spyOn(console, 'error').mockImplementation(() => {});

		await expect(sendAndAwait(port, { cmd: 'read_card' }, options)).resolves.toEqual({
			status: 'error',
			message: 'Errore di lettura seriale: device lost'
		});
		expect(reader.releaseLock).toHaveBeenCalled();
	});

	it('rejects when the port streams are gone', async () => {
		const port = { readable: null, writable: null } as unknown as SerialPort;
		await expect(sendAndAwait(port, { cmd: 'read_card' }, options)).rejects.toThrow(
			'Riconnettere il dispositivo'
		);
	});
});
