import { createMemoryExporter } from './memory.js'
import { createConsoleExporter } from './console.js'
import { createDevPanelExporter } from './devPanel.js'
import { createOtelExporter } from './otel.js'
import { createFaroExporter } from './faro.js'
import { createLangfuseExporter } from './langfuse.js'
import { createLangsmithExporter } from './langsmith.js'
import { createWebVitalsExporter } from './webVitals.js'

export const BUILTIN_EXPORTERS = {
	memory: createMemoryExporter,
	console: createConsoleExporter,
	devPanel: createDevPanelExporter,
	otel: createOtelExporter,
	faro: createFaroExporter,
	langfuse: createLangfuseExporter,
	langsmith: createLangsmithExporter,
	webVitals: createWebVitalsExporter,
}

export async function createExporters(requested = [], config = {}) {
	const exporters = []
	const unique = [...new Set(requested)]

	for (const name of unique) {
		const factory = BUILTIN_EXPORTERS[name]
		if (!factory) continue

		const exporterConfig = config[name] || {}
		const exporter = factory(exporterConfig)
		exporters.push(exporter)
	}

	return exporters
}

export async function initExporters(exporters, context) {
	const status = []

	for (const exporter of exporters) {
		try {
			await exporter.init?.(context)
			status.push({
				id: exporter.id,
				available: exporter.available !== false,
				description: exporter.description,
			})
		} catch (error) {
			status.push({
				id: exporter.id,
				available: false,
				error: error?.message || String(error),
			})
		}
	}

	return status
}
