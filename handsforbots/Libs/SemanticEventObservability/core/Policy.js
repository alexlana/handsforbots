import { summarizePayload, DEFAULT_DENYLIST } from '../utils/safeJson.js'

/**
 * Sampling, redaction, and rate limiting for telemetry safety.
 */
export default class Policy {
	constructor(options = {}) {
		this.enabled = options.enabled !== false
		this.sampleRate = clampRate(options.sampleRate ?? 1)
		this.maxEventsPerMinute = options.maxEventsPerMinute ?? 120
		this.maxPayloadBytes = options.maxPayloadBytes ?? 2048
		this.denylist = options.denylist || DEFAULT_DENYLIST
		this.environment = options.environment || 'development'
		this.onDrop = typeof options.onDrop === 'function' ? options.onDrop : null

		this.windowStartedAt = Date.now()
		this.eventsInWindow = 0
		this.droppedTotal = 0
		this.droppedByReason = {}
	}

	shouldEmit(eventType = 'bus.trigger') {
		if (!this.enabled) {
			this.recordDrop('disabled')
			return false
		}

		if (!this.allowRate()) {
			this.recordDrop('rate_limit')
			return false
		}

		if (eventType.startsWith('turn.') || eventType.startsWith('phase.') || eventType.startsWith('metric.')) {
			return true
		}

		if (Math.random() > this.sampleRate) {
			this.recordDrop('sampled_out')
			return false
		}

		return true
	}

	allowRate() {
		const now = Date.now()
		if (now - this.windowStartedAt >= 60_000) {
			this.windowStartedAt = now
			this.eventsInWindow = 0
		}

		if (this.eventsInWindow >= this.maxEventsPerMinute) {
			return false
		}

		this.eventsInWindow += 1
		return true
	}

	sanitizePayload(payload) {
		return summarizePayload(payload, {
			denylist: this.denylist,
			maxPayloadBytes: this.maxPayloadBytes,
		})
	}

	recordDrop(reason) {
		this.droppedTotal += 1
		this.droppedByReason[reason] = (this.droppedByReason[reason] || 0) + 1
		try { this.onDrop?.(reason) } catch { /* noop */ }
	}

	getStats() {
		return {
			droppedTotal: this.droppedTotal,
			droppedByReason: { ...this.droppedByReason },
			sampleRate: this.sampleRate,
			maxEventsPerMinute: this.maxEventsPerMinute,
		}
	}
}

function clampRate(value) {
	if (value <= 0) return 0
	if (value >= 1) return 1
	return value
}
