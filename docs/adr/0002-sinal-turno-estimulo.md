# 0002 — Modelo Sinal → Turno → Estímulo, com rotas

**Contexto.** A v1 tratava cada entrada (texto, voz, Poke, foto) com caminhos próprios, e as respostas eram mensagens no formato do Rasa com comandos embutidos no texto. Queremos que qualquer entrada chegue a qualquer backend, e que o backend responda com mensagens e/ou estímulos para a UI.

**Decisão.** Toda entrada é um `Signal` (`trigger` inicia turno; `context` acompanha os turnos seguintes) com `parts` (texto, mídia, dados). Toda saída é um stream de `Stimulus` (`message.*`, `action.call/result`, `ui.render`, `ui.effect`, `state.*`, `audio`, `error`). Cada turno é resolvido por uma rota (`direct`, `capture`, `transport`, `agent`, `push`) registrada no histórico. O modelo é próximo do AG-UI de propósito, mas é nosso.

**Consequências.** Backend síncrono é um stream de um lote; streaming e push usam o mesmo caminho. Comandos diretos entram no histórico como tool call sintética, então o LLM vê o que aconteceu. Adapters de protocolo ficam finos.
