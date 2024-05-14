##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; home dos docs](./README.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](./getstarted.md)
[![en-US](https://img.shields.io/badge/en-US-white)](../en-us/getstarted.md)

</div>

 # Começando com Hands for Bots

 Bem-vindo ao Hands for Bots, uma poderosa biblioteca JavaScript para criar interfaces de usuário conversacionais híbridas, que unem componentes conversacionais, gráficos e outros. Este guia irá guiá-lo pelos fundamentos da configuração e uso do Hands for Bots em seus projetos web.


 ## Início Rápido


 Hands for Bots simplifica o processo de integração de interfaces conversacionais com configuração mínima. Todas as opções de início rápido ativam o plugin de chamadas de função. Vamos mergulhar em alguns exemplos de início rápido:


 ### Chatbot de Texto com RASA


 Este exemplo configura um chatbot baseado em texto usando o RASA como o mecanismo conversacional de back-end:


 ```javascript

 import Bot from "./handsforbots/Bot.js";


 let bot_settings = {
   quick_start: "text", 
   engine: "rasa",
   language: "pt-BR",
   engine_endpoint: "http://localhost/rasa/webhooks/rest/webhook", 
 };


 const bot = new Bot(bot_settings);

 ```


 **Explicação:**


 - `quick_start: "text"`: Esta opção instrui o Hands for Bots a incluir automaticamente os plugins principais de entrada e saída de texto, criando uma interface básica de bate-papo por texto.

 - `engine: "rasa"`: Especifica o RASA como o mecanismo de back-end.

 - `language: "pt-BR"`: Define o idioma para a interface do chatbot. *Isso não se trata do idioma dos assistentes de back-end.*

 - `engine_endpoint`: Neste exemplo, a URL do endpoint do webhook REST do seu servidor RASA.


 ### Chatbot de Voz com RASA


 Veja como você pode criar um chatbot habilitado para voz usando o RASA:


 ```javascript

 import Bot from "./handsforbots/Bot.js";


 let bot_settings = {
   quick_start: "voice", 
   engine: "rasa",
   language: "pt-BR",
   engine_endpoint: "http://localhost/rasa/webhooks/rest/webhook", 
 };


 const bot = new Bot(bot_settings);

 ```


 **Explicação:**


 - `quick_start: "voice"`: Hands for Bots inclui automaticamente os plugins principais de entrada e saída de voz.

 - O restante das configurações é idêntico ao exemplo de chatbot de texto.


 ### Chatbot de Texto e Voz com RASA


 Para combinar recursos de texto e voz:


 ```javascript

 import Bot from "./handsforbots/Bot.js";


 let bot_settings = {
   quick_start: "text_and_voice",
   engine: "rasa",
   language: "pt-BR",
   engine_endpoint: "http://localhost/rasa/webhooks/rest/webhook", 
 };


 const bot = new Bot(bot_settings);

 ```


 **Explicação:**


 - `quick_start: "text_and_voice"`: Hands for Bots incluirá os plugins de texto e voz, fornecendo uma CUI abrangente.


 Lembre-se de ajustar o `language` e o `engine_endpoint` para corresponder à sua configuração. Você pode explorar configurações mais avançadas e opções de personalização na seção [Desenvolvimento](./development.md) da documentação.


 ## Comandos Personalizados/Chamadas de Função


 Hands for Bots capacita seu chatbot a interagir diretamente com seu aplicativo da web por meio de comandos personalizados ou chamadas de função. Isso permite uma ampla gama de ações, como:


 - Navegar dentro do seu site

 - Exibir galerias de imagens

 - Definir marcadores em um mapa

 - Desencadear animações


 **Importante:** Você não precisa integrar essas funções ao núcleo do Hands for Bots. A biblioteca fornece um mecanismo simples para chamá-las.


 ### Estrutura JSON


 Para invocar uma função personalizada, você precisará estruturar o comando como um objeto JSON na resposta do chatbot. Aqui está o formato geral:


 **Para funções JavaScript padrão:**


 ```json

 {
   "action": "NomeDaFunção", // Nome da função apenas
   "params": ["param1", "param2", {"param3": "valor"}] // Matriz de parâmetros (opcional)
 }

 ```


 **Para métodos de plugins do Hands for Bots:**


 ```json

 {
   "action": "NomeDaClasse.NomeDoMétodo", // Nome da classe e do método do plugin
   "params": ["param1", "param2", {"param3": "valor"}] // Matriz de parâmetros (opcional)
 }

 ```


 **Observação:**


 - A matriz `params` é opcional. Você pode passar um único parâmetro (string, objeto, etc.) ou omiti-lo inteiramente se a função não exigir argumentos.


 ### Posicionamento nas Respostas do Chatbot


 Para acionar o comando personalizado, inclua o objeto JSON, entre os delimitadores especiais `[•` (abrir) e `•]` (fechar), no final da resposta de texto do chatbot.


 **Exemplo para RASA (domain.yml):**


 ```yaml

 responses:
   utter_open_gallery:
   - text: "Aqui está nossa galeria: [•{'action': 'displayGallery', 'params': ['summer-collection']}•]"

   utter_set_marker:
   - text: "Marcando sua localização no mapa... [•{'action': 'MapPlugin.setMarker', 'params': {'lat': 40.7128, 'lng': -74.0060}}•]"
 ```


 ### Exemplo: Chamando uma Função JavaScript


 ```javascript

 // Exemplo de função para exibir uma galeria de imagens

 function displayGallery(collectionName) {
   // Lógica para buscar e exibir imagens com base no nome da coleção
   console.log(`Exibindo galeria para: ${collectionName}`);
 }


 // ... (código de inicialização do Hands for Bots) ...


 let bot_settings = {
   // ... (suas configurações) ...
 };


 const bot = new Bot(bot_settings);

 ```


 Quando o chatbot RASA envia a resposta `utter_open_gallery`, o Hands for Bots irá extrair o comando JSON e chamar a função `displayGallery`, passando "summer-collection" como parâmetro.


 ### Exemplo: Chamando um Método de Plugin


 Digamos que você tenha um "MapPlugin" personalizado com um método `setMarker`:


 ```javascript

 // Em Plugins/Output/MapPlugin/MapPlugin.js

 export default class MapPlugin {
   // ... (outro código do plugin) ...

   setMarker(coordinates) {
     // Lógica para definir um marcador no mapa usando as coordenadas fornecidas
     console.log(`Definindo marcador em:`, coordinates);
   }
 }

 ```


 A resposta `utter_set_marker` em seu RASA domain.yml invocará o método `setMarker` do `MapPlugin`.


 ## Playgrounds Docker


 Se você está ansioso para colocar a mão na massa com o Hands for Bots, nossos playgrounds Docker fornecem um ambiente pronto para experimentação.


 ### Configuração


 1. **Baixe o repositório:** [https://github.com/alexlana/handsforbots](https://github.com/alexlana/handsforbots)

 2. **Navegue até o diretório de exemplos:** Usando seu terminal, entre na pasta `./handsforbots/examples/`.

 3. **Inicie os contêineres Docker:** Execute `docker-compose up -d` para iniciar os serviços necessários (RASA, Vite, etc.).

 4. **Acesse o playground:** Abra [http://localhost/](http://localhost/) em seu navegador.


 ### Trabalhando com o Playground


 - Você pode modificar o código do Hands for Bots no diretório `./handsforbots/`.

 - O servidor de desenvolvimento Vite serve o código front-end de `./examples/vite/`.

 - O projeto RASA está localizado em `./examples/rasa/`.


 ### Treinando e Atualizando Seu Modelo RASA


 Para atualizar seu chatbot com alterações no seu projeto RASA, siga estas etapas:


 1. **Acesse o contêiner RASA:** Execute `docker exec -it t4b-bot sh` para abrir um shell dentro do contêiner.

 2. **Treine seu modelo:** Dentro do contêiner, execute `rasa train` para retreinar o modelo RASA.

 3. **Saia do contêiner:** Digite `exit` para sair do shell do contêiner.

 4. **Reinicie o contêiner RASA:** Execute `docker rm -f t4b-bot` seguido por `docker-compose up -d` para reiniciar o contêiner RASA com o modelo atualizado.


 Seu modelo treinado será salvo fora do contêiner Docker no diretório `./examples/rasa/models/`.


 ### Limpeza


 Quando terminar com o playground, pare os contêineres usando:


 - `docker rm -f t4b-duckling`

 - `docker rm -f t4b-actions`

 - `docker rm -f t4b-bot`

 - `docker rm -f t4b-vite`

 - `docker rm -f t4b-webserver`


 **Importante:** Esta configuração de playground é destinada ao desenvolvimento e experimentação local. Não o use para implantações de produção.


 Vamos prosseguir para a compreensão dos componentes principais e do sistema de plugins do Hands for Bots no guia de [Desenvolvimento](./development.md). 

