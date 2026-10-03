import { useAgent, useAgentContext, useCopilotKit, useFrontendTools } from '@copilotkit/react-core/v2'
import {
  createId,
  type ActionDefinition,
  type H4B,
  type Message,
  type Signal,
  type StandardSchemaV1,
  type Stimulus,
  type Transport,
} from '@handsforbots/core'
import { useH4B, useH4BState } from '@handsforbots/react'
import { createEventMapper, toAguiMessages } from '@handsforbots/transport-agui'
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'

export type CopilotKitBridgeOptions = {
  agentId?: string
  /**
   * Make the CopilotKit agent H4B's transport, so voice, menu fallbacks,
   * sensors and other signals reach it and its answers can be spoken.
   * Default true. Set false if H4B has its own transport.
   */
  transport?: boolean
  /** How H4B context signals are described to the agent. */
  contextDescription?: string
}

type AgentLike = {
  addMessages(messages: any[]): void
  subscribe(subscriber: { onEvent?(params: { event: any }): void }): { unsubscribe(): void }
}

type CopilotLike = {
  runAgent(params: { agent: any }): Promise<unknown>
  stopAgent?(params: { agent: any }): void
}

/** Lets tool handlers report results to the H4B turn that is waiting on the agent. */
type RunChannel = { push(stimulus: Stimulus): void }

/**
 * Connects H4B to CopilotKit (mode A: CopilotKit owns the chat and the agent
 * connection). Render inside both <CopilotKitProvider> and <H4BProvider>.
 */
export function useCopilotKitBridge(options: CopilotKitBridgeOptions = {}): void {
  const h4b = useH4B()
  const { agent } = useAgent(options.agentId ? { agentId: options.agentId } : undefined) as { agent: AgentLike }
  const { copilotkit } = useCopilotKit() as unknown as { copilotkit: CopilotLike }
  const channel = useRef<RunChannel | undefined>(undefined)
  const agentRef = useRef(agent)
  agentRef.current = agent

  // 1. H4B actions → CopilotKit frontend tools.
  const version = useRegistryVersion(h4b)
  const tools = useMemo(
    () => h4b.actions.list('assistant').map((action) => toFrontendTool(h4b, action, channel)),
    [h4b, version],
  )
  useFrontendTools(tools as any, [tools])

  // 2. H4B context signals (what is on screen, sensors…) → agent context.
  const context = useH4BState((s) => s.context)
  const contextValue = useMemo(() => contextToJson(context), [context])
  useAgentContext({
    description: options.contextDescription ?? 'What the user sees and does in the app (Hands for Bots context signals)',
    value: contextValue,
  })

  // 3. Voice, menu fallbacks and other H4B triggers → the CopilotKit agent.
  useEffect(() => {
    if (options.transport === false) return
    const transport = createCopilotKitTransport(() => agentRef.current, copilotkit, channel)
    return h4b.provide('transport', transport, 'copilotkit-bridge')
  }, [h4b, copilotkit, options.transport])

  // 4. Direct commands and browser-agent actions also belong in the agent's history.
  useEffect(() => mirrorDirectTurns(h4b, () => agentRef.current), [h4b])
}

/** Component form of `useCopilotKitBridge`. */
export function CopilotKitBridge(props: CopilotKitBridgeOptions) {
  useCopilotKitBridge(props)
  return null
}

function useRegistryVersion(h4b: H4B): number {
  const counter = useRef(0)
  return useSyncExternalStore(
    (onChange) =>
      h4b.actions.subscribe(() => {
        counter.current++
        onChange()
      }),
    () => counter.current,
    () => counter.current,
  )
}

export function toFrontendTool(h4b: H4B, action: ActionDefinition, channel: { current?: RunChannel }) {
  return {
    name: action.name,
    description: action.description,
    parameters: toStandardSchema(action),
    // H4B already publishes to WebMCP (expose-webmcp); avoid double registration.
    webmcp: false,
    // Invoked directly (not through the H4B queue: the turn may be waiting on this
    // very agent run). Validation, interceptors and confirmation still apply.
    handler: async (args: unknown, context: { toolCall?: { id: string }; signal?: AbortSignal }) => {
      const callId = context?.toolCall?.id ?? createId('call')
      try {
        const result = await h4b.actions.invoke(action.name, args, { origin: 'assistant', callId, signal: context?.signal })
        h4b.emit('action.invoked', { name: action.name, origin: 'assistant', callId, result })
        channel.current?.push({ type: 'action.result', callId, name: action.name, result })
        return result
      } catch (error) {
        const message = (error as Error)?.message ?? String(error)
        h4b.emit('action.invoked', { name: action.name, origin: 'assistant', callId, error: message })
        channel.current?.push({ type: 'action.result', callId, name: action.name, result: { error: message } })
        throw error
      }
    },
  }
}

