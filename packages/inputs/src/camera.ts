import { definePlugin, type Signal } from '@handsforbots/core'
import { createState } from './store.js'

export type CameraOptions = {
  /** 'environment' (rear) or 'user' (selfie). Default 'environment'. */
  facingMode?: 'environment' | 'user'
  /** Images are scaled so their longest side fits. Default 1280. */
  maxSide?: number
  mimeType?: 'image/jpeg' | 'image/webp' | 'image/png'
  quality?: number
}

export type CameraState = { supported: boolean; open: boolean; streaming: boolean; error?: string }

export type CameraService = {
  getState(): CameraState
  subscribe(listener: () => void): () => void
  /** Asks for permission and starts the preview (attach `video` to show it). */
  open(video?: HTMLVideoElement): Promise<MediaStream>
  close(): void
  /** Current frame as an image Blob. */
  frame(): Promise<Blob>
  /** Takes a photo and sends it as an image trigger (optionally with a question). */
  capture(prompt?: string): Promise<Signal>
  /**
   * Video understanding by sampling: keeps the latest frame as a context signal
   * (key 'camera.frame') every `intervalMs`, so each turn sees what the camera sees.
   */
  startFrames(intervalMs?: number): void
  stopFrames(): void
}

declare module '@handsforbots/core' {
  interface Services {
    camera: CameraService
  }
}

export const camera = definePlugin<CameraOptions | undefined>({
  name: 'input-camera',
  provides: ['camera'],
  apply(ctx, options = {}) {
    const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
    const store = createState<CameraState>({ supported, open: false, streaming: false })
    let stream: MediaStream | undefined
    let video: HTMLVideoElement | undefined
    let frameTimer: ReturnType<typeof setInterval> | undefined

    const service: CameraService = {
      getState: store.getState,
      subscribe: store.subscribe,
      async open(target) {
        if (!supported) throw new Error('Camera is not available')
        if (!stream) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: options.facingMode ?? 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
              audio: false,
            })
          } catch (error) {
            const message = (error as DOMException)?.name === 'NotAllowedError' ? 'Camera permission denied' : (error as Error).message
            store.set({ error: message })
            throw new Error(message)
          }
        }
        video = target ?? video ?? document.createElement('video')
        video.muted = true
        video.playsInline = true
        video.srcObject = stream
        await video.play().catch(() => {})
        store.set({ open: true, error: undefined })
        return stream
      },
      close() {
        service.stopFrames()
        for (const track of stream?.getTracks() ?? []) track.stop()
        stream = undefined
        if (video) video.srcObject = null
        store.set({ open: false })
      },
      async frame() {
        if (!video || !stream) await service.open()
        return grabFrame(video!, options)
      },
      async capture(prompt) {
        const blob = await service.frame()
        return ctx.signal({
          modality: 'image',
          source: 'camera',
          parts: [
            ...(prompt ? [{ type: 'text' as const, text: prompt }] : []),
            { type: 'image', mimeType: blob.type, source: { kind: 'blob', blob }, name: 'photo' },
          ],
        })
      },
      startFrames(intervalMs = 2000) {
        service.stopFrames()
        store.set({ streaming: true })
        const tick = async () => {
          if (!stream) return
          const blob = await grabFrame(video!, { ...options, maxSide: Math.min(options.maxSide ?? 1280, 768) })
          ctx.signal({
            kind: 'context',
            key: 'camera.frame',
            modality: 'video',
            source: 'camera',
            parts: [{ type: 'image', mimeType: blob.type, source: { kind: 'blob', blob }, name: 'frame' }],
          })
        }
        void (stream ? tick() : service.open().then(tick))
        frameTimer = setInterval(() => void tick(), intervalMs)
      },
      stopFrames() {
        clearInterval(frameTimer)
        frameTimer = undefined
        ctx.app.removeContext('camera.frame')
        if (store.getState().streaming) store.set({ streaming: false })
      },
    }
    ctx.provide('camera', service)
    ctx.onDispose(() => {
      service.close()
      store.clear()
    })
  },
})

async function grabFrame(video: HTMLVideoElement, options: CameraOptions): Promise<Blob> {
  const width = video.videoWidth || 640
  const height = video.videoHeight || 480
  const scale = Math.min(1, (options.maxSide ?? 1280) / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not capture the frame'))),
      options.mimeType ?? 'image/jpeg',
      options.quality ?? 0.85,
    ),
  )
}
