import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { handleAgentRequest } from './agent/mockAgent.ts'

/** Serves the mock AG-UI agent at /api/agent in dev and preview. */
function mockAgent(): Plugin {
  // Must return nothing: Vite treats a returned function as a post-middleware hook.
  const mount = (server: { middlewares: { use: (path: string, fn: any) => unknown } }): void => {
    server.middlewares.use('/api/agent', (req: any, res: any) => {
      handleAgentRequest(req, res).catch((error) => {
        res.statusCode = 500
        res.end(String(error))
      })
    })
  }
  return { name: 'h4b-mock-agent', configureServer: mount, configurePreviewServer: mount }
}

export default defineConfig({
  plugins: [react(), mockAgent()],
})
