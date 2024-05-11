##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; home dos docs](./README.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](./getstarted.md)
[![en-US](https://img.shields.io/badge/en-US-white)](../getstarted.md)

</div>


# Começando

## Ambientes Docker

Se você tem o Docker instalado, você pode simplesmente:

- [baixar o repositório](https://github.com/alexlana/handsforbots)
- usando o terminal, entre na pasta `./handsforbots/examples/`
- execute `docker-compose up -d`
- acesse [http://localhost/](http://localhost/) em seu navegador

Quando terminar, execute no terminal:

- `docker rm -f t4b-duckling`
- `docker rm -f t4b-actions`
- `docker rm -f t4b-bot`
- `docker rm -f t4b-vite`
- `docker rm -f t4b-webserver`

**Por favor, não use isso em produção.** Mas você pode brincar localmente trabalhando nos arquivos em `./handsforbots/`, `./examples/vite/` and `./examples/rasa/`.

Se você trabalha com RASA, você pode treiná-lo e reiniciar o contêiner RASA após rodar o `docker-compose` conforme instruções acima:

1. `docker exec -it t4b-bot sh`
2. então `rasa train` dentro do contêiner
3. quando o modelo foi treinado, execute `exit`
4. `docker rm -f t4b-bot`
5. `docker-compose up -d`

Seu chatbot será atualizado e o modelo será salvo fora do contêiner Docker em `./examples/rasa/models/`.

## Início rápido

Uma vez que você tenha um assistente de back-end funcionando, você pode usar um dos scripts abaixo para iniciar sua interface de bot usando configuração mínima.

### Vanila JavaScript

Baixe a versão que você quer usar, descompacte, copie para o seu projeto e você pode usar algumas das opções de início rápido:

```javascript
// Inicia chatbot de texto usando RASA como back-end.

import Bot from "./handsforbots/Bot.js";

let bot_settings = {

   quick_start: "text"

   engine: "rasa",
   language: "en-US",
   engine_endpoint: "http://localhost/rasa/webhooks/rest/webhook",
};
const bot = new Bot( bot_settings );

```

```javascript
// Inicia chatbot de voz usando RASA como back-end.

import Bot from "./handsforbots/Bot.js";

let bot_settings = {

   quick_start: "voice"

   engine: "rasa",
   language: "en-US",
   engine_endpoint: "http://localhost/rasa/webhooks/rest/webhook",
};
const bot = new Bot( bot_settings );

```

```javascript
// Inicia chatbot de texto e voz usando RASA como back-end.

import Bot from "./handsforbots/Bot.js";

let bot_settings = {

   quick_start: "text_and_voice"

   engine: "rasa",
   language: "en-US",
   engine_endpoint: "http://localhost/rasa/webhooks/rest/webhook",
};
const bot = new Bot( bot_settings );

```

Existem muitas outras opções, mas se você definir uma opção `quick_start`, um assistente de back-end (engine) e um idioma, você pode começar a testar.

### Comandos personalizados / chamadas de funções

Esta é a maneira como o assistente pode interagir com o front-end usando chamadas de ferramentas. É possível navegar em um site, abrir uma galeria de imagens, definir um marcador em um mapa etc. Você pode desenvolver uma função e então fazer o back-end chamá-la. <u>*Você não precisa integrar a função com o núcleo da biblioteca*</u>, ela será simplesmente chamada, então você não precisa trabalhar mais, a menos que queira aproveitar alguns dos recursos da biblioteca.

Se você quiser chamar uma classe externa, crie uma função para isso e chame a função.

Para chamar uma função, você precisa passar um JSON como este:

```json
// Chamar uma função externa, não dependente da biblioteca:
{
   "action":"FunctionName", // use apenas o nome da função
   "params":[
      "params to",
      "pass to your function",
      "if needed",
      "formatted according to",
      "the needs of the function",
      "'params' can be a string, object...",
      "do not need to be an array",
      "like in this example"
   ]
}
```

Para chamar um método de um plugin integrado com a biblioteca, você precisa passar um JSON como este:

```json
// Chamar uma função externa, não dependente da biblioteca:
{
   "action":"ClassName.MethodName", // use o nome da classe e o nome do método separados por um ponto
   "params":[
      "params to",
      "pass to your method",
      "if needed",
      "formatted according to",
      "the needs of the method",
      "'params' can be a string, object...",
      "do not need to be an array",
      "like in this example"
   ]
}
```

Você pode adicionar o JSON, delimitado pelos símbolos `[•` (na abertura), e `•]` (no fechamento) ao final da resposta do chatbot.

```yaml
# Se você usa RASA, este é um exemplo:
# No seu domain.yaml, na seção de resposta:

responses:
  # essa resposta dispara o método "newGuide" do plugin "GUIDed". Você pode encontrar esse plugin em /Plugins/Output/GUIDed/.
  utter_please_explain:
  - text: Eu posso te mostrar! [•{"action":"GUIDed.newGuide","params":[{"type":"modal","title":"Bem-vindo ao tutorial guiado","text":"Esta é a interface do aplicativo. Queremos que você saiba tudo o que pode fazer aqui!","btn_next":"Vamos começar!"},{"type":"balloon","title":"Salve seu trabalho","text":"Este botão é para salvar seu trabalho. Não se esqueça de salvar!","dom_element":"#save_button"},{"type":"balloon","title":"Abra um trabalho antigo","text":"E este botão é para abrir seus trabalhos antigos ou em andamento.","dom_element":"#open_button"},{"type":"balloon","title":"Pergunte-me","text":"Se você tiver dúvidas, peça-me mais informações.","dom_element":"#chat_input"},{"type":"balloon","title":"Pergunte-me","text":"Você pode perguntar usando sua própria voz também.","dom_element":"#speech_button"},{"type":"modal","title":"É isso aí!","text":"Ok! É isso aí, pessoal!","btn_previous":"<< Anterior","btn_close":"Entendi!"}]}•]
  # essa resposta dispara a função "stop_doomsday_clock()" externa à biblioteca.
  utter_please_explain:
  - text: Stopping the Doomsday Clock... [•{"action":"stop_doomsday_clock","params":"Você salvou o dia!"}•]

```

