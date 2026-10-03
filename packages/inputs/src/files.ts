import { definePlugin, type Part, type Signal } from '@handsforbots/core'

export type FilesOptions = {
  /** Accepted types, like an <input accept>. Default: images and PDFs. */
  accept?: string
  /** Per-file limit. Default 10 MB. */
  maxSizeMB?: number
  maxFiles?: number
}

export type FilesService = {
  readonly accept: string
  /** Opens the file picker and sends the chosen files. */
  pick(prompt?: string): Promise<Signal | undefined>
  /** Sends files (from a picker, paste or drop) as a trigger, with an optional question. */
  attach(files: Iterable<File>, prompt?: string): Signal
}

declare module '@handsforbots/core' {
  interface Services {
    files: FilesService
  }
}

export const files = definePlugin<FilesOptions | undefined>({
  name: 'input-files',
  provides: ['files'],
  apply(ctx, options = {}) {
    const accept = options.accept ?? 'image/*,application/pdf'
    const maxBytes = (options.maxSizeMB ?? 10) * 1024 * 1024

    const accepted = (file: File) =>
      accept.split(',').some((rule) => {
        const r = rule.trim()
        if (r.startsWith('.')) return file.name.toLowerCase().endsWith(r.toLowerCase())
        if (r.endsWith('/*')) return file.type.startsWith(r.slice(0, -1))
        return file.type === r
      })

    const service: FilesService = {
      accept,
      attach(list, prompt) {
        const chosen = [...list].slice(0, options.maxFiles ?? 5)
        const rejected = chosen.filter((f) => !accepted(f) || f.size > maxBytes)
        if (rejected.length) {
          throw new Error(
            `Not accepted: ${rejected.map((f) => `${f.name} (${f.size > maxBytes ? 'too large' : f.type || 'unknown type'})`).join(', ')}`,
          )
        }
        const parts: Part[] = [
          ...(prompt ? [{ type: 'text' as const, text: prompt }] : []),
          ...chosen.map((file) => ({
            type: file.type.startsWith('image/') ? ('image' as const) : file.type.startsWith('audio/') ? ('audio' as const) : file.type.startsWith('video/') ? ('video' as const) : ('file' as const),
            mimeType: file.type || 'application/octet-stream',
            source: { kind: 'blob' as const, blob: file },
            name: file.name,
          })),
        ]
        const allImages = chosen.every((f) => f.type.startsWith('image/'))
        return ctx.signal({ modality: allImages ? 'image' : 'file', source: 'files', parts })
      },
      pick(prompt) {
        return new Promise((resolve) => {
          const input = document.createElement('input')
          input.type = 'file'
          input.accept = accept
          input.multiple = (options.maxFiles ?? 5) > 1
          input.addEventListener('change', () => resolve(input.files?.length ? service.attach(input.files, prompt) : undefined))
          input.addEventListener('cancel', () => resolve(undefined))
          input.click()
        })
      },
    }
    ctx.provide('files', service)
  },
})
