import { createRegistry, type Registry } from './chain.js'

/**
 * JSON Schema (draft 2020-12) of an effect chain for these effect types: for
 * editors, validators in other languages and agents that write presets.
 */
export function chainSchema(registry: Registry = createRegistry()): Record<string, unknown> {
  const effect = [...registry.values()].map((definition) => ({
    type: 'object',
    title: definition.label,
    ...(definition.description ? { description: definition.description } : {}),
    required: ['type'],
    additionalProperties: false,
    properties: {
      type: { const: definition.type },
      id: { type: 'string' },
      bypass: { type: 'boolean' },
      ...Object.fromEntries(
        Object.entries(definition.params).map(([key, info]) => [
          key,
          {
            type: info.type === 'boolean' ? ['boolean', 'integer'] : info.type === 'float' || !info.type ? 'number' : 'integer',
            title: info.label,
            minimum: info.minValue,
            maximum: info.maxValue,
            default: info.defaultValue,
            ...(info.units ? { description: info.units } : {}),
          },
        ]),
      ),
    },
  }))
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'Voice effect chain',
    type: 'object',
    required: ['version', 'effects'],
    additionalProperties: false,
    properties: {
      version: { const: 1 },
      name: { type: 'string' },
      description: { type: 'string' },
      prosody: {
        type: 'object',
        additionalProperties: false,
        properties: {
          rate: { type: 'number', exclusiveMinimum: 0, description: 'multiplier, SSML rate="120%" = 1.2' },
          pitch: { type: 'number', description: 'semitones, SSML pitch="+2st" = 2' },
          volume: { type: 'number', description: 'dB, SSML volume="+6dB" = 6' },
        },
      },
      effects: { type: 'array', items: { oneOf: effect } },
    },
  }
}
