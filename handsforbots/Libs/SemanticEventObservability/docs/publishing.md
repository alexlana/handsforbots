# Publishing to npm

The package lives at `handsforbots/Libs/SemanticEventObservability/` and is named **`@handsforbots/semantic-event-observability`**.

## Single source of truth

| Field | Source |
|-------|--------|
| Package name / scope | `packageIdentity.js` → `PACKAGE_NAME` |
| Version | `packageIdentity.js` → `PACKAGE_VERSION` **and** `package.json` → `version` |
| Global debug key | Derived from `PACKAGE_SLUG` via `getPackageIdentity()` |
| OTel service name | `identity.otelServiceName` (= slug) |

**Before every publish**, keep `package.json` version in sync with `PACKAGE_VERSION` in `packageIdentity.js`.

## Pre-publish checklist

```bash
cd handsforbots/Libs/SemanticEventObservability
npm test
npm pack --dry-run   # verify files list
```

Confirm `files` in `package.json` includes everything consumers need (`index.js`, `index.d.ts`, `core/`, `adapters/`, `exporters/`, `utils/`).

## Publish (maintainers)

```bash
npm login
npm publish --access public
```

Scoped package `@handsforbots/*` requires `--access public` on first publish.

## Consumer install

```bash
npm i @handsforbots/semantic-event-observability
```

Optional peers (install only what you use):

```bash
npm i @opentelemetry/api @grafana/faro-web-sdk
```

TypeScript consumers get types from `index.d.ts` automatically (`"types"` field in `package.json`).

## Monorepo / local development

Hands for Bots imports the lib from the repo path. No publish required for local work. The Vite example uses the same source tree.

## Renaming the package

If the public npm name changes, update **`PACKAGE_SLUG`** in `packageIdentity.js` only. Storage keys, globals, and dashboard UIDs derive from it. See [renaming.md](./renaming.md).
