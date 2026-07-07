const form = document.querySelector('#convertForm');
const fileInput = document.querySelector('#fileInput');
const dropZone = document.querySelector('#dropZone');
const fileName = document.querySelector('#fileName');
const clearButton = document.querySelector('#clearButton');
const convertButton = document.querySelector('#convertButton');
const statusText = document.querySelector('#status');

let currentFile = null;

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.classList.toggle('is-error', isError);
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
    return;
  }

  setInputFile(currentFile);
  fileName.textContent = currentFile.name;
  clearButton.hidden = false;
  convertButton.disabled = false;
  setStatus('Ready to convert.');
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
    setStatus('PDF downloaded.');
  } catch (error) {
    setStatus(error.message || 'Conversion failed.', true);
  } finally {
    convertButton.disabled = false;
  }
});
