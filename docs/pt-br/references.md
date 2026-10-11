# Referências

Bibliotecas, serviços, artigos e produtos que embasaram decisões do Hands for Bots, agrupados por tema. Cada seção diz qual decisão ou página apoia e quando as fontes foram acessadas. Números (latência, tamanho, preço, acerto) são dos fornecedores ou autores e **não foram medidos por nós**, a não ser quando indicado. Código de terceiros incluído ou adaptado no projeto tem crédito no [NOTICE](./NOTICE.md).

Quando uma decisão se apoiar em fontes externas, acrescente-as aqui (nos dois idiomas) no mesmo commit.

## Interrupção, fim de turno e barge-in

Apoia o [ADR 0011](../adr/0011-interrupcao-e-fim-de-turno.md) e [Interrupção e conversa por voz](./conversation.md). Acessadas em 2026-10-10 e 2026-10-11.

### Detecção de fim de turno

| Fonte | O que é | Observações |
|---|---|---|
| [Turn detector da LiveKit](https://docs.livekit.io/agents/logic/turns/turn-detector) · [post: modelo de fim de turno melhorado](https://livekit.com/blog/improved-end-of-turn-model-cuts-voice-ai-interruptions-39) | Modelo de texto com pesos abertos: lê a transcrição dos últimos turnos e prevê a probabilidade do token de fim de turno; funciona junto com VAD, com limiares por idioma | Modelo multilíngue: ~400 MB de RAM, ~25 ms por inferência, feito para servidores Python. Código do plugin Apache-2.0, modelo sob a LiveKit Model License. Encaixa no `httpEndOfTurn` atrás do seu servidor |
| [Smart Turn da Pipecat](https://github.com/pipecat-ai/smart-turn) · [docs](https://docs.pipecat.ai/server/utilities/turn-detection/smart-turn-overview) · [ficha do modelo](https://huggingface.co/pipecat-ai/smart-turn-v3) · [versão ONNX](https://huggingface.co/soniqo/Smart-Turn-v3.2-ONNX) · [post da v3.2](https://www.daily.co/blog/smart-turn-v3-2-handling-noisy-environments-and-short-responses/) | Modelo de áudio (encoder do Whisper Tiny + classificador linear, ~8M parâmetros) sobre os últimos segundos do sinal, rodado a cada pausa depois de um VAD | BSD-2, pesos, dados e código de treino publicados, 23 idiomas. O tamanho varia por fonte: 8 MB em ONNX int8 (Pipecat), 11 MB quantizado (versão soniqo). ~10–36 ms em CPUs rápidas segundo os fornecedores; CPUs mais fracas levam bem mais. A única opção que cogitamos rodar no navegador (`onnxruntime-web`); não verificado |
| [FireRedChat (arXiv 2509.06502)](https://arxiv.org/pdf/2509.06502) | Artigo; treina um classificador BERT de fim de turno com ~830 mil exemplos de frase parcial contra completa | Referência para classificadores de texto que rodam localmente ou no servidor |
| [Detecção de turno da AssemblyAI](https://www.assemblyai.com/docs/streaming/turn-detection) | STT em streaming com fim de turno semântico mais fallback por silêncio | Padrões citados: confiança 0.4, silêncio mínimo de 400 ms. Nossos `turn.threshold` / `turn.minSilence` seguem a mesma ideia. Encaixa em `capabilities.endOfTurn` |
| [Endpoint detection da Soniox](https://soniox.com/docs/stt/rt/endpoint-detection) | STT em streaming cujo modelo de fala emite um token de fim a partir de entonação, pausas e contexto | Encaixa em `capabilities.endOfTurn` |
| [VAD do OpenAI Realtime](https://developers.openai.com/api/docs/guides/realtime-vad) | `server_vad` (silêncio) e `semantic_vad` (o modelo julga se a fala está completa), com `eagerness` | Mostra a mesma divisão que adotamos: só silêncio contra um canal semântico |
| [Jev 1.13 na OpenRouter](https://openrouter.ai/models/typesafe/jev-1.13) | Modelo hospedado de decisão tipada (devolve uma escolha, não texto livre) pela API de Decisions da OpenRouter | Números do fornecedor: p50 ~0,13 s, US$ 0,042 por milhão de tokens de entrada. Beta, um único provedor, pesos fechados; português não documentado. A chave fica no servidor (`httpEndOfTurn`) |

### APIs do navegador e bibliotecas

| Fonte | Uso no H4B |
|---|---|
| [Web Speech API (MDN)](https://developer.mozilla.org/pt-BR/docs/Web/API/Web_Speech_API) | `webSpeechSTT` / `webSpeechTTS`. O reconhecimento não é offline na maioria dos navegadores e não dá acesso ao áudio nem às restrições do microfone |
| [`MediaTrackConstraints` (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints) | `echoCancellation`, `noiseSuppression`, `autoGainControl` no `openMicrophone` |
| [ONNX Runtime Web](https://www.npmjs.com/package/onnxruntime-web) | Runtime candidato para modelos locais de fim de turno (Smart Turn) num pacote à parte; não é dependência |
| [vosk-browser](https://www.npmjs.com/package/vosk-browser) | Reconhecimento offline no `voskBrowserSTT`; expõe o áudio, então pode alimentar modelos de fim de turno de áudio |

### Produtos e comportamento

| Fonte | Observações |
|---|---|
| Modo de voz do ChatGPT, Gemini Live | Microfone aberto, a fala corta a resposta: a base para `interrupt` ser o padrão |
| Chat de texto do ChatGPT | Deixa digitar durante a resposta, mas exige parar antes de enviar; não achamos fila nativa. Um userscript de terceiros acrescenta uma ([ChatGPT Message Queue](https://greasyfork.org/en/scripts/561517-chatgpt-message-queue)), sinal de que as pessoas querem isso |

Também citados na discussão que levou ao ADR, sem uma página específica conferida por nós: Hamming, Picovoice, Coval, Dograh e WorkAdventure (textos sobre avaliação de agentes de voz e troca de turnos).
