/**
 * Single source of truth for package naming.
 * When the public npm name is chosen, change PACKAGE_SLUG here only.
 * All storage keys, globals, and telemetry service names are derived from it.
 */

/** npm package slug (kebab-case). Change this when the final name is decided. */
export const PACKAGE_SLUG = 'semantic-event-observability'

/** Human-readable product name shown in UI and docs. */
export const PACKAGE_DISPLAY_NAME = 'Semantic Event Observability'

/** npm scope placeholder for future publish (optional). */
export const PACKAGE_SCOPE = '@handsforbots'

export const PACKAGE_NAME = `${PACKAGE_SCOPE}/${PACKAGE_SLUG}`

/** Semantic version — keep in sync with package.json when publishing. */
export const PACKAGE_VERSION = '0.1.0'

/**
 * Derive stable identifiers from PACKAGE_SLUG.
 * Do not hardcode these strings elsewhere in the codebase.
 */
export function getPackageIdentity(overrides = {}) {
	const slug = overrides.slug || PACKAGE_SLUG
	const displayName = overrides.displayName || PACKAGE_DISPLAY_NAME

	return {
		slug,
		displayName,
		packageName: overrides.packageName || `${PACKAGE_SCOPE}/${slug}`,
		version: overrides.version || PACKAGE_VERSION,
		globalKey: `__${slug.replace(/-/g, '_').toUpperCase()}__`,
		debugStorageKey: `${slug}:debug`,
		sessionStorageKey: `${slug}:session`,
		otelServiceName: slug,
		grafanaDashboardUid: slug,
	}
}
