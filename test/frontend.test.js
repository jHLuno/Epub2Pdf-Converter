import fs from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('converter page markup', () => {
  it('contains the upload form and required assets', async () => {
    const html = await fs.readFile('public/index.html', 'utf8');

    expect(html).toContain('id="convertForm"');
    expect(html).toContain('id="fileInput"');
    expect(html).toContain('type="file"');
    expect(html).toContain('accept=".epub,application/epub+zip"');
    expect(html).toContain('id="dropZone"');
    expect(html).toContain('id="convertButton"');
    expect(html).toContain('id="conversionProgress"');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('id="progressTrack"');
    expect(html).toContain('id="progressPercent"');
    expect(html).toContain('href="/styles.css"');
    expect(html).toContain('src="/app.js"');
  });
});
