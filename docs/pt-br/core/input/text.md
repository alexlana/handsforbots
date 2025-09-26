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
  - `layout`: (Opcional) Configuração do layout da interface. Pode ser um string com layout predefinido ou objeto de configuração customizada:
    - Layouts predefinidos: `'default'`, `'compact'`, `'minimalist'`, `'floating'`
    - Configuração customizada: Objeto com propriedades específicas de posicionamento e aparência
  - `responsive`: (Opcional) Se `true`, habilita comportamento responsivo automático. O padrão é `true`.
  - `breakpoints`: (Opcional) Objeto definindo breakpoints customizados para responsividade (ex: `{ mobile: 768, tablet: 1024 }`).
  - `positioning`: (Opcional) Controla o posicionamento da janela de chat: `'bottom-right'`, `'bottom-left'`, `'top-right'`, `'top-left'`, `'center'`.
  - `position`: (Opcional) Posicionamento principal: `'sidebar'` (canto da tela) ou `'main'` (centro da tela, ocupa toda largura). O padrão é `'sidebar'`.
- `display_mode`: (Opcional) Modo de exibição: `'floating'` (flutuante com bordas arredondadas) ou `'snap'` (encaixado no layout, sem bordas). O padrão é `'floating'`.
- `always_open`: (Opcional) Se `true`, a janela de chat fica sempre aberta e não pode ser fechada pelo usuário. Remove o botão de fechar e impede o fechamento. O padrão é `false`.
- `header_layout`: (Opcional) Layout do cabeçalho: `'bar'` (barra tradicional), `'hidden'` (oculto), `'floating'` (flutuante no topo direito). O padrão é `'bar'`.
- `bot_face_layout`: (Opcional) Layout da barra do bot: `'bar'` (barra tradicional), `'hidden'` (oculto), `'floating'` (flutuante no topo esquerdo). O padrão é `'bar'`.
- `animations`: (Opcional) Habilita/desabilita animações da interface. O padrão é `true`.
- `theme`: (Opcional) Tema de cores: `'auto'`, `'light'`, `'dark'`. O padrão é `'auto'`.

## Combinações de Layout

O plugin Text Input suporta diferentes combinações de `position` e `display_mode`:

### Sidebar + Floating (Padrão)
```javascript
{
  position: 'sidebar',
  interaction_mode: 'floating'
}
```
- Chat flutuante no canto da tela
- Bordas arredondadas
- Largura fixa (300px)
- Comportamento tradicional

### Sidebar + Snap
```javascript
{
  position: 'sidebar',
  display_mode: 'snap'
}
```
- Chat encaixado no canto da tela
- Sem bordas arredondadas
- Altura adaptável (até 100vh)
- Aparência mais integrada

### Main + Floating
```javascript
{
  position: 'main',
  interaction_mode: 'floating'
}
```
- Chat centralizado na tela
- Largura de 90% da viewport
- Bordas arredondadas
- Posicionamento fixo no centro

### Main + Snap (Tela Cheia)
```javascript
{
  position: 'main',
  display_mode: 'snap'
}
```
- **Chat ocupa toda a largura da tela (100%)**
- **Altura total da viewport (100vh)**
- **Sem bordas arredondadas**
- **Integração perfeita com a página**
- Ideal para aplicações que precisam do chat como interface principal

### Exemplo de Configuração Tela Cheia

```javascript
let textInputConfig = {
  plugin: 'Text',
  type: 'input',
  position: 'main',
  display_mode: 'snap',
  start_open: true,
  title: 'Chat Principal'
}
```

## Janela Sempre Aberta

A opção `always_open` permite criar uma janela de chat que não pode ser fechada pelo usuário:

### Características da Opção `always_open`:

- **Remove o botão de fechar** (▲) do cabeçalho
- **Impede o fechamento** da janela ao clicar no cabeçalho
- **Abre automaticamente** quando a página carrega
- **Mantém a janela sempre visível** durante a navegação
- **Ideal para aplicações** que usam o chat como interface principal

### Exemplo de Uso:

```javascript
let textInputConfig = {
  plugin: 'Text',
  type: 'input',
  always_open: true,
  position: 'main',
  display_mode: 'snap',
  title: 'Chat Principal'
}
```

### Casos de Uso:

- **Aplicações de chat principal**: Quando o chat é a interface principal da aplicação
- **Suporte ao cliente**: Chat de atendimento que deve estar sempre disponível
- **Interfaces de assistente**: Assistentes virtuais que precisam estar sempre visíveis
- **Aplicações de produtividade**: Ferramentas que usam o chat como funcionalidade central

## Layouts de Header e Bot Face

O plugin Text Input oferece controle granular sobre a aparência do cabeçalho e da barra do bot:

### Layouts de Header (`header_layout`):

#### `'bar'` (Padrão)
- Cabeçalho tradicional integrado ao chat
- Título e botão de fechar na barra superior
- Comportamento padrão do sistema

#### `'hidden'`
- Remove completamente o cabeçalho
- Chat sem título visível
- Ideal para interfaces minimalistas

#### `'floating'`
- Cabeçalho flutuante no topo direito da tela
- Posição fixa, não bloqueia o conteúdo
- Efeito de vidro (backdrop-filter) para transparência
- Hover com destaque visual

### Layouts de Bot Face (`bot_face_layout`):

#### `'bar'` (Padrão)
- Barra do bot tradicional integrada ao chat
- Avatar e nome do bot na barra superior
- Comportamento padrão do sistema

#### `'hidden'`
- Remove completamente a barra do bot
- Chat sem identificação visual do bot
- Ideal para interfaces limpas

