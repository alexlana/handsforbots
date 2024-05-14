##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; home dos docs](./README.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](./events.md)
[![en-US](https://img.shields.io/badge/en-US-white)](../en-us/events.md)

</div>


  # Tratamento de Eventos no Hands for Bots


  O Hands for Bots utiliza uma arquitetura robusta orientada a eventos para comunicação e interação entre seu núcleo, plugins e seu aplicativo da web. Essa abordagem promove baixo acoplamento, permitindo desenvolvimento flexível e extensível.


  ## Entendendo o Sistema de Eventos


  - **Eventos como Disparadores:** Eventos atuam como sinais que indicam ações específicas, mudanças de estado ou disponibilidade de dados dentro do sistema Hands for Bots.

  - **Disparando Eventos:** Plugins ou seu aplicativo podem disparar eventos usando `this.bot.eventEmitter.trigger('nome_do_evento', [dado1, dado2, ...])`. 
    - Substitua `'nome_do_evento'` pelo nome específico do evento que você deseja disparar.
    - Inclua quaisquer dados relevantes dentro da matriz como parâmetros a serem passados para os ouvintes de eventos.
  - **Ouvindo Eventos:** Para responder a um evento específico, use `this.bot.eventEmitter.on('nome_do_evento', minhaFuncao)`. A `minhaFuncao` que você fornecer será executada quando o evento especificado for disparado, recebendo os dados passados do disparador. 


  ## Eventos Principais


  O núcleo do Hands for Bots dispara vários eventos que permitem que os plugins interajam com o ciclo de vida do chatbot e o fluxo de dados. Aqui está uma análise desses eventos principais:


  ### Eventos Disparados pelo Núcleo


  - **`core.loaded`:** Emitido quando o núcleo do Hands for Bots e todos os plugins foram carregados com sucesso. Use este evento para executar ações que exigem que todos os componentes estejam disponíveis.

  - **`core.all_ui_loaded`:** Disparado quando os componentes da IU de todos os plugins foram totalmente carregados e renderizados.

  - **`core.input_received`:** Emitido depois que um plugin de entrada processou a entrada do usuário e o núcleo a recebeu.

  - **`core.output_ready`:** Indica que a resposta do chatbot do mecanismo de backend está pronta e será enviada para os plugins de saída.

  - **`core.history_added`:** Disparado sempre que o histórico de conversas é atualizado com uma nova entrada do usuário ou resposta do chatbot.

  - **`core.history_loaded`:** Emitido quando o histórico de conversas foi carregado do armazenamento (se habilitado) durante a inicialização do Hands for Bots.

  - **`core.calling_backend`:** Indica que o núcleo está enviando uma mensagem do usuário para o mecanismo de backend. Os plugins podem usar este evento para exibir um indicador de carregamento ou outro feedback.

  - **`core.backend_responded`:** Sinaliza que o mecanismo de backend forneceu uma resposta à mensagem do usuário.

  - **Evento Personalizado na Resposta do Backend:** O núcleo dispara um evento personalizado especificamente para o plugin que iniciou a solicitação ao backend. Isso permite o tratamento direcionado de respostas. O plugin é responsável por definir e ouvir este evento personalizado. 

  - **`core.history_cleared`:** Emitido quando o histórico de conversas foi limpo, geralmente devido à expiração da sessão ou configurações de privacidade. 


  ### Eventos Ouvidos pelo Núcleo


  - **`core.send_to_backend`:** Os plugins de entrada usam este evento para enviar uma carga útil de mensagem do usuário para o mecanismo de backend.

  - **`core.backend_responded`:** Este evento é tratado internamente pelo núcleo para gerenciar a fila de mensagens aguardando para serem enviadas ao backend. Não deve ser disparado por plugins.

  - **`core.spread_output`:** Os plugins de saída usam este evento para receber a resposta do chatbot e exibi-la ao usuário.

  - **`core.input`:** Disparado por plugins de entrada para registrar novas entradas do usuário e adicioná-las ao histórico de conversas.

  - **`core.ui_loaded`:** Os plugins emitem este evento para informar ao núcleo que seu componente de IU foi carregado. O núcleo usa isso para rastrear o progresso de carregamento de todos os plugins.

  - **`core.renew_session`:** Os plugins de entrada podem disparar este evento para estender a sessão do usuário, evitando que o histórico seja limpo devido à inatividade.

  - **`core.action_success`:** Usado para comunicar a conclusão bem-sucedida de uma ação personalizada disparada por um comando de chatbot. Os plugins de saída que executam essas ações devem disparar este evento.


  ## Exemplo: Tratando Eventos em um Plugin


  ```javascript

  // Em MeuPluginDeSaida.js


  export default class MeuPluginDeSaida {
    constructor(bot) {
      this.bot = bot;

      // Ouça o evento de saída pronta
      this.bot.eventEmitter.on('core.output_ready', (payload) => {
        this.exibirResposta(payload);
      });
    }

    exibirResposta(payload) {
      // Código para processar e exibir a saída
      // ...

      // Dispare um evento para informar ao núcleo que a resposta foi exibida
      this.bot.eventEmitter.trigger('meuplugin.resposta_exibida');
    }
  }

  ```


  Neste exemplo, o `MeuPluginDeSaida` ouve o evento `core.output_ready` e então dispara seu próprio evento personalizado, `meuplugin.resposta_exibida`, para informar outras partes do sistema que ele lidou com a resposta do chatbot.

