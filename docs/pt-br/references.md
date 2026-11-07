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

### Avisando o backend

Apoia o [ADR 0015](../adr/0015-retorno-da-interrupcao.md). Acessado em 2026-11-06. Lido na documentação e nos tipos dos SDKs; não chamado por nós.

| Fonte | O que é | Uso no H4B |
|---|---|---|
| [`conversation.item.truncate` do OpenAI Realtime (tipos do LangChain)](https://v03.api.js.langchain.com/interfaces/_langchain_openai.OpenAIClient.Beta.Realtime.ConversationItemTruncateEvent.html) · [openai-agents-python #4122](https://github.com/openai/openai-agents-python/pull/4122) | Evento do cliente que diz ao servidor quanto do áudio de uma mensagem do assistente foi tocado (`audio_end_ms`) quando o usuário interrompe | Precedente: quem toca a resposta avisa quem a escreveu onde ela parou. O H4B faz isso em caracteres (`kept`), na requisição seguinte |
| [Discussão na comunidade sobre transcrições cortadas](https://community.openai.com/t/realtime-api-interruptions-dont-properly-trim-the-transcript/1000703) | Usuários relatam o modelo adivinhando onde foi interrompido quando só o histórico não diz | Motivo para mandar o fato (`conversation.interrupted`), e não só o texto cortado |

## Síntese de voz e efeitos

Apoia o [ADR 0013](../adr/0013-sintese-de-voz-e-efeitos.md) e [Síntese de voz e efeitos](./speech.md). Acessado em 2026-10-16. Tamanhos e tempos medidos por nós estão marcados; os outros são dos autores.

### Padrões por trás do formato de efeitos

| Fonte | Uso no H4B |
|---|---|
| [Web Audio API (W3C)](https://www.w3.org/TR/webaudio/) | Vocabulário dos efeitos: tipos de nó e nomes de parâmetros (`BiquadFilterNode`, `DynamicsCompressorNode`, `DelayNode`, `ConvolverNode`, `WaveShaperNode`); Q em dB no passa-baixa e no passa-alta. O player e os efeitos são feitos com ela |
| [Web Audio Modules 2.0](https://www.webaudiomodules.com/docs/intro) · [API](https://github.com/webaudiomodules/api) | Descritores de parâmetros (`label`, `type`, `defaultValue`, `minValue`, `maxValue`, `discreteStep`, `exponent`, `choices`, `units`) para gerar editores. Hospedar plugins WAM ainda não é suportado |
| [SSML 1.1 (W3C)](https://www.w3.org/TR/speech-synthesis11/) | Unidades da prosódia (`rate` em porcentagem, `pitch` em semitons, `volume` em dB) e a exportação `toSSML` |
| [`<prosody>` do Amazon Polly](https://docs.aws.amazon.com/polly/latest/dg/prosody-tag.html) · [SSML de voz e prosódia do Azure](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-voice) · [SSML do Google Cloud TTS](https://cloud.google.com/text-to-speech/docs/ssml) | O que os motores na nuvem aceitam: o Polly recebe a altura em porcentagem, por isso `toSSML({ pitch: '%' })` |
| [Filtros do FFmpeg](https://ffmpeg.org/ffmpeg-filters.html) | `toFFmpeg`: `highpass`, `equalizer`, `acompressor`, `alimiter`, `vibrato`, `tremolo`, `chorus`, `aecho`, `asoftclip`, `atempo`, `asetrate`, `aresample`. Todos os presets são conferidos com o FFmpeg 7.1 nos testes |
| [JSON Schema 2020-12](https://json-schema.org/draft/2020-12) | `chainSchema()` |

### Motores e modelos

| Fonte | O que é | Observações |
|---|---|---|
| [Piper](https://github.com/rhasspy/piper) (arquivado; continua em [OHF-Voice/piper1-gpl](https://github.com/OHF-Voice/piper1-gpl)) · [vozes](https://huggingface.co/rhasspy/piper-voices) | Vozes VITS rápidas exportadas para ONNX, um idioma por voz, um `.onnx.json` com o mapa de fonemas e os parâmetros de inferência | `piperTTS`, `piperVoice`. O repositório original era MIT; a continuação é GPL. As licenças das vozes variam conforme o `MODEL_CARD`. Medido por nós: `pt_BR-faber-medium` + dados do espeak = 82 MB |
| [Kokoro 82M](https://huggingface.co/hexgrad/Kokoro-82M) · [build ONNX](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) | Baseado em StyleTTS 2, 82M parâmetros, 24 kHz, vários idiomas, Apache-2.0 | `kokoroTTS`, `kokoroModel`. Arquivos ONNX de 92 MB (q8) a 326 MB (fp32). Medido por nós numa thread de CPU: 8,2 s para 5,2 s de áudio |
| [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/) | Roda modelos ONNX no navegador (WebAssembly, WebGPU) | O runtime do Piper e do Kokoro; passado pelo app, não é dependência. Threads exigem isolamento entre origens; `env.wasm.proxy` leva só a inferência para um worker; `workerTTS` leva o provedor inteiro |
| [transformers.js](https://huggingface.co/docs/transformers.js) | Pipelines do Hugging Face no navegador, incluindo `text-to-speech` | `transformersTTS` adapta qualquer pipeline de TTS dele |
| [espeak-ng](https://github.com/espeak-ng/espeak-ng) · [piper-phonemize](https://github.com/rhasspy/piper-phonemize) · [@diffusionstudio/piper-wasm](https://github.com/diffusion-studio/piper-wasm) | Texto para fonemas IPA; o piper-phonemize o embrulha como o Piper espera; o piper-wasm é um build em WebAssembly | `espeakPhonemizer`. O espeak-ng é GPL-3.0, por isso o H4B não o distribui. O arquivo de dados desse build tem 17 MB |

### APIs do navegador

| Fonte | Uso no H4B |
|---|---|
| [`SpeechSynthesisUtterance` (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance) | Prosódia do `webSpeechTTS` (`rate`, `pitch`, `volume`). O áudio dele não pode ser levado ao Web Audio, então os efeitos não se aplicam |
| [Guia de autoplay (MDN)](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay) | Por que o player libera o áudio no primeiro gesto e por que existe `unlockAudio()` |
| [`CacheStorage` (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/CacheStorage) | Onde os modelos baixados ficam (`h4b-voice-models`) |
| [`Worker()` com `type: 'module'` (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker) | `workerTTS`: o arquivo do Worker importa o runtime sob demanda, então precisa ser um Worker de módulo (Chromium 80+, Firefox 114+, Safari 15+) |
| [Objetos transferíveis (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects) | As amostras sintetizadas voltam do Worker transferindo o buffer, sem cópia |
| [Vite: `worker.format`](https://vite.dev/config/worker-options) | `'es'` é necessário para Workers que importam módulos sob demanda; o `iife` padrão não faz isso |

## Frameworks de agente e "browser hands"

Apoia a seção "Relação com frameworks de agente e browser hands" do [ROADMAP](../../ROADMAP.md) (posicionamento, transporte `realtime` em P1). Acessado em 2026-11-04. Nada aqui foi testado por nós.

| Fonte | O que é | Uso no H4B |
|---|---|---|
| [Vídeo de uma série sobre agentes multimodais](https://www.youtube.com/watch?v=dNGchf4InU0) | Série que monta um agente em camadas (genai SDK → ADK → tools → hands → memory → eyes; "hear · talk · act · remember · see") | Motivou a revisão. Só o diagrama da série foi conferido, não o vídeo |
| [Bidi-streaming (live) no ADK](https://google.github.io/adk-docs/streaming) · [codelab](https://codelabs.developers.google.com/intro-to-adk-live) | Agentes do ADK com voz e vídeo de baixa latência pela Gemini Live API: entrada de texto, áudio e vídeo, saída de texto e áudio, ferramentas na sessão | Caminho em que o áudio vai direto do navegador ao agente: o atrito com o `voice`, respondido pelo transporte `realtime` |
| [Gemini Live API](https://ai.google.dev/gemini-api/docs/live) | API fala-a-fala do Gemini, por sessão | Candidata a provedor de referência do `realtime` (decisão em aberto 7) |
| [`ag_ui_adk`](https://pypi.org/project/ag-ui-adk/) · [discussão no fórum do Google](https://discuss.google.dev/t/integrating-google-adk-agents-with-modern-frontends-using-the-ag-ui-protocol/298415) | Middleware Python que expõe um agente do ADK pelo protocolo AG-UI, com ferramentas do cliente executadas no agente (`AGUIToolset`) | Um agente do ADK pode usar as ações do H4B pelo `transport-agui` sem pacote novo; falta um exemplo que confirme |
| [The browser agent stack, explained (Lightpanda)](https://lightpanda.io/blog/posts/the-browser-agent-stack-explained) · [How browser agents work (Anchor)](https://anchorbrowser.io/guides/how-browser-agents-work-a-step-by-step-architectural-guide) | Descrevem a camada de execução ("mãos") dos agentes de navegador: Playwright, browser-use, Stagehand e afins agindo num navegador controlado pelo agente | Base da distinção entre mãos que agem de fora da página e as ações declaradas do H4B, expostas pelo `expose-webmcp` |

## Fontes e citações

Apoia o [ADR 0014](../adr/0014-fontes-e-citacoes.md) e [Fontes e citações](./sources.md). Acessado em 2026-11-06. Os formatos foram lidos na documentação e nos tipos dos SDKs; nenhuma dessas APIs foi chamada por nós.

| Fonte | O que é | Uso no H4B |
|---|---|---|
| [OpenAI web search (Responses API)](https://platform.openai.com/docs/guides/tools-web-search) · [Ably: citações da OpenAI](https://ably.com/docs/ai-transport/guides/openai/openai-citations.md) · [Parallel: citations](https://docs.parallel.ai/responses-api/features/citations.md) | Anotações `url_citation` no texto de saída com `url`, `title`, `start_index`, `end_index`; no streaming, pelo evento `response.output_text.annotation.added` | O modelo da `Citation`: anotação com posição, não marcador no texto, e um estímulo próprio (`message.citations`) |
| [Citações da Anthropic](https://docs.anthropic.com/en/docs/build-with-claude/citations) · [Ably: citações da Anthropic](https://ably.com/docs/ai-transport/guides/anthropic/anthropic-citations.md) | Blocos de texto com um array `citations` (`cited_text`, índice e título do documento, localização: `char_location`, `page_location`, `search_result_location`…) | Mesma direção: citações presas ao texto, fontes à parte. O `excerpt` cumpre o papel do `cited_text` |
| [`GroundingSupport` do Gemini (Firebase AI)](https://firebase.google.com/docs/reference/js/ai.groundingsupport.md) · [tipos em Go (eino)](https://pkg.go.dev/github.com/cloudwego/eino/schema/gemini) | `groundingChunks` (fontes) e `groundingSupports` (um `segment` da resposta mais índices dos chunks); os tipos em Go documentam as posições do segmento em bytes | Fontes e ligações separadas, e o motivo do `utf8OffsetToIndex`: os transportes convertem bytes para UTF-16 |
| [Perplexity: streaming de citações](https://docs.perplexity.ai/docs/cookbook/articles/streaming-citations/README) | Marcadores numerados no texto (`[1]`, ou `[web:1]` em outro modo) ligados a `search_results` enviados à parte | O caso do marcador: tratado pelo `inlineCitations` no backend ou no transporte, nunca na página |
| [`ui-messages.ts` do AI SDK](https://app.unpkg.com/ai@6.0.99/files/src/ui/ui-messages.ts) | Partes `source-url` (`sourceId`, `url`, `title`) e `source-document`; nada liga uma fonte a um trecho | Mapeamento do `transport-ai-sdk`; `id` e `title` seguem os mesmos papéis |
| [Especificação do AG-UI (rascunho)](https://docs.ag-ui.com/spec/draft) | Protocolo de eventos entre agentes e interfaces, com eventos CUSTOM com namespace e nenhum evento de fonte | `h4b.sources` e `h4b.citations` como eventos CUSTOM, ao lado de `h4b.ui.effect` e `h4b.ui.render` |
