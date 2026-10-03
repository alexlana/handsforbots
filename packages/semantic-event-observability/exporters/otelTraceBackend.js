/**
 * OpenTelemetry span backend for TraceMapper.
 */
export function createOtelSpanBackend({ tracer, context, trace, SpanStatusCode, SpanKind, propagation }) {
	if (!tracer || !context || !trace) {
		return null
	}

	return {
		startSpan(name, attributes, parentSpan, options = {}) {
			const spanOptions = { attributes }
			const kind = resolveSpanKind(options.kind, SpanKind)
			if (kind != null) spanOptions.kind = kind

			const parentCtx = parentSpan
				? trace.setSpan(context.active(), parentSpan)
				: undefined
			return tracer.startSpan(name, spanOptions, parentCtx)
		},

		endSpan(spanRef) {
			spanRef?.end()
		},

		setAttribute(spanRef, key, value) {
			spanRef?.setAttribute(key, value)
		},

		setError(spanRef, message) {
			if (!SpanStatusCode || !spanRef) return
			spanRef.setStatus({ code: SpanStatusCode.ERROR, message })
		},

		getPropagationContext(spanRef) {
			if (!spanRef || !propagation?.inject) return null
			const activeContext = trace.setSpan(context.active(), spanRef)
			const carrier = {}
			propagation.inject(activeContext, carrier)
			return carrier
		},
	}
}

function resolveSpanKind(kind, SpanKind) {
	if (kind == null || !SpanKind) return undefined
	if (typeof kind === 'number') return kind

	const normalized = String(kind).toUpperCase()
	if (SpanKind[normalized] != null) return SpanKind[normalized]
	return undefined
}
