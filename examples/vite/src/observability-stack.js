/**
 * Optional OpenTelemetry + Faro bootstrap for the local LGTM stack.
 * Loaded only when VITE_OBSERVABILITY_STACK=true — see examples/OBSERVABILITY.md
 */

export async function maybeInitObservabilityStack() {
	if (import.meta.env.VITE_OBSERVABILITY_STACK !== 'true') {
		return null
	}

	const serviceName = 'semantic-event-observability'
	const otelEndpoint = import.meta.env.VITE_OTEL_ENDPOINT || 'http://localhost:4318/v1/traces'
	const faroEndpoint = import.meta.env.VITE_FARO_ENDPOINT || 'http://localhost:12347/collect'

	try {
		const [
			{ WebTracerProvider },
			{ SimpleSpanProcessor },
			{ Resource },
			{ OTLPTraceExporter },
			{ registerInstrumentations },
			{ FetchInstrumentation },
			{ ZoneContextManager },
			{ SEMRESATTRS_SERVICE_NAME },
			{ initializeFaro },
			api,
		] = await Promise.all([
			import('@opentelemetry/sdk-trace-web'),
			import('@opentelemetry/sdk-trace-base'),
			import('@opentelemetry/resources'),
			import('@opentelemetry/exporter-trace-otlp-http'),
			import('@opentelemetry/instrumentation'),
			import('@opentelemetry/instrumentation-fetch'),
			import('@opentelemetry/context-zone'),
			import('@opentelemetry/semantic-conventions'),
			import('@grafana/faro-web-sdk'),
			import('@opentelemetry/api'),
		])

		const otlpExporter = new OTLPTraceExporter({ url: otelEndpoint })
		const provider = new WebTracerProvider({
			resource: new Resource({
				[SEMRESATTRS_SERVICE_NAME]: serviceName,
			}),
		})
		// SimpleSpanProcessor envia cada span imediatamente ao terminar,
		// sem reter em buffer — garante que turnos curtos cheguem ao Tempo.
		provider.addSpanProcessor(new SimpleSpanProcessor(otlpExporter))
		provider.register({
			contextManager: new ZoneContextManager(),
		})

		// Flush forçado ao fechar/recarregar a aba — evita perda de spans pendentes
		window.addEventListener('beforeunload', () => {
			provider.shutdown().catch(() => {})
		})

		registerInstrumentations({
			instrumentations: [
				new FetchInstrumentation({
					propagateTraceHeaderCorsUrls: [/.+/],
				}),
			],
		})

		const faro = initializeFaro({
			url: faroEndpoint,
			app: {
				name: serviceName,
				environment: import.meta.env.VITE_OBSERVABILITY_ENV || 'development-lgtm',
			},
		})

		console.log('[✔︎] Observability stack: OpenTelemetry →', otelEndpoint)
		console.log('[✔︎] Observability stack: Faro →', faroEndpoint)

		return {
			faro,
			traceApi: {
				context: api.context,
				trace: api.trace,
				SpanStatusCode: api.SpanStatusCode,
			},
			getTracer: (name, version) => provider.getTracer(name || serviceName, version),
		}
	} catch (error) {
		console.warn('[ℹ] Observability stack packages missing. Run npm install in examples/vite.', error)
		return null
	}
}
