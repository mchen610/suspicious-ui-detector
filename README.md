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