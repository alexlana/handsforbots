import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const isCodeSandbox = 'SANDBOX_URL' in process.env || 'CODESANDBOX_HOST' in process.env

/** Hands for Bots v2 packages, used straight from source (monorepo or Docker mount). */
const packagesDir = process.env.H4B_PACKAGES || path.resolve(here, '../../packages')

function h4bAliases() {
    const aliases = {}
    if (!existsSync(packagesDir)) return aliases
    for (const dir of readdirSync(packagesDir)) {
        const manifest = path.join(packagesDir, dir, 'package.json')
        if (!existsSync(manifest)) continue
        const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
        const entry = typeof pkg.exports?.['.'] === 'string' ? pkg.exports['.'] : pkg.exports?.['.']?.import
        if (pkg.name?.startsWith('@handsforbots/') && entry) aliases[pkg.name] = path.join(packagesDir, dir, entry)
    }
    return aliases
}

export default {
    root: 'src/',
    publicDir: '../static/',
    base: './',
    resolve: {
        alias: h4bAliases(),
    },
    server: {
        host: true,
        open: !isCodeSandbox, // Open if it's not a CodeSandbox
        fs: { allow: [here, packagesDir] },
        hmr: process.env.VITE_HMR_CLIENT_PORT
            ? { clientPort: Number(process.env.VITE_HMR_CLIENT_PORT) }
            : true
    },
    build: {
        outDir: '../dist',
        emptyOutDir: true,
        sourcemap: true,
        target: 'es2022',
        rollupOptions: {
            input: {
                main: path.resolve(here, 'src/index.html'),
                guided: path.resolve(here, 'src/guided.html'),
            },
        },
    },
    esbuild: { target: 'es2022' },
    optimizeDeps: { esbuildOptions: { target: 'es2022' } },
    plugins: []
}
