# Suspicious UI Detector

A Chrome extension that detects suspicious UI elements on web pages. 

## Releasing

Pushing a version tag triggers a GitHub Actions workflow that builds the extension and publishes it as a `.zip` on GitHub Releases.

```bash
git tag v0.0.1
git push origin v0.0.1
```

## Testing

Running all unit and integration tests with JSDOM:

```bash
npm run test
```

Running unit or integration tests for a specific test module (`background/`, `content/`, `popup/` and `integration/`):

```bash
npm run test -- tests/<module>
```
## Architecture

- **Chrome Extension** (Manifest V3) built with React, Tailwind, Vite, TypeScript
- **Content script** (`src/content/`): Reads page DOM/HTML, sends to LLM, highlights suspicious elements with explanations
- **Background service worker** (`src/background/`): Extension lifecycle, coordinates messaging between popup and content script
- **Popup** (`src/popup/`): Extension UI for settings (toggle detection, manage trusted URLs, etc.)
- **WebLLM**: In-browser LLM inference engine using WebGPU + WebAssembly. Target model size is 2-3B parameters. Runs in a Web Worker to avoid blocking the UI thread.
- **No backend**: this is intentional so all LLM inference runs locally in the browser to eliminate privacy risks. This removes the need for a backend (since typical LLMs need to be called securely with an API key). A backend thus would also
require user authentication which would add friction and require the user to trust our auth handling. A backend would also be significantly more maintenance and cost, requiring setting up cloud resources.

## Development

- `npm run dev` — watch mode build
- `npm run build` — production build to `dist/`
- Load `dist/` as unpacked extension in `chrome://extensions`

## Planned features

- Read page HTML and identify suspicious UI elements via LLM
- Highlight suspicious elements with AI-generated explanation of why
- Dismiss button for false positives
- Toggle detection on/off
- URL allowlist for trusted sites