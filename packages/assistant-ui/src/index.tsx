import { useExternalStoreRuntime, type AppendMessage, type ThreadMessageLike } from '@assistant-ui/react'
import { textOf, type MediaPart, type Message, type Part } from '@handsforbots/core'
import { useBusy, useH4B, useMessages } from '@handsforbots/react'
import { useMemo } from 'react'

export type H4BAssistantRuntimeOptions = {
  /** Source name of signals sent from the assistant-ui composer. Default 'assistant-ui'. */
  source?: string
}

/**
 * assistant-ui runtime backed by H4B: assistant-ui renders the thread and the
 * composer; H4B handles the transport (AG-UI, AI SDK, Rasa, HTTP…), actions,
 * menu, voice and the rest.
 *
 *   const runtime = useH4BAssistantRuntime()
 *   <AssistantRuntimeProvider runtime={runtime}><Thread /></AssistantRuntimeProvider>
 */
export function useH4BAssistantRuntime(options: H4BAssistantRuntimeOptions = {}) {
  const h4b = useH4B()
  const messages = useMessages()
  const busy = useBusy()
  const thread = useMemo(() => toThreadMessages(messages), [messages])

  return useExternalStoreRuntime<ThreadMessageLike>({
    messages: thread,
    isRunning: busy,
    convertMessage: (message) => message,
    onNew: async (message: AppendMessage) => {
      h4b.signal({ modality: hasMedia(message) ? 'image' : 'text', source: options.source ?? 'assistant-ui', parts: fromAppendMessage(message) })
    },
    onCancel: async () => h4b.abort(),
  })
}

/** H4B history → assistant-ui messages (tool results folded into tool-call parts). */
export function toThreadMessages(messages: Message[]): ThreadMessageLike[] {
  const results = new Map<string, { result?: unknown; error?: string }>()
  for (const message of messages) {
    if (message.role === 'tool') results.set(message.toolCallId, { result: message.result, error: message.error })
  }
  const thread: ThreadMessageLike[] = []
  for (const message of messages) {
    if (message.role === 'tool') continue
    const createdAt = new Date(message.createdAt)
    if (message.role === 'user') {
      const content = [
        { type: 'text' as const, text: textOf(message) },
        ...message.parts.flatMap((p) => {
          const image = imageUrl(p)
          return image ? [{ type: 'image' as const, image }] : []
        }),
      ].filter((p) => p.type !== 'text' || p.text)
      thread.push({ id: message.id, role: 'user', content: content.length ? content : [{ type: 'text', text: '' }], createdAt })
      continue
    }
    const content: any[] = []
    const text = textOf(message)
    if (text) content.push({ type: 'text', text })
    for (const call of message.toolCalls ?? []) {
      const outcome = results.get(call.id)
      content.push({
        type: 'tool-call',
        toolCallId: call.id,
        toolName: call.name,
        args: (call.args ?? {}) as Record<string, never>,
        ...(outcome ? { result: outcome.error ? { error: outcome.error } : (outcome.result ?? null), isError: !!outcome.error } : {}),
      })
    }
    for (const part of message.parts) {
      const image = imageUrl(part)
      if (image) content.push({ type: 'image', image })
      if (part.type === 'data' && part.name === 'ui') content.push({ type: 'data-h4b-ui', data: part.value })
    }
    if (!content.length) continue
    thread.push({
      id: message.id,
      role: 'assistant',
      content,
      createdAt,
      status: message.streaming ? { type: 'running' } : { type: 'complete', reason: 'stop' },
      metadata: { custom: { route: message.route } },
    })
  }
  return thread
}

function imageUrl(part: Part): string | undefined {
  if (part.type !== 'image') return undefined
  const media = part as MediaPart
  if (media.source.kind === 'url') return /^https:\/\//i.test(media.source.url) ? media.source.url : undefined
  if (media.source.kind === 'base64') return `data:${media.mimeType};base64,${media.source.data}`
  return typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(media.source.blob) : undefined
}

function hasMedia(message: AppendMessage) {
  return message.content.some((p) => p.type === 'image') || (message.attachments?.length ?? 0) > 0
}

/** assistant-ui composer message → H4B parts. */
export function fromAppendMessage(message: AppendMessage): Part[] {
  const parts: Part[] = []
  const contents = [...message.content, ...(message.attachments ?? []).flatMap((a) => a.content ?? [])]
  for (const part of contents as any[]) {
    if (part.type === 'text' && part.text) parts.push({ type: 'text', text: part.text })
    else if (part.type === 'image' && typeof part.image === 'string') parts.push(fromDataOrUrl(part.image, 'image', 'image/*'))
    else if (part.type === 'file' && typeof part.data === 'string') parts.push(fromDataOrUrl(part.data, 'file', part.mimeType ?? 'application/octet-stream', part.filename))
  }
  return parts
}

function fromDataOrUrl(value: string, type: 'image' | 'file', fallbackMime: string, name?: string): Part {
  const match = /^data:([^;]+);base64,(.*)$/.exec(value)
  return {
    type,
    mimeType: match?.[1] ?? fallbackMime,
    source: match ? { kind: 'base64', data: match[2]! } : { kind: 'url', url: value },
    ...(name ? { name } : {}),
  }
}
