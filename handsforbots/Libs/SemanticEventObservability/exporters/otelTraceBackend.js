/**
 * OpenTelemetry span backend for TraceMapper.
 */
export function createOtelSpanBackend({ tracer, context, trace, SpanStatusCode, propagation }) {
	if (!tracer || !context || !trace) {
		return null
	}

	return {
		startSpan(name, attributes, parentSpan) {
			const parentCtx = parentSpan
				? trace.setSpan(context.active(), parentSpan)
				: undefined
			return tracer.startSpan(name, { attributes }, parentCtx)
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