/** CopilotKit needs a Standard Schema; wrap plain JSON Schema with the Standard JSON Schema extension. */
export function toStandardSchema(action: ActionDefinition): StandardSchemaV1 {
  if (action.input) return action.input
  const json = action.parameters ?? { type: 'object', properties: {} }
  return {
    '~standard': {
      version: 1,
      vendor: 'handsforbots',
      validate: (value: unknown) => ({ value }), // H4B validates when the action runs
      jsonSchema: { input: () => json, output: () => json },
    } as StandardSchemaV1['~standard'],
  }
}

function contextToJson(signals: Signal[]): Record<string, any> {
  const value: Record<string, any> = {}
  for (const signal of signals) {
    const parts = signal.parts.map((p) =>
      p.type === 'text' ? p.text : p.type === 'data' ? p.value : `[${p.type}]`,
    )
    value[signal.key ?? signal.source] = parts.length === 1 ? parts[0] : parts
  }
  return JSON.parse(JSON.stringify(value))
}

/** H4B transport backed by the CopilotKit agent: messages also appear in CopilotKit's chat. */
export function createCopilotKitTransport(
  getAgent: () => AgentLike,
  copilotkit: CopilotLike,
  channel: { current?: RunChannel },
  { toolResultTimeoutMs = 30_000 } = {},
): Transport {
  return {
    name: 'copilotkit',
    capabilities: { streaming: true, tools: true },
    async *run(request, signal) {
      const last = request.messages.at(-1)
      // CopilotKit runs the tool loop itself; H4B only forwards new user input.
      if (last?.role !== 'user') return
      const agent = getAgent()
      agent.addMessages(await toAguiMessages([last]))

      const queue: Stimulus[] = []
      const pendingCalls = new Set<string>()
      let finished = false
      let failure: unknown
      let wake: (() => void) | undefined
      const push = (stimulus: Stimulus) => {
        if (stimulus.type === 'action.call') pendingCalls.add(stimulus.callId)
        if (stimulus.type === 'action.result') pendingCalls.delete(stimulus.callId)
        queue.push(stimulus)
        wake?.()
      }
      const mapper = createEventMapper()
      const subscription = agent.subscribe({ onEvent: ({ event }) => mapper(event).forEach(push) })
      channel.current = { push }
      const onAbort = () => copilotkit.stopAgent?.({ agent })
      signal.addEventListener('abort', onAbort, { once: true })

      copilotkit.runAgent({ agent }).then(
        () => {
          finished = true
          wake?.()
        },
        (error) => {
          failure = error
          finished = true
          wake?.()
        },
      )

      try {
        while (true) {
          if (queue.length) {
            yield queue.shift()!
            continue
          }
          if (finished) break
          await new Promise<void>((resolve) => (wake = resolve))
        }
        // Tool handlers may report just after the run settles.
        const deadline = Date.now() + toolResultTimeoutMs
        while (pendingCalls.size && Date.now() < deadline && !signal.aborted) {
          await new Promise((r) => setTimeout(r, 20))
          while (queue.length) yield queue.shift()!
        }
        // Never let the kernel execute a call CopilotKit owns.
        for (const callId of pendingCalls) {
          yield { type: 'action.result', callId, result: { error: 'Not executed by CopilotKit' } }
        }
        if (failure && !signal.aborted) throw failure
      } finally {
        signal.removeEventListener('abort', onAbort)
        subscription.unsubscribe()
        if (channel.current?.push === push) channel.current = undefined
      }
    },
  }
}

/** Copies turns resolved without the agent (menu, browser agents) into its history. */
export function mirrorDirectTurns(h4b: H4B, getAgent: () => AgentLike): () => void {
  const starts = new Map<string, number>()
  return h4b.on('turn.status', async (status) => {
    // First status of a turn comes before any of its messages is appended.
    if (!starts.has(status.turnId)) starts.set(status.turnId, h4b.messages.length)
    if (status.phase !== 'done' && status.phase !== 'error') return
    const start = starts.get(status.turnId) ?? h4b.messages.length
    starts.delete(status.turnId)
    if (status.route !== 'direct' && status.route !== 'agent') return
    const messages: Message[] = h4b.messages.slice(start)
    if (messages.length) getAgent().addMessages(await toAguiMessages(messages))
  })
}
