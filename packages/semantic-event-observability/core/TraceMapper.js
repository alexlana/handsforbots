import { isErrorEvent } from './isErrorEvent.js'
import { sevoAttributes } from './telemetryAttributes.js'
import { buildTurnRootSpan } from './turnSpanNaming.js'

/**
 * Maps semantic events to a hierarchical span tree via an injected span backend.
 * Backend-agnostic — OpenTelemetry adapter lives in exporters/otel.js.
 */
export function createTraceMapper(options = {}) {
	const isError = options.isError || isErrorEvent
	const backend = options.backend
	const onTurnContext = options.onTurnContext || null
	const turnRootSpan = options.turnRootSpan
	if (!backend) {
		throw new Error('createTraceMapper requires a span backend')
	}

	/** @type {Map<string, TurnTraceState>} */
	const turns = new Map()

	return {
		handleEvent(event) {
			if (!event) return

			switch (event.type) {
				case 'turn.start':
					startTurn(event)
					break
				case 'turn.end':
					endTurn(event)
					break
				case 'phase.start':
					startPhase(event)
					break
				case 'phase.end':
					endPhase(event)
					break
				case 'bus.trigger':
					if (event.turnId) recordBusEvent(event)
					else recordOrphanEvent(event)
					break
				default:
					break
			}
		},

		destroy() {
			for (const state of turns.values()) {
				for (const phaseRef of state.phaseSpans.values()) {
					try { backend.endSpan(phaseRef) } catch { /* noop */ }
				}
				try { backend.endSpan(state.rootSpan) } catch { /* noop */ }
			}
			turns.clear()
		},
	}

	function startTurn(event) {
		const root = buildTurnRootSpan(event, turnRootSpan)
		const rootSpan = backend.startSpan(root.name, root.attributes, undefined, { kind: root.kind })
		turns.set(event.turnId, {
			rootSpan,
			phaseSpans: new Map(),
			lastPhaseEndedAt: null,
		})
		onTurnContext?.(event.turnId, backend.getPropagationContext?.(rootSpan))
	}

	function endTurn(event) {
		const state = turns.get(event.turnId)
		if (!state) return

		for (const phaseRef of state.phaseSpans.values()) {
			try { backend.endSpan(phaseRef) } catch { /* noop */ }
		}
		state.phaseSpans.clear()

		if (event.durationMs != null) {
			backend.setAttribute(state.rootSpan, 'turn.duration_ms', event.durationMs)
		}

		if (state.lastPhaseEndedAt != null) {
			const renderMs = Math.max(0, Date.now() - state.lastPhaseEndedAt)
			backend.setAttribute(state.rootSpan, 'phase.render_ms', renderMs)
		}

		backend.endSpan(state.rootSpan)
		turns.delete(event.turnId)
		onTurnContext?.(event.turnId, null)
	}

	function startPhase(event) {
		const state = turns.get(event.turnId)
		if (!state) return

		const phaseSpan = backend.startSpan(
			`phase:${event.phase}`,
			{
				...sevoAttributes(event),
				'phase.name': event.phase,
				'phase.source': event.source,
			},
			state.rootSpan,
		)
		state.phaseSpans.set(event.phase, phaseSpan)
	}

	function endPhase(event) {
		const state = turns.get(event.turnId)
		if (!state) return

		const phaseSpan = state.phaseSpans.get(event.phase)
		if (!phaseSpan) return

		if (event.durationMs != null) {
			backend.setAttribute(state.rootSpan, `phase.${event.phase}_ms`, event.durationMs)
		}

		backend.endSpan(phaseSpan)
		state.phaseSpans.delete(event.phase)
		state.lastPhaseEndedAt = Date.now()
	}

	function recordBusEvent(event) {
		const state = turns.get(event.turnId)
		if (!state) {
			recordOrphanEvent(event)
			return
		}

		const eventSpan = backend.startSpan(
			`event:${event.name}`,
			{
				...sevoAttributes(event),
				'event.payload_preview': event.payloadSummary?.preview,
			},
			state.rootSpan,
		)
		backend.endSpan(eventSpan)
		maybeMarkError(event, state.rootSpan)
	}

	function recordOrphanEvent(event) {
		const eventSpan = backend.startSpan(
			`event:${event.name}`,
			{
				...sevoAttributes(event),
				'event.payload_preview': event.payloadSummary?.preview,
			},
		)
		backend.endSpan(eventSpan)
	}

	function maybeMarkError(event, rootSpan) {
		if (!isError(event)) return
		backend.setError(rootSpan, event.name)
		backend.setAttribute(rootSpan, 'turn.error_event', event.name)
		backend.setAttribute(rootSpan, 'error.type', event.name)
	}
}

/**
 * @typedef {object} TurnTraceState
 * @property {*} rootSpan
 * @property {Map<string, *>} phaseSpans
 * @property {number | null} lastPhaseEndedAt
 */
