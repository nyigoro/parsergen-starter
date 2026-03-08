# WebGPU Smoke Testing

WebGPU smoke specs are skipped in standard CI because free-tier runners do not
provide GPU hardware. This document explains how to run them locally.

## Prerequisites
- A machine with an integrated or discrete GPU
- Chrome 113+ or Edge 113+ with WebGPU support
- Node.js 20+
- Playwright Chromium installed: `npx playwright install chromium`
- `wabt` installed if you also run the full browser smoke suite with the WASM
  load spec:
  - Ubuntu/Debian: `sudo apt install wabt`
  - macOS: `brew install wabt`

## Verify WebGPU Is Available
Open `chrome://gpu` and confirm `WebGPU: Hardware accelerated`.

Or run the probe:

```bash
npm run doctor:webgpu
```

The doctor checks more than `navigator.gpu`. It also calls
`navigator.gpu.requestAdapter()` in Playwright Chromium. That matters because
some environments expose the API but still cannot provide a usable adapter for
actual compute/render work.

## Run WebGPU Smoke Specs

POSIX shells:

```bash
LUMINA_BROWSER_SMOKE=1 LUMINA_WEBGPU_SMOKE=1 npm run test:webgpu
```

PowerShell:

```powershell
$env:LUMINA_BROWSER_SMOKE=1
$env:LUMINA_WEBGPU_SMOKE=1
npm run test:webgpu
```

## Specs Covered
- `tests/browser/smoke/webgpu-compute.spec.ts` - adapter/device init and
  compute pipeline creation
- `tests/browser/smoke/webgpu-render.spec.ts` - GPU buffer round-trip and
  center-pixel render assertion

## Why CI Skips These
GitHub Actions free-tier runners do not expose GPU hardware. Running WebGPU in
that environment produces misleading results, so these specs are intentionally
gated and skipped cleanly.

## Self-Hosted Runner (Future)
If a GPU-capable self-hosted runner becomes available, add it to
`.github/workflows/ci.yml` with:

```yaml
runs-on: [self-hosted, gpu]
env:
  LUMINA_BROWSER_SMOKE: '1'
  LUMINA_WEBGPU_SMOKE: '1'
```
