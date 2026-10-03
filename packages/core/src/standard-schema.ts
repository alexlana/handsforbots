/**
 * Standard Schema v1 (https://standardschema.dev), copied as the spec
 * recommends so libraries don't need a runtime dependency.
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': StandardSchemaV1.Props<Input, Output>
}

export declare namespace StandardSchemaV1 {
  export interface Props<Input = unknown, Output = Input> {
    readonly version: 1
    readonly vendor: string
    readonly validate: (value: unknown) => Result<Output> | Promise<Result<Output>>
    readonly types?: Types<Input, Output> | undefined
    /** Standard JSON Schema extension (Zod 4, ArkType, Valibot adapters). */
    readonly jsonSchema?: {
      readonly input: (options: { readonly target: string }) => Record<string, unknown>
    }
  }
  export type Result<Output> = SuccessResult<Output> | FailureResult
  export interface SuccessResult<Output> {
    readonly value: Output
    readonly issues?: undefined
  }
  export interface FailureResult {
    readonly issues: ReadonlyArray<Issue>
  }
  export interface Issue {
    readonly message: string
    readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined
  }
  export interface Types<Input = unknown, Output = Input> {
    readonly input: Input
    readonly output: Output
  }
}

export async function validate<T>(schema: StandardSchemaV1<unknown, T>, value: unknown): Promise<T> {
  const result = await schema['~standard'].validate(value)
  if (result.issues) {
    const detail = result.issues
      .map((issue) => {
        const path = issue.path?.map((p) => (typeof p === 'object' ? String(p.key) : String(p))).join('.')
        return path ? `${path}: ${issue.message}` : issue.message
      })
      .join('; ')
    throw new ValidationError(detail, result.issues)
  }
  return result.value
}

export function toJsonSchema(schema: StandardSchemaV1 | undefined): Record<string, unknown> | undefined {
  const converter = schema?.['~standard'].jsonSchema
  if (!converter) return undefined
  const json = { ...converter.input({ target: 'draft-2020-12' }) }
  delete json.$schema
  return json
}

export class ValidationError extends Error {
  constructor(
    message: string,
    readonly issues: ReadonlyArray<StandardSchemaV1.Issue>,
  ) {
    super(message)
    this.name = 'ValidationError'
  }
}
