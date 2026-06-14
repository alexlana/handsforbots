const isCodeSandbox = 'SANDBOX_URL' in process.env || 'CODESANDBOX_HOST' in process.env

export default {
    root: 'src/',
    publicDir: '../static/',
    base: './',
    server: {
        host: true,
        open: !isCodeSandbox, // Open if it's not a CodeSandbox
        hmr: process.env.VITE_HMR_CLIENT_PORT
            ? { clientPort: Number(process.env.VITE_HMR_CLIENT_PORT) }
            : true
    },
    build: {
        outDir: '../dist',
        emptyOutDir: true,
        sourcemap: true
    },
    plugins: []
}