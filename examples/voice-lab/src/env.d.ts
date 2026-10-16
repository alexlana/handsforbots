declare module '@diffusionstudio/piper-wasm/build/piper_phonemize.js' {
  const createPiperPhonemize: (moduleArg?: Record<string, unknown>) => Promise<unknown>
  export default createPiperPhonemize
}

interface ImportMetaEnv {
  /** Default folder for model files, e.g. '/models' or 'https://cdn.example.com/models'. */
  readonly VITE_MODELS_URL?: string
}
