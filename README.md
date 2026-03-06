# Suspicious UI Detector



A Chrome extension that detects suspicious UI elements on web pages. 


---
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


## Testing

### Unit Tests

Run all unit tests:

```bash
npm run test    # or `npm run test:unit`
```

Run unit tests for a specific test module (`background/`, `content/`, `popup/`):

```bash
npm run test -- tests/<module>
```

### Integration Tests

Run all integration tests and view Playwright report:

```bash
npm run test:integration && npm run playwright:report
```

Run integration tests for a specific file (`selectors.integration.test.ts`, `extractor.integration.test.t`):

```bash
npm run test:integration -- tests/integration/<test_file>
```

Run all unit and integration tests:

```bash
npm run test:all
```


## Releasing

Pushing a version tag triggers a GitHub Actions workflow that builds the extension and publishes it as a `.zip` on GitHub Releases.

```bash
git tag v0.0.1
git push origin v0.0.1
```


---
## Authors

<p align="center">
  <b>Melvin Chen</b> 
  <a href="https://github.com/mchen610"><img src="https://img.shields.io/badge/GitHub-181717?style=flat&logo=github&logoColor=white" alt="GitHub" valign="middle"></a>
  <a href="https://linkedin.com/in/melvin-chen"><img src="https://img.shields.io/badge/LinkedIn-0A66C2?style=flat&logo=linkedin&logoColor=white" alt="LinkedIn" valign="middle"></a>
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <b>Preston Hemmy</b> 
  <a href="https://github.com/prestonhemmy"><img src="https://img.shields.io/badge/GitHub-181717?style=flat&logo=github&logoColor=white" alt="GitHub" valign="middle"></a>
  <a href="https://linkedin.com/in/prestonhemmy"><img src="https://img.shields.io/badge/LinkedIn-0A66C2?style=flat&logo=linkedin&logoColor=white" alt="LinkedIn" valign="middle"></a>
</p>