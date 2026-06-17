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
	const otelMetricsEndpoint = import.meta.env.VITE_OTEL_METRICS_ENDPOINT || 'http://localhost:4318/v1/metrics'
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
			{ initializeFaro, getWebInstrumentations },
			{ MeterProvider, PeriodicExportingMetricReader },
			{ OTLPMetricExporter },
			api,
			webVitals,
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
			import('@opentelemetry/sdk-metrics'),
			import('@opentelemetry/exporter-metrics-otlp-http'),
			import('@opentelemetry/api'),
			import('web-vitals'),
		])

		const resource = new Resource({
			[SEMRESATTRS_SERVICE_NAME]: serviceName,
		})

		const otlpExporter = new OTLPTraceExporter({ url: otelEndpoint })
		const provider = new WebTracerProvider({ resource })
		provider.addSpanProcessor(new SimpleSpanProcessor(otlpExporter))
		provider.register({
			contextManager: new ZoneContextManager(),
		})

		const metricExporter = new OTLPMetricExporter({ url: otelMetricsEndpoint })
		const meterProvider = new MeterProvider({
			resource,
			readers: [
				new PeriodicExportingMetricReader({
					exporter: metricExporter,
					exportIntervalMillis: 5000,
				}),
			],
		})
		api.metrics.setGlobalMeterProvider(meterProvider)

		window.addEventListener('beforeunload', () => {
			provider.shutdown().catch(() => {})
			meterProvider.shutdown().catch(() => {})
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
			instrumentations: [
				...getWebInstrumentations({
					captureConsole: false,
				}),
			],
		})

		console.log('[✔︎] Observability stack: OpenTelemetry traces →', otelEndpoint)
		console.log('[✔︎] Observability stack: OpenTelemetry metrics →', otelMetricsEndpoint)
		console.log('[✔︎] Observability stack: Faro →', faroEndpoint)

		return {
			faro,
			webVitals,
			traceApi: {
				context: api.context,
				trace: api.trace,
				propagation: api.propagation,
				SpanStatusCode: api.SpanStatusCode,
				SpanKind: api.SpanKind,
			},
			getTracer: (name, version) => provider.getTracer(name || serviceName, version),
			getMeter: (name, version) => meterProvider.getMeter(name || serviceName, version),
		}
	} catch (error) {
		console.warn('[ℹ] Observability stack failed to initialize. Run npm install in examples/vite.', error)
		return null
	}
}
