##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; home dos docs](../../README.md) / [core](../../core.md) / [backend](../backend.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](./openai.md)
[![en-US](https://img.shields.io/badge/en-US-white)](../../../en-us/core/backend/openai.md)

</div>


# Plugin de Backend OpenAI


O plugin de backend OpenAI integra o Hands for Bots com os poderosos modelos de linguagem do OpenAI, permitindo que você crie interfaces conversacionais sofisticadas. Este plugin gerencia a comunicação entre seu front-end e a API do OpenAI, facilitando a troca de mensagens do usuário e respostas do bot, incluindo suporte para chamada de função.


## Referência da API


### Construtor


```javascript

constructor(bot, options)

```


**Parâmetros:**


- `bot`: A instância inicializada da classe `Bot`.

- `options`: Um objeto contendo opções de configuração:
  - `endpoint`: (Obrigatório) A URL do seu endpoint da API OpenAI.  
  - `engine_specific`: Um objeto com configuração específica do OpenAI:
    - `tools`: (Opcional) Uma matriz de definições de função para os recursos de chamada de função do OpenAI (consulte [Chamada de Função OpenAI](https://platform.openai.com/docs/guides/function-calling)).
    - `assistant_id`: (Opcional) O ID do assistente OpenAI a ser usado para a conversa.

### Métodos


#### `send(plugin, payload)`


Envia uma mensagem do usuário para a API OpenAI e retorna a resposta do chatbot.


```javascript

async send(plugin = false, payload)

```


**Parâmetros:**


- `plugin`: (Opcional) O nome do plugin que envia a mensagem. O padrão é `false`.

- `payload`:  Ou:
  -  A mensagem do usuário como uma string (para conversas simples sem chamada de função). 
  - Um objeto com as propriedades `tool_calls` e `output` (para responder a chamadas de função iniciadas pelo modelo OpenAI).

**Valor de Retorno:**


- Uma Promise que se resolve em uma matriz de objetos representando as respostas do bot. Cada objeto de resposta segue o formato Hands for Bots:


```json

{
  "recipient_id": "sender_id", // O remetente da mensagem (geralmente o ID do chatbot)
  "text": "Texto de resposta",       // O conteúdo de texto da resposta
  "image": "image_url",        // URL de uma imagem (opcional)
  "buttons": [                   // Matriz de botões (opcional)
    { "title": "Texto do Botão", "payload": "carga útil do botão" },
    // ...
  ]
}

```


#### `receive(payload)`


Este método não é usado atualmente pelo plugin de backend OpenAI. É um espaço reservado para potenciais melhorias futuras.


#### `prepareResponse(bot_dt)`


Um método interno que processa a resposta bruta da API OpenAI, transformando-a no formato esperado pelo Hands for Bots.


#### `setDefaultTools(engine_specific)`


Inicializa as funções padrão para o recurso de chamada de função do OpenAI com base na configuração `engine_specific.tools`.


#### `setAssistant(engine_specific)`


Define o ID do assistente OpenAI a ser usado, com base na configuração `engine_specific.assistant_id`.


#### `actionSuccess(response)`


Lida com a conclusão bem-sucedida de ações personalizadas acionadas pelo chatbot. Atualmente, é um espaço reservado para desenvolvimento futuro.

