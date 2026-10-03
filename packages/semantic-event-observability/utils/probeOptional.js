/**
 * Probe optional npm packages or globals without throwing.
 * Works in browser ESM environments where packages may not be installed.
 */

export async function probeOptionalModule(specifier, globalName = null) {
	if (globalName && typeof globalThis !== 'undefined' && globalThis[globalName]) {
		return { source: 'global', module: globalThis[globalName] }
	}

	try {
		const module = await import(/* @vite-ignore */ specifier)
		return { source: 'module', module }
	} catch {
		return null
	}
}

export function probeOptionalGlobal(globalName) {
	if (typeof globalThis === 'undefined') return null
	return globalThis[globalName] || null
}

/**
 * Resolve an exporter dependency from config injection first, then global, then dynamic import.
 */
export async function resolveOptionalDependency(configValue, options = {}) {
	if (configValue) {
		return { source: 'config', module: configValue }
	}

	const globalValue = probeOptionalGlobal(options.globalName)
	if (globalValue) {
		return { source: 'global', module: globalValue }
	}

	if (options.moduleSpecifier) {
		return probeOptionalModule(options.moduleSpecifier, options.globalName)
	}

	return null
}
