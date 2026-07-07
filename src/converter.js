import { spawn as defaultSpawn } from 'node:child_process';

export function findConverterCommand({ env = process.env, platform = process.platform } = {}) {
  if (env.EBOOK_CONVERT_PATH) {
    return env.EBOOK_CONVERT_PATH;
  }

  if (platform === 'darwin') {
    return '/Applications/calibre.app/Contents/MacOS/ebook-convert';
  }

  return 'ebook-convert';
}

export function runEbookConvert(inputPath, outputPath, { spawn = defaultSpawn, command = findConverterCommand() } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [inputPath, outputPath], {
      stdio: ['ignore', 'ignore', 'pipe']
    });

    let stderr = '';
    let settled = false;

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      if (settled) {
        return;
      }

      settled = true;

      if (error.code === 'ENOENT') {
        reject(new Error('Install Calibre and make sure ebook-convert is available, or set EBOOK_CONVERT_PATH.'));
        return;
      }

      reject(error);
    });

    child.on('close', (code) => {
      if (settled) {
        return;
      }

      settled = true;

      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `ebook-convert exited with code ${code}`));
    });
  });
}
