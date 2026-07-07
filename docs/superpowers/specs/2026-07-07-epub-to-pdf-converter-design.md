# EPUB to PDF Converter Design

## Goal

Build a simple working web app that converts one `.epub` file into one `.pdf` file. The app should work from desktop and mobile browsers through either drag-and-drop or the native file picker.

## Recommended Approach

Use a small Node.js server with an Express web frontend and a single conversion endpoint.

This avoids unreliable browser-only EPUB rendering and keeps the user flow simple: choose an EPUB, upload it, wait for conversion, then download the generated PDF.

## User Experience

- The first screen is the converter itself, not a landing page.
- The page has one large drop area that also opens the native file picker.
- The UI shows the selected file name, conversion status, errors, and a download result.
- Only one file is processed at a time.
- The layout is responsive for phones, tablets, and desktop screens.

## Backend Flow

1. `POST /convert` receives one uploaded `.epub` file.
2. The server validates the extension and MIME-like upload shape.
3. The file is written to a temporary per-request folder.
4. A local conversion command turns the EPUB into a PDF.
5. The server streams the PDF back as an attachment.
6. Temporary files are removed after the response finishes or fails.

## Conversion Engine

Prefer a local command-line converter invoked by Node. The implementation should detect and use an available EPUB-to-PDF tool, with clear setup guidance when no converter is installed.

The first supported converter will be Calibre's `ebook-convert`, because it is mature and produces real PDFs from EPUB input.

## Error Handling

- Wrong file type: show a friendly `.epub only` message.
- Missing converter: explain that Calibre / `ebook-convert` must be installed.
- Conversion failure: show a concise failure message and keep the user on the same page.
- Network/server failure: show a retryable error.

## Testing

- Unit tests cover file validation and converter discovery behavior.
- Endpoint tests cover missing file and wrong file type behavior.
- Manual verification runs the app locally and confirms the UI loads. If a sample EPUB is available or generated, verify that conversion returns a downloadable PDF.
