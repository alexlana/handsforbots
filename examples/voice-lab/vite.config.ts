import { defineConfig } from 'vite'

export default defineConfig({
  server: { port: 5192 },
  preview: { port: 5192 },
  // piper-phonemize is CommonJS; onnxruntime-web loads its own wasm at runtime.
  optimizeDeps: { include: ['@diffusionstudio/piper-wasm/build/piper_phonemize.js'], exclude: ['onnxruntime-web'] },
})