#### `'floating'`
- Barra do bot flutuante no topo esquerdo da tela
- Posição fixa, não bloqueia o conteúdo
- Avatar menor (32x32px) para economia de espaço
- Efeito de vidro (backdrop-filter) para transparência

### Exemplos de Configuração:

#### Interface Minimalista
```javascript
let textInputConfig = {
  plugin: 'Text',
  type: 'input',
  header_layout: 'hidden',
  bot_face_layout: 'hidden',
  position: 'main',
  display_mode: 'snap'
}
```

#### Interface Flutuante
```javascript
let textInputConfig = {
  plugin: 'Text',
  type: 'input',
  header_layout: 'floating',
  bot_face_layout: 'floating',
  position: 'sidebar',
  display_mode: 'floating'
}
```

#### Interface Híbrida
```javascript
let textInputConfig = {
  plugin: 'Text',
  type: 'input',
  header_layout: 'floating',
  bot_face_layout: 'hidden',
  position: 'main',
  display_mode: 'snap'
}
```

### Casos de Uso por Layout:

#### Header Flutuante:
- **Aplicações de produtividade**: Não bloqueia o conteúdo principal
- **Dashboards**: Mantém controles acessíveis sem interferir
- **Interfaces de trabalho**: Acesso rápido sem ocupar espaço

#### Bot Face Flutuante:
- **Assistentes visuais**: Presença constante do bot sem interferir
- **Aplicações de suporte**: Identificação do assistente sempre visível
- **Interfaces de chat**: Personalidade do bot mantida discretamente

#### Elementos Ocultos:
- **Interfaces minimalistas**: Foco total no conteúdo
- **Aplicações de chat puro**: Sem distrações visuais
- **Interfaces customizadas**: Controle total sobre a aparência

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


#### `messageWrapper(payload, side = 'user', recipient = null, html = null)`


Cria a estrutura HTML para uma bolha de mensagem de bate-papo.

**Parâmetros:**

- `payload`: O texto da mensagem.
- `side`: (Opcional) O lado da mensagem (`'user'`, `'bot'`, `'temp'`). O padrão é `'user'`.
- `recipient`: (Opcional) Tipo de destinatário (para estilos específicos como `'error'`). O padrão é `null`.
- `html`: (Opcional) Conteúdo HTML para ferramentas MCP inline. Quando fornecido, substitui o `payload` renderizado. O padrão é `null`.


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


## Integração com Ferramentas MCP

O plugin de entrada de texto oferece suporte completo para exibição inline de conteúdo de ferramentas MCP (Model Context Protocol). Isso permite que ferramentas MCP exibam seu conteúdo diretamente na janela de chat, ao invés de apenas em modais externos.

### Funcionamento

Quando uma ferramenta MCP retorna conteúdo com `type: 'inline_content'`, o sistema:

1. **Processa no BotOrchestrator**: O conteúdo inline é detectado e processado separadamente
2. **Injeta no Chat**: O conteúdo é inserido diretamente na sequência de mensagens
3. **Salva no Histórico**: O conteúdo inline fica persistente no histórico de conversas
4. **Renderiza com CSS**: Aplica estilos específicos através da classe `mcp_inline_content`

### Estrutura de Retorno MCP

Para que uma ferramenta MCP exiba conteúdo inline, ela deve retornar:

```javascript
{
  type: 'inline_content',
  data: {
    text: 'Texto resumo da ferramenta',
    html: '<div class="custom-content">HTML estruturado</div>',
    images: ['url1.jpg', 'url2.png'], // Array opcional de imagens
    title: 'Título do conteúdo'
  }
}
```

### Configuração de Ferramentas MCP

Ferramentas MCP podem configurar seu modo de exibição:

```javascript
// No plugin MCP
constructor(bot, options) {
  this.outputMode = options.outputMode || 'modal' // 'modal' | 'inline' | 'both'
}

getMCPToolDefinition() {
  return {
    name: 'minha_ferramenta',
    parameters: {
      // ... outros parâmetros
      outputMode: {
        type: 'string',
        enum: ['modal', 'inline'],
        description: 'Como exibir o resultado',
        default: this.outputMode
      }
    }
  }
}
```

### CSS para Conteúdo Inline

Conteúdo inline recebe automaticamente a classe `mcp_inline_content` e pode ser estilizado:

```css
.mcp_inline_content {
  /* Estilos aplicados a todo conteúdo MCP inline */
}

.mcp_inline_content .custom-gallery {
  /* Estilos específicos para galerias inline */
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
}
```

### Exemplos de Uso

**Galeria de Imagens Inline:**
```javascript
// Ferramenta MCP retorna
{
  type: 'inline_content',
  data: {
    text: 'Galeria: Wordpress na GCP',
    html: `
      <div class="inline-gallery-content">
        <h3>Wordpress na GCP</h3>
        <div class="inline-gallery-images">
          <figure><img src="image1.jpg"><figcaption>Passo 1</figcaption></figure>
          <figure><img src="image2.jpg"><figcaption>Passo 2</figcaption></figure>
        </div>
      </div>
    `
  }
}
```

**Conteúdo de Documentação:**
```javascript
{
  type: 'inline_content',
  data: {
    text: 'Documentação: Configuração do Plugin',
    html: `
      <div class="doc-content">
        <h4>Configuração</h4>
        <pre><code>plugin: 'Text', layout: 'compact'</code></pre>
        <p>Esta configuração ativa o modo compacto...</p>
      </div>
    `
  }
}
```

### Benefícios

- **Experiência Integrada**: Conteúdo aparece naturalmente na conversa
- **Histórico Persistente**: Todo conteúdo fica salvo e pode ser revisitado
- **Responsividade**: Adapta-se automaticamente a diferentes tamanhos de tela
- **Flexibilidade**: Ferramentas podem escolher entre modal ou inline dinamicamente



