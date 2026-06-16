import { sevoAttributes } from './telemetryAttributes.js'

/**
 * Normalize turn root span configuration for TraceMapper.
 */
export function normalizeTurnRootSpanConfig(config) {
	if (config === true || config === 'invoke_agent') {
		return { mode: 'invoke_agent', kind: 'internal' }
	}

	if (typeof config === 'string') {
		return { mode: config === 'invoke_agent' ? 'invoke_agent' : 'semantic' }
	}

	if (config && typeof config === 'object') {
		return {
			mode: config.mode === 'invoke_agent' ? 'invoke_agent' : 'semantic',
			agentName: config.agentName,
			providerName: config.providerName,
			kind: config.kind || 'internal',
		}
	}

	return { mode: 'semantic' }
}

/**
 * Build turn root span name and attributes (semantic or OTel invoke_agent).
 */
export function buildTurnRootSpan(event, config = {}) {
	const normalized = normalizeTurnRootSpanConfig(config)

	if (normalized.mode === 'invoke_agent') {
		const agentName = resolveAgentName(normalized.agentName, event)
		const name = agentName ? `invoke_agent ${agentName}` : 'invoke_agent'
		const attributes = {
			...sevoAttributes(event),
			'gen_ai.operation.name': 'invoke_agent',
			'sevo.turn_start_event': event.name,
		}

		if (agentName) attributes['gen_ai.agent.name'] = agentName
		if (normalized.providerName) attributes['gen_ai.provider.name'] = normalized.providerName

		return {
			name,
			attributes,
			kind: normalized.kind,
		}
	}

	return {
		name: `turn:${event.name || 'conversation'}`,
		attributes: sevoAttributes(event),
		kind: undefined,
	}
}

function resolveAgentName(agentName, event) {
	if (typeof agentName === 'function') {
		try {
			const resolved = agentName(event)
			if (resolved) return String(resolved)
		} catch { /* noop */ }
	}

	if (typeof agentName === 'string' && agentName) return agentName

	const metadata = event.turnMetadata
	if (metadata?.input_plugin) return String(metadata.input_plugin)

	return undefined
}
