import { describe, expect, it, vi } from 'vitest';
import { convertEpubToPdf, findConverterCommand, runEbookConvert } from '../src/converter.js';

describe('findConverterCommand', () => {
  it('prefers an explicit converter path', () => {
    expect(findConverterCommand({ env: { EBOOK_CONVERT_PATH: '/tmp/ebook-convert' }, platform: 'linux' })).toBe(
      '/tmp/ebook-convert'
    );
  });

  it('uses the Calibre app path on macOS when no explicit path is set', () => {
    expect(findConverterCommand({ env: {}, platform: 'darwin' })).toBe(
      '/Applications/calibre.app/Contents/MacOS/ebook-convert'
    );
  });

  it('falls back to ebook-convert on other platforms', () => {
    expect(findConverterCommand({ env: {}, platform: 'win32' })).toBe('ebook-convert');
  });
});

describe('runEbookConvert', () => {
  it('resolves when ebook-convert exits successfully', async () => {
    const spawn = vi.fn(() => ({
      stderr: { on: vi.fn() },
      on(event, callback) {
        if (event === 'close') {
          callback(0);
        }
      }
    }));

    await expect(runEbookConvert('/in.epub', '/out.pdf', { spawn, command: 'ebook-convert' })).resolves.toBeUndefined();
    expect(spawn).toHaveBeenCalledWith('ebook-convert', ['/in.epub', '/out.pdf'], {
      stdio: ['ignore', 'ignore', 'pipe']
    });
  });

  it('rejects with setup guidance when the command is missing', async () => {
    const spawn = vi.fn(() => ({
      stderr: { on: vi.fn() },
      on(event, callback) {
        if (event === 'error') {
          callback(Object.assign(new Error('missing'), { code: 'ENOENT' }));
        }
      }
    }));

    await expect(runEbookConvert('/in.epub', '/out.pdf', { spawn, command: 'missing' })).rejects.toThrow(
      'Install Calibre'
    );
  });

  it('rejects with stderr when ebook-convert exits unsuccessfully', async () => {
    const spawn = vi.fn(() => ({
      stderr: {
        on(event, callback) {
          if (event === 'data') {
            callback(Buffer.from('bad epub'));
          }
        }
      },
      on(event, callback) {
        if (event === 'close') {
          callback(1);
        }
      }
    }));

    await expect(runEbookConvert('/in.epub', '/out.pdf', { spawn, command: 'ebook-convert' })).rejects.toThrow(
      'bad epub'
    );
  });
});

describe('convertEpubToPdf', () => {
  it('uses Calibre conversion when it succeeds', async () => {
    const convertWithCalibre = vi.fn(async () => {});
    const fallback = vi.fn(async () => {});

    await convertEpubToPdf('/in.epub', '/out.pdf', { convertWithCalibre, fallback });

    expect(convertWithCalibre).toHaveBeenCalledWith('/in.epub', '/out.pdf');
    expect(fallback).not.toHaveBeenCalled();
  });

  it('falls back to the built-in converter when Calibre is missing', async () => {
    const convertWithCalibre = vi.fn(async () => {
      throw new Error('Install Calibre and make sure ebook-convert is available, or set EBOOK_CONVERT_PATH.');
    });
    const fallback = vi.fn(async () => {});

    await convertEpubToPdf('/in.epub', '/out.pdf', { convertWithCalibre, fallback });

    expect(fallback).toHaveBeenCalledWith('/in.epub', '/out.pdf');
  });

  it('keeps real Calibre conversion failures visible', async () => {
    const convertWithCalibre = vi.fn(async () => {
      throw new Error('bad epub');
    });
    const fallback = vi.fn(async () => {});

    await expect(convertEpubToPdf('/in.epub', '/out.pdf', { convertWithCalibre, fallback })).rejects.toThrow('bad epub');
    expect(fallback).not.toHaveBeenCalled();
  });
});
