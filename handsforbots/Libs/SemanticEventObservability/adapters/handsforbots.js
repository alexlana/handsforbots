import { createObservability } from '../core/createObservability.js'

export const HFB_TURN_START_EVENTS = ['core.input']
export const HFB_TURN_END_EVENTS = ['core.output_ready']

export const HFB_SEMANTIC_EVENTS = [
	'core.input',
	'core.input_received',
	'core.send_to_backend',
	'core.calling_backend',
	'core.backend_responded',
	'core.spread_output',
	'core.output_ready',
	'core.ui_loaded',
	'core.all_ui_loaded',
	'core.action_success',
	'core.redirect_input',
	'mcp.tool_feedback_received',
]

/**
 * Attach semantic observability to a Hands for Bots instance.
 */
export function attachHandsForBotsObservability(bot, options = {}) {
	if (!bot?.eventEmitter) {
		throw new Error('attachHandsForBotsObservability expects a bot with eventEmitter')
	}

	if (bot.observability) {
		return bot.observability
	}

	const enabled = options.enabled !== false
	if (!enabled) return null

	const observability = createObservability({
		enabled: true,
		environment: options.environment || bot.options?.environment || 'production',
		sampleRate: options.sampleRate ?? 1,
		maxEventsPerMinute: options.maxEventsPerMinute ?? 120,
		maxPayloadBytes: options.maxPayloadBytes ?? 2048,
		denylist: options.denylist,
		turnStartEvents: options.turnStartEvents || HFB_TURN_START_EVENTS,
		turnEndEvents: options.turnEndEvents || HFB_TURN_END_EVENTS,
		exporters: options.exporters || ['memory', 'devPanel'],
		exporterConfig: options.exporterConfig || {},
		identity: options.identity,
	})

	observability.instrument(bot.eventEmitter, {
		stateProvider: () => getHandsForBotsState(bot),
		wrapListeners: options.wrapListeners ?? false,
	})

	if (bot.bc && options.instrumentBroadcastChannel !== false) {
		instrumentBroadcastChannel(observability, bot.bc)
	}

	bot.observability = observability
	return observability
}

export function getHandsForBotsState(bot) {
	const orchestrator = bot.orchestrator
	return {
		queueDepth: orchestrator?.queue?.length ?? 0,
		callingBackend: Boolean(orchestrator?.calling_backend),
		redirectInput: bot.redirectInput || null,
	}
}

function instrumentBroadcastChannel(observability, channel) {
	const originalPostMessage = channel.postMessage.bind(channel)
	channel.postMessage = function instrumentedPostMessage(data) {
		observability.record('broadcast.post', data, { type: 'bus.trigger' })
		return originalPostMessage(data)
	}
}
