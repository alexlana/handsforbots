/**
 * In-memory ring buffer for dev panel and debug export.
 */
export default class EventBuffer {
	constructor(maxSize = 200) {
		this.maxSize = maxSize
		this.events = []
		this.metrics = []
	}

	push(event) {
		this.events.push(event)
		if (this.events.length > this.maxSize) {
			this.events.shift()
		}
	}

	pushMetric(metric) {
		this.metrics.push(metric)
		if (this.metrics.length > this.maxSize) {
			this.metrics.shift()
		}
	}

	getTimeline(limit = this.maxSize) {
		return this.events.slice(-limit)
	}

	getMetrics(limit = this.maxSize) {
		return this.metrics.slice(-limit)
	}

	clear() {
		this.events = []
		this.metrics = []
	}
}
