import type { JsonPatchOperation } from './types.js'

/** Applies RFC 6902 operations immutably. Supports add, remove, replace, move, copy and test. */
export function applyPatch<T>(document: T, operations: JsonPatchOperation[]): T {
  let doc: unknown = structuredClone(document)
  for (const op of operations) {
    switch (op.op) {
      case 'add':
        doc = setAt(doc, parse(op.path), op.value, 'add')
        break
      case 'replace':
        doc = setAt(doc, parse(op.path), op.value, 'replace')
        break
      case 'remove':
        doc = removeAt(doc, parse(op.path))
        break
      case 'copy':
        doc = setAt(doc, parse(op.path), structuredClone(getAt(doc, parse(op.from ?? ''))), 'add')
        break
      case 'move': {
        const from = parse(op.from ?? '')
        const value = getAt(doc, from)
        doc = setAt(removeAt(doc, from), parse(op.path), value, 'add')
        break
      }
      case 'test':
        if (JSON.stringify(getAt(doc, parse(op.path))) !== JSON.stringify(op.value)) {
          throw new Error(`JSON patch test failed at ${op.path}`)
        }
        break
    }
  }
  return doc as T
}

function parse(path: string): string[] {
  if (path === '') return []
  if (!path.startsWith('/')) throw new Error(`Invalid JSON pointer "${path}"`)
  return path
    .slice(1)
    .split('/')
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
}

function getAt(doc: unknown, path: string[]): unknown {
  let current: any = doc
  for (const key of path) current = current?.[key]
  return current
}

function setAt(doc: unknown, path: string[], value: unknown, mode: 'add' | 'replace'): unknown {
  if (path.length === 0) return value
  const parent: any = getAt(doc, path.slice(0, -1))
  const key = path[path.length - 1]!
  if (parent === null || typeof parent !== 'object') throw new Error(`Invalid JSON patch path /${path.join('/')}`)
  if (Array.isArray(parent)) {
    const index = key === '-' ? parent.length : Number(key)
    if (mode === 'add') parent.splice(index, 0, value)
    else parent[index] = value
  } else {
    parent[key] = value
  }
  return doc
}

function removeAt(doc: unknown, path: string[]): unknown {
  if (path.length === 0) return undefined
  const parent: any = getAt(doc, path.slice(0, -1))
  const key = path[path.length - 1]!
  if (Array.isArray(parent)) parent.splice(Number(key), 1)
  else if (parent && typeof parent === 'object') delete parent[key]
  return doc
}
