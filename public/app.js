const form = document.querySelector('#convertForm');
const fileInput = document.querySelector('#fileInput');
const dropZone = document.querySelector('#dropZone');
const fileName = document.querySelector('#fileName');
const clearButton = document.querySelector('#clearButton');
const convertButton = document.querySelector('#convertButton');
const statusText = document.querySelector('#status');
const conversionProgress = document.querySelector('#conversionProgress');
const progressTrack = document.querySelector('#progressTrack');
const progressStage = document.querySelector('#progressStage');
const progressPercent = document.querySelector('#progressPercent');
const stageItems = [...document.querySelectorAll('.stage-item')];

let currentFile = null;
let progressTimer;
let progressStartedAt = 0;
let estimatedTotalMs = 0;

const progressStages = [
  { label: 'Uploading the EPUB', threshold: 12 },
  { label: 'Unpacking chapters and images', threshold: 34 },
  { label: 'Rendering pages in the workshop', threshold: 76 },
  { label: 'Binding the final PDF', threshold: 92 }
];

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.classList.toggle('is-error', isError);
  statusText.classList.toggle('is-success', !isError && message === 'PDF downloaded.');
}

function formatRemainingTime(ms) {
  const seconds = Math.max(1, Math.ceil(ms / 1000));

  if (seconds < 60) {
    return `about ${seconds}s left`;
  }

  const minutes = Math.ceil(seconds / 60);
  return `about ${minutes} min left`;
}

function setProgress(percent, stageIndex, remainingText = '') {
  const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
  const activeStage = progressStages[Math.min(stageIndex, progressStages.length - 1)];

  progressTrack.style.width = `${safePercent}%`;
  progressPercent.textContent = `${safePercent}%`;
  progressStage.textContent = remainingText ? `${activeStage.label} · ${remainingText}` : activeStage.label;
  conversionProgress.setAttribute('aria-valuenow', String(safePercent));

  stageItems.forEach((item, index) => {
    item.classList.toggle('is-active', index === stageIndex);
    item.classList.toggle('is-complete', index < stageIndex || safePercent === 100);
  });
}

function estimateConversionTime(file) {
  const sizeMb = file ? file.size / 1024 / 1024 : 1;
  return Math.min(180_000, Math.max(32_000, 24_000 + sizeMb * 2_600));
}

function updateEstimatedProgress() {
  const elapsedMs = Date.now() - progressStartedAt;
  const rawPercent = Math.min(92, (elapsedMs / estimatedTotalMs) * 92);
  const easedPercent = rawPercent < 92 ? 92 * (1 - Math.exp(-rawPercent / 44)) : rawPercent;
  const stageIndex = progressStages.findIndex((stage) => easedPercent < stage.threshold);
  const activeStageIndex = stageIndex === -1 ? progressStages.length - 1 : stageIndex;
  const remainingMs = Math.max(estimatedTotalMs - elapsedMs, 2_000);

  setProgress(easedPercent, activeStageIndex, formatRemainingTime(remainingMs));
}

function startProgress(file) {
  window.clearInterval(progressTimer);
  progressStartedAt = Date.now();
  estimatedTotalMs = estimateConversionTime(file);
  conversionProgress.hidden = false;
  form.classList.add('is-converting');
  setProgress(4, 0, formatRemainingTime(estimatedTotalMs));
  progressTimer = window.setInterval(updateEstimatedProgress, 650);
}

function finishProgress() {
  window.clearInterval(progressTimer);
  conversionProgress.hidden = false;
  form.classList.remove('is-converting');
  setProgress(100, progressStages.length - 1, 'ready to download');
}

function resetProgress() {
  window.clearInterval(progressTimer);
  form.classList.remove('is-converting');
  conversionProgress.hidden = true;
  setProgress(0, 0);
}

function setInputFile(file) {
  if (!file || typeof DataTransfer === 'undefined') {
    return;
  }

  const transfer = new DataTransfer();
  transfer.items.add(file);
  fileInput.files = transfer.files;
}

function setFile(file) {
  currentFile = file || null;

  if (!currentFile) {
    fileInput.value = '';
    fileName.textContent = 'No file selected';
    clearButton.hidden = true;
    convertButton.disabled = true;
    setStatus('');
    resetProgress();
    return;
  }

  setInputFile(currentFile);
  fileName.textContent = currentFile.name;
  clearButton.hidden = false;
  convertButton.disabled = false;
  setStatus('Ready to convert.');
  resetProgress();
}

fileInput.addEventListener('change', () => {
  setFile(fileInput.files?.[0]);
});

clearButton.addEventListener('click', () => {
  setFile(null);
});

for (const eventName of ['dragenter', 'dragover']) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add('is-dragging');
  });
}

for (const eventName of ['dragleave', 'drop']) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove('is-dragging');
  });
}

dropZone.addEventListener('drop', (event) => {
  const file = event.dataTransfer?.files?.[0];

  if (file) {
    setFile(file);
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!currentFile) {
    setStatus('Choose an EPUB file first.', true);
    return;
  }

  if (!currentFile.name.toLowerCase().endsWith('.epub')) {
    setStatus('Only .epub files can be converted.', true);
    return;
  }

  convertButton.disabled = true;
  startProgress(currentFile);
  setStatus('Converting...');

  const body = new FormData();
  body.append('book', currentFile);

  try {
    const response = await fetch('/convert', {
      method: 'POST',
      body
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'Conversion failed.');
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = currentFile.name.replace(/\.epub$/i, '.pdf');
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    finishProgress();
    setStatus('PDF downloaded.');
  } catch (error) {
    resetProgress();
    setStatus(error.message || 'Conversion failed.', true);
  } finally {
    convertButton.disabled = !currentFile;
  }
});
