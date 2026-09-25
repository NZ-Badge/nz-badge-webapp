import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	release: null as null | { filePath: string },
	stat: vi.fn(),
	createReadStream: vi.fn()
}));

vi.mock('$lib/db', () => ({
	db: {
		select: () => ({
			from: () => ({
				where: () => ({ limit: async () => (mocks.release ? [mocks.release] : []) })
			})
		})
	}
}));
vi.mock('fs/promises', () => ({ stat: mocks.stat }));
vi.mock('fs', () => ({ createReadStream: mocks.createReadStream }));

import { GET } from './+server';

function event() {
	return {
		params: { version: '1.2.3' },
		locals: { verifyDevice: async () => ({ deviceId: 'reader-1' }) }
	} as unknown as Parameters<typeof GET>[0];
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.release = { filePath: 'firmware/reader-station/1.2.3.bin' };
});

describe('GET /api/v1/firmware/download/:version', () => {
	it('streams the active release with the device contract headers', async () => {
		const bytes = Buffer.from([0xe9, 0x01, 0x02, 0x03]);
		mocks.stat.mockResolvedValue({ isFile: () => true, size: bytes.length });
		mocks.createReadStream.mockReturnValue(Readable.from([bytes]));

		const response = await GET(event());

		expect(response.status).toBe(200);
		expect(Object.fromEntries(response.headers)).toEqual({
			'content-type': 'application/octet-stream',
			'content-length': '4',
			'content-disposition': 'attachment; filename="reader-station-1.2.3.bin"',
			'cache-control': 'no-store'
		});
		expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
		expect(mocks.createReadStream.mock.calls[0][0]).toMatch(
			/localfiles[/\\]firmware[/\\]reader-station[/\\]1\.2\.3\.bin$/
		);
	});

	it('returns 404 for a missing or inactive release', async () => {
		mocks.release = null;
		expect((await GET(event())).status).toBe(404);
	});

	it('returns 500 when the file is missing on disk', async () => {
		mocks.stat.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
		const response = await GET(event());
		expect(response.status).toBe(500);
		expect(mocks.createReadStream).not.toHaveBeenCalled();
	});
});
