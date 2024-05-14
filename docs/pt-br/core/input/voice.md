##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; home dos docs](../../README.md) / [core](../../core.md) / [input](../input.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](./voice.md)
[![en-US](https://img.shields.io/badge/en-US-white)](../../../en-us/core/input/voice.md)

</div>


# Plugin de Entrada de Voz


O plugin de entrada de voz capacita seu chatbot com recursos de reconhecimento de voz, permitindo que os usuários interajam por meio da fala. Este plugin captura a entrada de áudio do usuário, converte-a em texto e a envia para o mecanismo de backend. Ele suporta tanto o reconhecimento de fala nativo do navegador quanto o Vosk para maior precisão e suporte a idiomas.


## Referência da API


### Construtor


```javascript

constructor(bot)

```


**Parâmetros:**


- `bot`: A instância inicializada da classe `Bot`.


### Métodos


#### `input(payload)`


Este método não é usado atualmente pelo plugin de entrada de voz, pois ele escuta principalmente os eventos de reconhecimento de fala.


#### `isNative()`


Verifica se o navegador suporta nativamente o reconhecimento de fala.


```javascript

isNative()

```


**Valor de Retorno:**


- `true` se o reconhecimento de fala nativo estiver disponível, `false` caso contrário.


#### `loadSpeechRecognition()`


Inicializa e carrega o mecanismo de reconhecimento de fala apropriado (nativo ou Vosk).


#### `ui(options)`


Cria os elementos da interface do usuário para entrada de voz, normalmente um botão de microfone.


**Parâmetros:**


- `options`: Um objeto contendo opções de configuração:
  - `prioritize_speech`: (Opcional) Se `true`, a entrada de voz será o principal método de entrada em dispositivos desktop. O padrão é `false`.

#### `removeUi()`


Remove os elementos da interface do usuário de entrada de voz do DOM e informa o usuário se houver problemas de compatibilidade.


#### `listenToUser()`


Inicia ou interrompe a escuta da fala do usuário. Alterna o estado visual do botão do microfone.


#### `proccessResults(data)`


Processa os resultados do reconhecimento de fala, exibindo transcrições parciais e enviando o texto final reconhecido para o campo de entrada de texto.


#### `start()`


Inicia o mecanismo de reconhecimento de fala e define o status do plugin como 'escutando'.


#### `ignore()`


Desativa temporariamente o reconhecimento de fala, geralmente quando o chatbot está falando, para evitar que a voz do bot seja reconhecida.


#### `unignore()`


Reativa o reconhecimento de fala depois de ter sido ignorado.


#### `stop()`


Interrompe o mecanismo de reconhecimento de fala e define o status do plugin como 'não_escutando'.


#### `cancel()`


Cancela o reconhecimento de fala em andamento e redefine o status do plugin.


#### `stopedToListen()`


Lida com o evento quando o reconhecimento de fala é interrompido e atualiza o estado visual do botão do microfone.
