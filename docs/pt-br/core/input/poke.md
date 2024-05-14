##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; docs' home](../../README.md) / [core](../../core.md) / [input](../input.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](./poke.md)
[![en-US](https://img.shields.io/badge/en-US-white)](../../en-us/core/input/poke.md)

</div>


# Plugin de Backend RASA


O plugin de backend RASA conecta o Hands for Bots a um servidor RASA, permitindo que seu aplicativo da web interaja com um chatbot alimentado por RASA. Este plugin lida com a comunicação entre seu front-end e o servidor RASA, enviando mensagens do usuário e recebendo as respostas do chatbot.


## Referência da API


### Construtor


```javascript

constructor(bot, options) 

```


**Parâmetros:**


- `bot`: A instância inicializada da classe `Bot`.

- `options`: Um objeto contendo opções de configuração:
  - `endpoint`: (Obrigatório) A URL do endpoint do webhook REST do seu servidor RASA.

### Métodos


#### `send(plugin, payload)`


Envia uma mensagem do usuário para o servidor RASA e retorna a resposta do chatbot.


```javascript

async send(plugin = false, payload)

```


**Parâmetros:**


- `plugin`: (Opcional) O nome do plugin que envia a mensagem. O padrão é `false`.

- `payload`: A mensagem do usuário como uma string.


**Valor de Retorno:**


- Uma Promise que se resolve em uma matriz de objetos representando as respostas do chatbot. Cada objeto de resposta segue o formato:


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


Este método não é usado atualmente pelo plugin de backend RASA. É um espaço reservado para potenciais melhorias futuras.


#### `imagesFirst(bot_dt)`


Método interno que reordena as respostas do bot, colocando as respostas de imagem antes das respostas de texto.  


#### `actionSuccess(response)`


Este método não é usado atualmente pelo plugin de backend RASA. É um espaço reservado para potenciais melhorias futuras relacionadas a ações personalizadas.

