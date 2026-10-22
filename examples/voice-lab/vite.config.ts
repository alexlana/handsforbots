import { defineConfig } from 'vite'

export default defineConfig({
  server: { port: 5192 },
  preview: { port: 5192 },
  // piper-phonemize is CommonJS; onnxruntime-web loads its own wasm at runtime.
  // The worker imports onnxruntime-web on demand, which needs an ES module worker.
  worker: { format: 'es' },
  optimizeDeps: { include: ['@diffusionstudio/piper-wasm/build/piper_phonemize.js'], exclude: ['onnxruntime-web'] },
})
