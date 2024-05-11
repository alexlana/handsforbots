##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; home dos docs](./README.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](./development.md)
[![en-US](https://img.shields.io/badge/en-US-white)](../development.md)

</div>


# Desenvolvimento

## Estrutura de pastas da biblioteca

```
.
+- Bot.js
+- Core
|  +- Backend
|  |  +- OpenAI.js
|  |  +- Rasa.js
|  +- GUI (to do)
|  +- Input
|  |  +- Poke.js
|  |  +- Text.js
|  |  +- TextChatCSS.js
|  |  +- Voice.js
|  |  +- VoiceChatCSS.js
|  +- Output
|     +- BotsCommands.js
|     +- Text.js
|     +- Voice.js
+- Libs
|     +- EasySpeech.es5.js
|     +- EnvironmentDetection.js
|     +- EventEmitter.js
|     +- js.cookie.min.js
|     +- Marked.js
|     +- nl2br.js
|     +- SpeechRecognition.js
|     +- Vosk
|     +- VoskConnector.js
|     +- WebStorage.umd.min.js
+- Plugins
   +- Backend
   +- GUI (to do)
   +- Input
   +- Output
```

## Tipos de plugins

A biblioteca possui três tipos de plugins:
- **Backend:** conecta a biblioteca a chatbots, assistentes, APIs de chat online etc
- **Input:** cria maneiras de enviar dados para o backend como texto, voz e outros
- **Output:** cria interfaces para mostrar dados do backend para o usuário como texto, áudio, imagens e outros

A fazer:
- **GUI:** esses plugins carregarão algum framework visual como Botstrap, Material Design ou outro, e fornecerão janelas de chatbot, botão de microfone etc.

## Como estender a biblioteca

Crie seu plugin e coloque-o na pasta `Plugins` sob a pasta do tipo de plugin apropriado (backend, input ou output). Lembre-se, se você quiser chamadas de funções simples, não precisa criar um novo plugin, faça uma chamada simples (veja mais na seção *Chamadas de funções*).

## Plugins customizados

Você não precisa criar um plugin para ações como "abrir um popup". Neste caso, você pode simplesmente chamar uma função (veja mais na seção *Chamadas de funções*).

**Quando é melhor criar um plugin**: se você quiser interagir com a conversa, acessar mensagens, usar histórico… um plugin será útil. Explore o plugin **GUIDed** (`/Plugins/Output/GUIDed/`), este plugin pode usar as mensagens do usuário para escolher um tutorial e navegar pelo tutorial.

Seu plugin precisa ser um dos três tipos de plugins descritos no início deste manual. Se você quiser criar uma experiência envolvendo entradas do usuário **+** saídas do bot, você precisará criar dois plugins, um plugin para cada extremidade da interação.

O plugin deve ter esta estrutura mínima de arquivos/pastas:
```
.
+- MyPluginName
   +- MyPluginName.js
```

O **nome do plugin só pode ter letras e números**, não são permitidos caracteres especiais.

No arquivo NomeDoMeuPlugin.js, você precisa exportar sua classe, e o nome da classe precisa ser o mesmo da pasta e do arquivo principal do plugin.

### Plugins de back-end

### Plugins de GUI

### Plugins de input

```javascript
// Exemplo de plugin de Input.

export default class MyPlugin {

   constructor ( bot ) { // injeta a instância inicializada do bot

      this.bot = bot

      /**
       * Recebe a resposta do backend.
       */
      this.bot.eventEmitter.on( 'my_plugin.receiver', ( response )=>{
         this.receiver( response )
      })

   }

   /**
    * Recebe uma entrada do usuário.
    */
   input ( payload ) {
      this.bot.eventEmitter.trigger( 'core.send_to_backend', [{ 'plugin': 'MyPlugin', 'payload': payload, 'trigger': 'my_plugin.receiver' }] )
   }

   receiver ( response ) {
      this.bot.eventEmitter.trigger( 'core.spread_output', [response] ) // autoriza a dispersar a resposta para os plugins de output, após modificar ou não.
   }

   /**
    * Anexa a interface do usuário ao bot. O bot chama este método.
    */
   ui ( options ) {

      this.bot.eventEmitter.trigger( 'core.ui_loaded' )

   }

}
```

### Plugins de output

```javascript
// Exemplo de plugin de Output.

export default class MyPlugin {

   constructor ( bot ) { // injeta a instância inicializada do bot

      this.bot = bot

      /**
       * Recebe uma saída do bot.
       */
      this.bot.eventEmitter.on( 'core.output_ready', ( payload )=>{
         this.output( payload )
      })

   }

   /**
    * Recebe uma saída do bot.
    */
   output ( payload ) {
   }

   /**
    * Anexa a interface do usuário ao bot. O bot chama este método.
    */
   ui ( options ) {

      this.bot.eventEmitter.trigger( 'core.ui_loaded' )

   }

}
```

## Eventos

A biblioteca requer plugins que interagem com o núcleo usando eventos. Faça isso para lidar com eventos:

1. receba a variável `bot` no método `constructor`;
2. salve-a na variável `this.bot`. Então...
3. para disparar um evento, use `this.bot.eventEmitter.trigger( 'event_name', [ variable_1_to_send, variable_2_to_send, variable_n_to_send ] )`;
4. para ouvir um evento, use `this.bot.eventEmitter.on('event_name', myfunction)`.


### Núcleo

O núcleo dispara os seguintes eventos:

- **core.loaded**: o núcleo e todos os plugins estão carregados. Você pode usar isso para disparar ações assim que tudo estiver disponível.
- **core.all_ui_loaded**: todos os componentes da UI, de todos os plugins, estão disponíveis.
- **core.input_received**: o núcleo recebe uma entrada depois que ela foi processada pelo plugin de origem.
- **core.output_ready**: a saída recebida de um framework ou agente conversacional está disponível e será enviada para os plugins que estão ouvindo o gatilho.
- **core.history_added**: o histórico de chat / eventos foi atualizado.
- **core.history_loaded**: quando a biblioteca foi iniciada, o histórico de mensagens / eventos foi carregado do armazenamento.
- **core.calling_backend**: o núcleo está enviando alguma informação para o backend. Você pode usar este evento para mostrar algum componente de "carregamento/aguardando".
- **core.backend_responded**: o núcleo recebeu a resposta do backend.
- **Custom event on back end response**: o núcleo recebeu a resposta do backend e envia a resposta para o plugin responsável pela entrada. O plugin quer enviar o nome do evento personalizado e ouvir este evento.
- **core.history_cleared**: o histórico foi excluído. Isso ocorre por causa da privacidade, então após um tempo definido de inatividade o histórico expira.

O núcleo ouve os seguintes eventos:

- **core.send_to_backend**: recebe a carga útil para enviar para o backend.
- **core.backend_responded**: este não é para disparar a partir de plugins. Ao receber este evento, o núcleo verifica se temos mensagens enfileiradas para enviar para o backend.
- **core.spread_output**: recebe output para dispersar para todos os plugins.
- **core.input**: recebe uma entrada para adicionar ao histórico.
- **core.ui_loaded**: conta uma nova UI completamente carregada.
- **core.renew_session**: quando o usuário interage, o plugin de entrada pode disparar este evento para renovar a sessão do usuário.
- **core.action_success**: após chamar uma função, obtenha o resultado do uso da ferramenta para enviar como uma resposta para o assistente do backend.



