import { cleanAttributes, EMPTY_ATTRIBUTES, type ConversationAttributes } from './attributes.js'
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
  /** Opaque slot for the `memory` plugin; saved and restored with the conversation. */
  memory: unknown = undefined
  private _attributes: ConversationAttributes = EMPTY_ATTRIBUTES

  constructor(
    threadId: string | undefined,
    private onMessages: (messages: Message[]) => void,
    private onState: (state: unknown) => void,
    private onAttributes: (attributes: ConversationAttributes, reason: 'set' | 'restored' | 'reset') => void = () => {},
  ) {
    this.threadId = threadId ?? createId('thread')
  }

  get messages(): Message[] {
    return this._messages
  }

  get state(): unknown {
    return this._state
  }

  /** Codes attached to this conversation (ADR 0017). Replaced, never mutated. */
  get attributes(): ConversationAttributes {
    return this._attributes
  }

  /** Replaces the attributes. Use `h4b.setConversationAttributes()`, which validates and saves. */
  setAttributes(attributes: ConversationAttributes) {
    this._attributes = attributes
    this.onAttributes(attributes, 'set')
  }

  restore(snapshot: SessionSnapshot) {
    this.threadId = snapshot.threadId
    this._messages = snapshot.messages
    this._state = snapshot.state
    this.memory = snapshot.memory
    const hadAttributes = Object.keys(this._attributes).length > 0
    this._attributes = cleanAttributes(snapshot.attributes)
    this.onMessages(this._messages)
    this.onState(this._state)
    if (hadAttributes || Object.keys(this._attributes).length > 0) this.onAttributes(this._attributes, 'restored')
  }

  reset(threadId?: string) {
    this.threadId = threadId ?? createId('thread')
    this._messages = []
    this._state = undefined
    this.memory = undefined
    const hadAttributes = Object.keys(this._attributes).length > 0
    this._attributes = EMPTY_ATTRIBUTES
    this.onMessages(this._messages)
    this.onState(this._state)
    if (hadAttributes) this.onAttributes(this._attributes, 'reset')
  }

  snapshot(): SessionSnapshot {
    return {
      threadId: this.threadId,
      messages: this._messages,
      state: this._state,
      ...(this.memory === undefined ? {} : { memory: this.memory }),
      ...(Object.keys(this._attributes).length === 0 ? {} : { attributes: this._attributes }),
    }
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

  /** Removes the messages that match, if any. */
  removeWhere(predicate: (message: Message) => boolean) {
    const kept = this._messages.filter((m) => !predicate(m))
    if (kept.length === this._messages.length) return
    this._messages = kept
    this.onMessages(this._messages)
  }

  /**
   * Appends to the last text part. `source` parts do not break the text: a
   * delta after them continues the text before them, so citation positions
   * stay within one part (ADR 0014).
   */
  appendText(messageId: string, delta: string) {
    this.update<AssistantMessage>(messageId, (message) => {
      const parts = [...message.parts]
      let index = parts.length - 1
      while (index >= 0 && parts[index]!.type === 'source') index--
      const last = parts[index]
      if (last?.type === 'text') parts[index] = { ...last, text: last.text + delta }
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
