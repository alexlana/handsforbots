# 0004 — Plugins compostos em código; nada de código remoto

**Contexto.** A v1 carregava plugins por caminho de string (`import('../Core/…/X.js')`), incompatível com bundlers e com pacotes npm. O DSH instala e carrega plugins pelo backend.

**Decisão.** Plugins são módulos ESM/pacotes npm passados em código (`createH4B({ plugins: [voice(), menu()] })`). Configuração remota poderá ligar/desligar plugins já incluídos no bundle, nunca baixar código. Plugins não importam outros em runtime; descobrem serviços com `ctx.get()` e reagem a `service.provided/removed`.

**Consequências.** Tree-shaking, CSP e auditoria funcionam. Integrações opcionais (voz no widget, câmera, arquivos) aparecem quando o serviço existe, sem acoplamento.
