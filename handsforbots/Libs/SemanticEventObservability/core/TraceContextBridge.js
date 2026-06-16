/**
 * Propagate active turn trace context to fetch and other outbound calls.
 */
export function createTraceContextBridge(options = {}) {
	const getContext = options.getContext || (() => ({}))
	let injectHeaders = null

	return {
		setHeaderInjector(fn) {
			injectHeaders = typeof fn === 'function' ? fn : null
		},

		getTraceHeaders() {
			const headers = {}
			const { traceId } = getContext()
			if (traceId) headers['sevo-trace-id'] = traceId

			if (injectHeaders) {
				try {
					const injected = injectHeaders()
					if (injected && typeof injected === 'object') {
						Object.assign(headers, injected)
					}
				} catch { /* noop */ }
			}

			return headers
		},

		withTraceContext(input, init = {}) {
			const headers = mergeHeaders(init.headers, this.getTraceHeaders())

			if (typeof Request !== 'undefined' && input instanceof Request) {
				return new Request(input, { ...init, headers })
			}

			return { ...init, headers }
		},

		withFetch(input, init = {}) {
			const resolved = this.withTraceContext(input, init)
			if (typeof resolved === 'object' && resolved.headers) {
				return fetch(input, resolved)
			}
			return fetch(resolved)
		},
	}
}

function mergeHeaders(existing, injected) {
	if (typeof Headers !== 'undefined' && existing instanceof Headers) {
		const merged = new Headers(existing)
		for (const [key, value] of Object.entries(injected)) {
			merged.set(key, value)
		}
		return merged
	}

	return {
		...(existing && typeof existing === 'object' ? existing : {}),
		...injected,
	}
}
