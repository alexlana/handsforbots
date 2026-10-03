import { toJsonSchema, validate } from './standard-schema.js'
import type {
  ActionCallContext,
  ActionDefinition,
  ActionDescriptor,
  Confirmer,
  Origin,
} from './types.js'

export class ActionError extends Error {
  constructor(
    message: string,
    readonly code: 'not_found' | 'forbidden' | 'invalid_args' | 'declined' | 'failed',
  ) {
    super(message)
    this.name = 'ActionError'
  }
}

/**
 * Registry of actions the GUI exposes. The same action can be triggered by the
 * assistant (tool call), by an external agent (WebMCP) or by the user (menu).
 */
export class ActionRegistry {
  private actions = new Map<string, ActionDefinition>()
  private onChange = new Set<() => void>()

  constructor(private getConfirmer: () => Confirmer | undefined) {}

  register<I, O>(action: ActionDefinition<I, O>): () => void {
    if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(action.name)) {
      throw new Error(`[h4b] invalid action name "${action.name}"`)
    }
    if (this.actions.has(action.name)) {
      throw new Error(`[h4b] action "${action.name}" is already registered`)
    }
    this.actions.set(action.name, action as ActionDefinition)
    this.changed()
    return () => {
      if (this.actions.get(action.name) === action) {
        this.actions.delete(action.name)
        this.changed()
      }
    }
  }

  has(name: string): boolean {
    return this.actions.has(name)
  }

  get(name: string): ActionDefinition | undefined {
    return this.actions.get(name)
  }

  list(origin?: Origin): ActionDefinition[] {
    const all = [...this.actions.values()]
    return origin ? all.filter((a) => isExposed(a, origin)) : all
  }

  /** Descriptors (name, description, JSON Schema) for a given origin. */
  describe(origin: Origin): ActionDescriptor[] {
    return this.list(origin).map((action) => ({
      name: action.name,
      description: action.description,
      parameters: action.parameters ??
        toJsonSchema(action.input) ?? { type: 'object', properties: {} },
    }))
  }

  subscribe(listener: () => void): () => void {
    this.onChange.add(listener)
    return () => this.onChange.delete(listener)
  }

  async invoke(name: string, args: unknown, call: ActionCallContext): Promise<unknown> {
    const action = this.actions.get(name)
    if (!action) throw new ActionError(`Action "${name}" is not available`, 'not_found')
    if (!isExposed(action, call.origin)) {
      throw new ActionError(`Action "${name}" is not exposed to ${call.origin}`, 'forbidden')
    }

    let parsed: unknown = args ?? {}
    if (action.input) {
      try {
        parsed = await validate(action.input, parsed)
      } catch (error) {
        throw new ActionError(`Invalid arguments for "${name}": ${(error as Error).message}`, 'invalid_args')
      }
    }

    if (needsConfirmation(action)) {
      const confirm = this.getConfirmer()
      const accepted = confirm
        ? await confirm({ action: name, description: action.description, args: parsed, origin: call.origin })
        : false
      if (!accepted) throw new ActionError(`Action "${name}" was not confirmed`, 'declined')
    }

    try {
      return await action.handler(parsed, call)
    } catch (error) {
      if (error instanceof ActionError) throw error
      throw new ActionError((error as Error)?.message ?? String(error), 'failed')
    }
  }

  private changed() {
    for (const listener of this.onChange) listener()
  }
}

function isExposed(action: ActionDefinition, origin: Origin): boolean {
  return !action.exposeTo || action.exposeTo.includes(origin)
}

function needsConfirmation(action: ActionDefinition): boolean {
  const policy = action.confirm ?? 'destructive'
  if (policy === 'always') return true
  if (policy === 'destructive') return action.destructive === true
  return false
}
