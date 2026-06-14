import { getPackageIdentity } from '../packageIdentity.js'

/**
 * Lightweight in-browser panel for quick triage.
 * Full analysis remains in Grafana.
 */
export function createDevPanelExporter(config = {}) {
	const id = 'devPanel'
	const identity = getPackageIdentity(config.identity)
	let panel = null
	let host = null
	let contextRef = null

	return {
		id,
		available: typeof document !== 'undefined',
		description: 'Optional floating panel with recent semantic events',

		async init(context) {
			contextRef = context
			if (!this.available) return
			if (config.enabled === false) return
			if (!shouldEnablePanel(identity, config)) return
			mountPanel(identity, config)
		},

		onEvent(event) {
			if (!panel) return
			appendEventRow(panel.list, event)
		},

		onMetric(metric) {
			if (!panel) return
			appendMetricRow(panel.metrics, metric)
		},

		destroy() {
			host?.remove()
			panel = null
			host = null
		},
	}

	function mountPanel(identity, config) {
		host = document.createElement('div')
		host.setAttribute('data-seo-devpanel', identity.slug)
		host.style.cssText = [
			'position:fixed',
			'bottom:12px',
			'right:12px',
			'width:360px',
			'max-height:45vh',
			'background:#111',
			'color:#eee',
			'font:12px/1.4 monospace',
			'border:1px solid #444',
			'border-radius:8px',
			'z-index:99999',
			'overflow:hidden',
			'box-shadow:0 8px 24px rgba(0,0,0,.35)',
		].join(';')

		host.innerHTML = `
			<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:#1b1b1b;border-bottom:1px solid #333">
				<strong>${identity.displayName}</strong>
				<div>
					<button type="button" data-seo-action="export" style="margin-right:6px">export</button>
					<button type="button" data-seo-action="close">×</button>
				</div>
			</div>
			<div data-seo-metrics style="padding:6px 10px;border-bottom:1px solid #222;color:#9fd"></div>
			<div data-seo-list style="overflow:auto;max-height:calc(45vh - 88px);padding:6px 10px"></div>
		`

		panel = {
			metrics: host.querySelector('[data-seo-metrics]'),
			list: host.querySelector('[data-seo-list]'),
		}

		host.querySelector('[data-seo-action="close"]').addEventListener('click', () => {
			localStorage.setItem(identity.debugStorageKey, 'false')
			host.remove()
			panel = null
		})

		host.querySelector('[data-seo-action="export"]').addEventListener('click', () => {
			const bundle = {
				identity,
				exportedAt: new Date().toISOString(),
				timeline: contextRef?.getTimeline?.() || [],
				metrics: contextRef?.getMetrics?.() || [],
				policy: contextRef?.getPolicyStats?.() || {},
			}
			downloadJson(`${identity.slug}-debug.json`, bundle)
		})

		document.body.appendChild(host)
	}
}

function shouldEnablePanel(identity, config) {
	if (config.enabled === true) return true
	if (typeof localStorage !== 'undefined') {
		return localStorage.getItem(identity.debugStorageKey) === 'true'
	}
	return false
}

function appendEventRow(container, event) {
	const row = document.createElement('div')
	row.style.marginBottom = '6px'
	row.textContent = `${event.timestamp} ${event.type} ${event.name || ''} turn=${event.turnId || '-'}`
	container.prepend(row)
	while (container.childElementCount > 80) {
		container.lastChild.remove()
	}
}

function appendMetricRow(container, metric) {
	container.textContent = `${metric.name}=${metric.value} ${JSON.stringify(metric.labels || {})}`
}

function downloadJson(filename, data) {
	const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
	const url = URL.createObjectURL(blob)
	const anchor = document.createElement('a')
	anchor.href = url
	anchor.download = filename
	anchor.click()
	URL.revokeObjectURL(url)
}
