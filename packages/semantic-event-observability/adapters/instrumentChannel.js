/**
 * Instrument BroadcastChannel, MessagePort, or similar postMessage APIs.
 */
export function instrumentChannel(observability, channel, options = {}) {
	if (!channel || typeof channel.postMessage !== 'function') {
		throw new Error('instrumentChannel expects an object with postMessage()')
	}

	const eventName = options.eventName || 'channel.post'
	const recordType = options.type || 'custom'

	const originalPostMessage = channel.postMessage.bind(channel)
	channel.postMessage = function instrumentedPostMessage(data, transfer) {
		observability.record(eventName, data, { type: recordType })
		if (transfer !== undefined) {
			return originalPostMessage(data, transfer)
		}
		return originalPostMessage(data)
	}

	return channel
}
