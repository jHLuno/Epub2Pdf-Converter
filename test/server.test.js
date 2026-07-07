import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/server.js';

let tmpRoot;

afterEach(async () => {
  if (tmpRoot) {
    await fs.rm(tmpRoot, { recursive: true, force: true });
    tmpRoot = undefined;
  }
});

async function makeFixture(name, content = 'fixture') {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'epub-test-'));
  const filePath = path.join(tmpRoot, name);
  await fs.writeFile(filePath, content);
  return filePath;
}

describe('POST /convert', () => {
  it('rejects requests without a file', async () => {
    const app = createApp({ convert: vi.fn() });
    const response = await request(app).post('/convert');

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Choose an EPUB');
  });

  it('rejects non-epub uploads', async () => {
    const fixture = await makeFixture('book.txt');
    const app = createApp({ convert: vi.fn() });
    const response = await request(app).post('/convert').attach('book', fixture);

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('.epub');
  });

  it('returns a pdf attachment after conversion', async () => {
    const fixture = await makeFixture('book.epub');
    const convert = vi.fn(async (_input, output) => {
      await fs.writeFile(output, '%PDF-1.4\n');
    });
    const app = createApp({ convert });

    const response = await request(app).post('/convert').attach('book', fixture);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toContain('book.pdf');
    expect(response.body.toString()).toContain('%PDF-1.4');
    expect(convert).toHaveBeenCalledOnce();
  });

  it('returns a clear JSON error when an upload is too large', async () => {
    const fixture = await makeFixture('book.epub', 'this upload is too large for the test limit');
    const app = createApp({ convert: vi.fn(), maxFileSizeBytes: 8 });
    const response = await request(app).post('/convert').attach('book', fixture);

    expect(response.status).toBe(413);
    expect(response.type).toContain('json');
    expect(response.body.error).toContain('too large');
  });
});
