# C2PA Demo: Sign & Verify (Next.js)

This project is now a [Next.js](https://nextjs.org/) App Router application that exposes UI and API routes for signing and verifying images with [`c2patool`](https://github.com/contentauth/c2pa/tree/main/tools/cli). The legacy bespoke Node/Docker stack has been retired in favour of built-in API routes and environment-driven configuration that works well on DigitalOcean App Platform or a standard Node host.

> **Security note**: Never commit private keys. Sample manifests and trust bundles are provided only for local testing.

## Project layout

- `app/` – App Router routes, including `/api/sign` and `/api/verify`.
- `components/` – Reusable UI components built with Tailwind CSS + shadcn/ui primitives.
- `lib/` – Shared utilities for calling `c2patool` and working with manifests.
- `public/` – Static assets served by Next.js.

## Prerequisites

- Node.js 18+
- `c2patool` binary available on the server PATH (or configure `C2PA_TOOL_PATH`).

## Getting started locally

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. The UI allows you to pick an image, sign it, and verify the resulting attestations directly from the browser via the built-in API routes.

To create a production build and run it:

```bash
npm run build
npm run start
```

## Configuring signing materials

The API routes resolve signing artefacts from environment variables or fallback files in the repository. Provide **one** of the following for each artefact:

| Artefact | Environment variables | Fallback file |
| --- | --- | --- |
| C2PA manifest | `C2PA_MANIFEST_PATH`, `C2PA_MANIFEST_JSON`, or `C2PA_MANIFEST_BASE64` | `manifest.json` |
| Trust bundle PEM | `C2PA_TRUST_BUNDLE_PATH`, `C2PA_TRUST_BUNDLE_PEM`, or `C2PA_TRUST_BUNDLE_BASE64` | `C2PA-TRUST-BUNDLE.pem` |
| c2patool binary | `C2PA_TOOL_PATH` | `c2patool` on `PATH` |

- `*_PATH` should point to a readable file on disk.
- `*_JSON` / `*_PEM` may contain the full document contents.
- `*_BASE64` may contain the base64 encoding of the document (useful for platforms that only allow secret environment variables).

Example of encoding a PEM trust bundle for an environment variable:

```bash
base64 -w0 C2PA-TRUST-BUNDLE.pem
```

Set the resulting string as the value of `C2PA_TRUST_BUNDLE_BASE64`. Similar approaches work for the manifest.

A sample manifest is provided as `manifest.sample.json`; copy it to `manifest.json` for local experiments and update the key/cert paths accordingly. **Do not** commit private keys.

## Deployment on DigitalOcean

### App Platform

1. Create a new App on DigitalOcean and connect this repository.
2. Use the “Next.js” build pack or configure a Node service with:
   - Build command: `npm install && npm run build`
   - Run command: `npm run start`
3. Add environment variables (marked as “secret” where appropriate):
   - `C2PA_TRUST_BUNDLE_BASE64` – base64 encoded PEM trust chain.
   - `C2PA_MANIFEST_BASE64` – base64 encoded manifest JSON (or use `C2PA_MANIFEST_JSON`).
   - Optional: `C2PA_TOOL_PATH` if `c2patool` lives outside the default PATH.
4. Add a build-time `npm install -g @contentauth/c2pa` step or bundle your own binary (App Platform supports post-build commands). Alternatively, bake the binary into the repo using a custom step.
5. Deploy. App Platform will run `next start`, exposing both the UI and the API routes on the same service.

### Droplet (Ubuntu example)

```bash
# install dependencies
sudo apt-get update
apt-get install -y nodejs npm
npm install -g @contentauth/c2pa

# deploy app
git clone <repo>
cd c2pasign
npm install
C2PA_TRUST_BUNDLE_BASE64=... C2PA_MANIFEST_BASE64=... npm run build
C2PA_TRUST_BUNDLE_BASE64=... C2PA_MANIFEST_BASE64=... npm run start
```

Use a process manager such as `pm2` or systemd for long-running services. Configure environment variables in the manager, not in source control.

## API contract

The new API shape mirrors the previous Node server:

- `GET /api/health` – lightweight health check used by platform probes.
- `POST /api/sign` – body `{ imageName, imageData }` (data URL or raw base64). Returns `{ ok, fileName, dataUrl }`, where `fileName` mirrors the uploaded extension (for easier downloads) and `dataUrl` is the signed asset.
- `POST /api/verify` – body `{ imageName, imageData }`. Returns `{ ok, output, error }`.

Responses include trimmed stdout/stderr from `c2patool` to aid debugging. Errors include useful messages to help diagnose missing binaries or trust material.

## Styling

Tailwind CSS and shadcn/ui provide the component baseline. Customize themes by editing `app/globals.css` and `tailwind.config.ts`. The default design mirrors the dark, card-driven look of the original prototype while offering responsive layout improvements.

## Legacy scripts

The legacy Docker helper scripts (`run.sh`, `Dockerfile`, etc.) have been removed. If you need a single-container deployment, consider building a lightweight Node image that runs `npm run start` after installing `c2patool` and supplying secrets via environment variables.
