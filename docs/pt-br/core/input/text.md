##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; home dos docs](../../README.md) / [core](../../core.md) / [input](../input.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](./text.md)
[![en-US](https://img.shields.io/badge/en-US-white)](../../../en-us/core/input/text.md)

</div>


# Plugin de Entrada de Texto


O plugin de entrada de texto é o canal de entrada mais básico, permitindo que os usuários interajam com seu chatbot por meio de uma interface tradicional de bate-papo por texto. Ele captura a entrada de texto do usuário, adiciona-a ao histórico de conversas e a envia para o mecanismo de backend para processamento.


## Referência da API


### Construtor


```javascript

constructor(bot, options)

```


**Parâmetros:**


- `bot`: A instância inicializada da classe `Bot`.

- `options`: Um objeto contendo opções de configuração para a interface do usuário de entrada de texto:
  - `container`: (Opcional) O elemento DOM onde a interface do usuário do bate-papo será anexada (por exemplo, `'#chatbot'`, `'body'`). O padrão é `'body'`.
  - `start_open`: (Opcional) Se `true`, a janela de bate-papo será aberta por padrão. O padrão é `false`.
  - `bot_avatar`: (Opcional) URL ou dados de imagem codificados em base64 para o avatar do bot. O padrão é uma imagem de espaço reservado.
  - `bot_name`: (Opcional) O nome a ser exibido para o chatbot. O padrão é "O bot" ou um equivalente específico do idioma.
  - `bot_job`: (Opcional) Um cargo ou descrição curta para exibir abaixo do nome do bot. O padrão é uma string vazia.
  - `no_css`: (Opcional) Se `true`, o plugin não incluirá seus estilos CSS padrão. Você precisará fornecer seu próprio estilo. O padrão é `false`.
  - `title`: (Opcional) O título a ser exibido no cabeçalho da janela de bate-papo. O padrão é "Venha conversar!" ou um equivalente específico do idioma.
  - `autofocus`: (Opcional) Se `true`, o campo de entrada de texto receberá foco automaticamente quando a janela de bate-papo estiver aberta. O padrão é `false`.

### Métodos


#### `input(payload, title = null)`


Captura a entrada do usuário no campo de texto, adiciona-a ao histórico de conversas e a envia para o mecanismo de backend.


```javascript

input(payload, title = null)

```


**Parâmetros:**


- `payload`: O texto digitado pelo usuário.

- `title`: (Opcional) Um título alternativo para exibir no histórico de bate-papo. Se não for fornecido, o `payload` será usado como título.


#### `insertMessage(title)`


Método interno para adicionar uma mensagem à exibição da janela de bate-papo.


#### `receiver(response)`


Lida com a resposta do mecanismo de backend, reativando a entrada do usuário e exibindo as mensagens do bot.


#### `initialOpenChatWindow(ui_window)`


Um método interno para lidar com a abertura inicial da janela de bate-papo.


#### `ui(options)`


Cria a interface do usuário para a entrada de texto, anexando-a ao contêiner especificado.


#### `messageWrapper(payload, side = 'user', recipient = null)`


Cria a estrutura HTML para uma bolha de mensagem de bate-papo.


#### `imageWrapper(payload)`


Cria o HTML para exibir uma imagem dentro do bate-papo.


#### `buttonWrapper(title, payload)`


Cria um botão HTML para uma resposta do chatbot, acionando a entrada do usuário quando clicado.


#### `listButtons(buttons = null)`


Gera HTML para uma lista de botões com base na resposta do bot.


#### `rebuildHistory(ui_window)`


Reconstrói o histórico de conversas a partir do histórico interno do bot quando o plugin é carregado.


#### `setChatMarginTop()`


Método interno para ajustar a exibição do bate-papo para rolagem adequada.



