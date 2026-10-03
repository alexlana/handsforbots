import { createId } from './id.js'
import { applyPatch } from './patch.js'
import type { AssistantMessage, JsonPatchOperation, Message, SessionSnapshot } from './types.js'

/**
 * Conversation store. Every change replaces the affected objects, so
 * snapshots can be compared by reference (React's useSyncExternalStore).
 */
export class Conversation {
  threadId: string
  private _messages: Message[] = []
  private _state: unknown = undefined

  constructor(
    threadId: string | undefined,
    private onMessages: (messages: Message[]) => void,
    private onState: (state: unknown) => void,
  ) {
    this.threadId = threadId ?? createId('thread')
  }

  get messages(): Message[] {
    return this._messages
  }

  get state(): unknown {
    return this._state
  }

  restore(snapshot: SessionSnapshot) {
    this.threadId = snapshot.threadId
    this._messages = snapshot.messages
    this._state = snapshot.state
    this.onMessages(this._messages)
    this.onState(this._state)
  }

  reset(threadId?: string) {
    this.threadId = threadId ?? createId('thread')
    this._messages = []
    this._state = undefined
    this.onMessages(this._messages)
    this.onState(this._state)
  }

  snapshot(): SessionSnapshot {
    return { threadId: this.threadId, messages: this._messages, state: this._state }
  }

  append<M extends Message>(message: M): M {
    this._messages = [...this._messages, message]
    this.onMessages(this._messages)
    return message
  }

  find(id: string): Message | undefined {
    return this._messages.find((m) => m.id === id)
  }

  update<M extends Message>(id: string, change: (message: M) => M): M | undefined {
    const index = this._messages.findIndex((m) => m.id === id)
    if (index < 0) return undefined
    const next = change(this._messages[index] as M)
    this._messages = this._messages.with(index, next)
    this.onMessages(this._messages)
    return next
  }

  appendText(messageId: string, delta: string) {
    this.update<AssistantMessage>(messageId, (message) => {
      const parts = [...message.parts]
      const last = parts[parts.length - 1]
      if (last?.type === 'text') parts[parts.length - 1] = { type: 'text', text: last.text + delta }
      else parts.push({ type: 'text', text: delta })
      return { ...message, parts }
    })
  }

  setState(state: unknown) {
    this._state = state
    this.onState(state)
  }

  patchState(patch: JsonPatchOperation[]) {
    this.setState(applyPatch(this._state ?? {}, patch))
  }
}
