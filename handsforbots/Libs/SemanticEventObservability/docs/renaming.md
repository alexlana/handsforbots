# Renaming the package

The library is published under a **working title**. To rename without breaking integrations:

## 1. Edit `packageIdentity.js`

```javascript
export const PACKAGE_SLUG = 'your-new-name'
export const PACKAGE_DISPLAY_NAME = 'Your New Name'
export const PACKAGE_SCOPE = '@your-org' // optional
```

## 2. Update `package.json`

```json
{
  "name": "@your-org/your-new-name"
}
```

## 3. Derived identifiers (automatic)

`getPackageIdentity()` builds these from `PACKAGE_SLUG`:

| Derived | Example |
|---------|---------|
| npm name | `@your-org/your-new-name` |
| Global debug API | `__YOUR_NEW_NAME__` (slug uppercased, `-` → `_`) |
| localStorage debug key | `your-new-name:debug` |
| OTel `service.name` | `your-new-name` |
| Grafana dashboard UID | `your-new-name` |

**Do not hardcode these strings elsewhere.** Import from `packageIdentity.js` or `getPackageIdentity()`.

## 4. After rename checklist

- [ ] Update README and docs references (human-readable name only)
- [ ] Re-import Grafana dashboard (UID changes with slug)
- [ ] Update collector rules / Loki labels if they filter on `service_name`
- [ ] Notify consumers to update localStorage debug key
- [ ] Publish new npm package (old name can remain as deprecated alias if needed)

## 5. Hands for Bots import path

While embedded in this monorepo:

```javascript
import { attachHandsForBotsObservability } from './Libs/SemanticEventObservability/adapters/handsforbots.js'
```

After npm publish:

```javascript
import { attachHandsForBotsObservability } from '@your-org/your-new-name/adapters/handsforbots'
```

The adapter API stays stable; only the import path changes.

## 6. Alias strategy for npm

When renaming publicly, you can publish both packages for one major cycle:

```json
// old package.json
{ "name": "@handsforbots/semantic-event-observability", "deprecated": "Use @handsforbots/new-name" }
```

Re-export from the old entry point:

```javascript
export * from '@handsforbots/new-name'
```
