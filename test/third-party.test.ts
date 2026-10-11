import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies'] as const

/** Every third-party npm package named by a package.json of the monorepo. */
function thirdPartyPackages(): Map<string, string[]> {
  const manifests = ['package.json']
  for (const dir of ['packages', 'examples']) {
    for (const entry of readdirSync(join(root, dir))) {
      const path = join(dir, entry, 'package.json')
      if (existsSync(join(root, path))) manifests.push(path)
    }
  }
  const found = new Map<string, string[]>()
  for (const manifest of manifests) {
    const json = JSON.parse(read(manifest)) as Record<string, Record<string, string> | undefined>
    for (const field of FIELDS) {
      for (const name of Object.keys(json[field] ?? {})) {
        if (name.startsWith('@handsforbots/')) continue
        // DefinitelyTyped packages are listed once as `@types/*`.
        const key = name.startsWith('@types/') ? '@types/*' : name
        found.set(key, [...(found.get(key) ?? []), manifest])
      }
    }
  }
  return found
}

describe('third-party notices', () => {
  const packages = thirdPartyPackages()

  it.each(['NOTICE.md', 'docs/pt-br/NOTICE.md'])('%s lists every package the monorepo depends on', (notice) => {
    const text = read(notice)
    const missing = [...packages].filter(([name]) => !text.includes(`\`${name}\``)).map(([name, from]) => `${name} (${from.join(', ')})`)
    expect(missing).toEqual([])
  })

  it('finds the dependencies it checks', () => {
    expect(packages.has('@ag-ui/core')).toBe(true)
  })
})
