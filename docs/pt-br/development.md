##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; home dos docs](./README.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](./development.md)
[![en-US](https://img.shields.io/badge/en-US-white)](../en-us/development.md)

</div>


 # Estendendo o Hands for Bots


 O Hands for Bots foi projetado para ser altamente extensível por meio de seu sistema de plugins. Este guia irá se aprofundar na arquitetura da biblioteca, nos tipos de plugins e em como você pode criar seus próprios plugins personalizados para aprimorar suas experiências conversacionais híbridas.


 ## Estrutura de Pastas da Biblioteca


 Compreender a organização da base de código do Hands for Bots é essencial para o desenvolvimento. Aqui está uma análise das pastas principais da biblioteca:


 ```
 .
 +- Bot.js          // O núcleo do Hands for Bots, gerenciando o gerenciamento de plugins e o fluxo de eventos
 +- Core            // Contém plugins principais integrados
 |  +- Backend     // Plugins que se conectam aos backends do chatbot
 |  |  +- OpenAI.js
 |  |  +- Rasa.js
 |  +- Input       // Plugins para lidar com entradas do usuário
 |  |  +- Poke.js
 |  |  +- Text.js
 |  |  +- TextChatCSS.js
 |  |  +- Voice.js
 |  |  +- VoiceChatCSS.js
 |  +- Output      // Plugins para apresentar as saídas do chatbot
 |     +- BotsCommands.js
 |     +- Text.js
 |     +- Voice.js
 +- Libs            // Bibliotecas externas e utilitários usados pelo Hands for Bots
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
 +- Plugins         // O diretório para seus plugins personalizados
    +- Backend     // Plugins de backend personalizados
    +- Input       // Plugins de entrada personalizados
    +- Output      // Plugins de saída personalizados
 ```


 ## Tipos de Plugins


 Os plugins do Hands for Bots são categorizados em quatro tipos principais:


 - **Backend:** Esses plugins atuam como a ponte entre sua interface front-end e seu mecanismo conversacional escolhido (RASA, OpenAI ou outros). Eles lidam com a comunicação, enviando as entradas do usuário para o backend e recebendo as respostas do chatbot.

 - **Input:** Os plugins de entrada são responsáveis por capturar as interações do usuário e convertê-las em um formato adequado para envio ao backend.  Exemplos comuns incluem entrada de texto, reconhecimento de voz e gatilhos de eventos.

 - **Output:** Os plugins de saída pegam as respostas do chatbot e as apresentam para o usuário de forma visualmente envolvente e informativa. Eles lidam com a renderização de texto, reprodução de áudio, exibição de imagens e muito mais.

 - **GUI:** (A fazer) Esses plugins serão integrados a frameworks visuais como Bootstrap ou Material Design, fornecendo componentes pré-construídos para janelas de chatbot, botões de microfone e outros elementos de interface.


 ## Como Estender a Biblioteca


 O Hands for Bots incentiva a personalização por meio da criação de seus próprios plugins. Aqui está um guia geral:


 1. **Escolha o Tipo de Plugin:** Determine qual tipo de plugin melhor se adapta à funcionalidade que você deseja adicionar (Backend, Input ou Output).

 2. **Crie o Diretório do Plugin:** Dentro da pasta `Plugins`, crie um subpasta para seu plugin usando seu tipo (por exemplo, `Plugins/Input/MeuPluginDeEntrada`).

 3. **Crie o Arquivo do Plugin:** Dentro do diretório do plugin, crie um arquivo JavaScript com o mesmo nome do seu plugin (por exemplo, `MeuPluginDeEntrada.js`).

 4. **Exporte sua Classe:** No arquivo do plugin, exporte uma classe JavaScript com o mesmo nome do plugin. Esta classe conterá a lógica para seu plugin. Consulte os exemplos de plugin de Entrada e Saída abaixo para a base estrutura.


 **Convenções Importantes de Nomenclatura:**


 - Os nomes dos plugins devem usar apenas letras e números (sem espaços ou caracteres especiais).

 - O nome da classe do plugin, o nome do arquivo e o nome da pasta devem ser todos idênticos.


 ## Exemplos de Plugins Personalizados


 ### Exemplo de Plugin de Entrada


 ```javascript

 // Plugins/Input/MeuPluginDeEntrada/MeuPluginDeEntrada.js


 export default class MeuPluginDeEntrada {

   constructor(bot) { // Injete a instância inicializada do bot
     this.bot = bot;

     // Ouça o evento de resposta do backend
     this.bot.eventEmitter.on('meu_plugin.receptor', (response) => {
       this.receptor(response);
     });
   }

   // Receba a entrada do usuário e envie para o backend
   input(payload) {
     this.bot.eventEmitter.trigger('core.send_to_backend', [{
       'plugin': 'MeuPluginDeEntrada', 
       'payload': payload, 
       'trigger': 'meu_plugin.receptor'
     }]);
   }

   // Lide com a resposta do backend
   receptor(response) {
     // Modifique a resposta se necessário

     // Autorize os plugins de saída para exibir a resposta
     this.bot.eventEmitter.trigger('core.spread_output', [response]);
   }

   // Anexe a interface do usuário ao bot
   ui(options) {
     // Código para criar e anexar os elementos da IU
     // ...

     this.bot.eventEmitter.trigger('core.ui_loaded'); 
   }
 }

 ```


 ### Exemplo de Plugin de Saída


 ```javascript

 // Plugins/Output/MeuPluginDeSaida/MeuPluginDeSaida.js


 export default class MeuPluginDeSaida {

   constructor(bot) { // Injete a instância inicializada do bot
     this.bot = bot;

     // Ouça o evento de saída pronta
     this.bot.eventEmitter.on('core.output_ready', (payload) => {
       this.output(payload);
     });
   }

   // Lide com a saída do chatbot
   output(payload) {
     // Código para processar e exibir a saída
     // ...
   }

   // Anexe a interface do usuário ao bot
   ui(options) {
     // Código para criar e anexar os elementos da IU
     // ...

     this.bot.eventEmitter.trigger('core.ui_loaded');
   }
 }

 ```

 ## Como carregar seu plugin customizado

 Os plugins devem ser carregados durante a inicialização do Hands for Bots, quando também devem ser informadas as opções de configuração que o plugin suporta, além do tipo de plugin e do nome do plugin em letras minúsculas.

 ```javascript
  // estas são as configurações para informar o motor / assistente que você deseja usar, além de listar entradas, saídas e plugins personalizados
  let bot_settings = {
    engine: "rasa",
    language: "pt-br",
    engine_endpoint: "http://localhost/rasa/webhooks/rest/webhook",

    core: [],
    plugins: [],
  }

  // adicione seu plugin customizado
  let guided_settings = {
    plugin: 'GUIDed', // este é o nome do plugin
    type: 'output', // este é o tipo de plugin
    wait_user: true, // esta é uma opção de configuração deste plugin
    auto_start: false, // esta é uma opção de configuração deste plugin
    sequence: [ // esta é uma opção de configuração deste plugin
      {
        type: 'modal',
        title: 'Welcome to the guided tutorial',
        text: 'This is the app interface. We want you to know all you can do here!',
        btn_next: 'Let\'s start!'
      },
      {
        type: 'balloon',
        title: 'Save your work',
        text: 'This button is to save your work, but it is fake. Do not forget to save!',
        dom_element: '#save_button'
      },
    ]
  }
  bot_settings.plugins.push( guided_settings ) // adicione as informações do plugin na lista de plugins

  // inicialize seu bot
  const bot = new Bot( bot_settings )
 ```

 Mais informações sobre inicialização do seu chatbot no [guia de início](./getstarted.md).


 ## Eventos: A espinha dorsal da comunicação


 O Hands for Bots aproveita uma arquitetura orientada a eventos para perfeita comunicação entre o núcleo, os plugins e seu aplicativo da web. Isso permite para acoplamento flexível e interações flexíveis.


 ### Como os Eventos Funcionam


 1. **Disparando Eventos:** Para iniciar uma ação ou notificar outras partes do sistema, você usa `this.bot.eventEmitter.trigger('nome_do_evento', [dado1, dado2, ...])`. Substitua `nome_do_evento` pelo evento específico que você deseja disparar e inclua quaisquer dados relevantes na matriz.

 2. **Ouvindo Eventos:** Para responder a um evento específico, use `this.bot.eventEmitter.on('nome_do_evento', minhaFuncao)`.  A `minhaFuncao` será executada quando o `nome_do_evento` for disparado.


 Consulte o guia [Eventos](./events.md) para obter uma lista abrangente de eventos principais e como lidar com eles de forma eficaz dentro de seus plugins.


 ## Z-index: onde estão as camadas padrão da UI?

 Essas são as profundidades de cada elemento padrão, você pode alterar com seu próprio CSS e posicionar seus plugins customizados entre essas camadas de acordo com suas necessidades.

 - **Janela do chatbot (core)**: 999

 - **Botão de fala do usuário (core)**: quando desacoplado da janela do chatbot, 10

 - **Botão de fala do bot (core)**: quando desacoplado da janela do chatbot, 20

 - **Balões do GUIDed (plugin)**: 1001 (acima da janela do chatbot)

 - **Overlay do GUIDed (plugin)**: 998 (abaixo da janela do chatbot)

 - **Preview da imagem do Photo (plugin)**: 997 (abaixo da janela do chatbot e do overlay do GUIDed)

