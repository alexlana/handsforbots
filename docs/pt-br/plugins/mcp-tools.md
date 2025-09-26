##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; home dos docs](../README.md) / [plugins](./plugins.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](./mcp-tools.md)
[![en-US](https://img.shields.io/badge/en-US-white)](../../en-us/plugins/mcp-tools.md)

</div>

# Ferramentas MCP (Model Context Protocol)

As ferramentas MCP permitem que o HandsForBots integre funcionalidades externas e exiba conteúdo rico diretamente na conversa. Este sistema oferece suporte completo para exibição inline de conteúdo, permitindo uma experiência de usuário mais integrada.

## Visão Geral

O sistema MCP do HandsForBots permite:

- **Execução de Ferramentas**: Integração com APIs externas e processamento de dados
- **Exibição Inline**: Conteúdo exibido diretamente na janela de chat
- **Exibição Modal**: Conteúdo exibido em janelas popup tradicionais
- **Histórico Persistente**: Todo conteúdo fica salvo na conversa
- **Configuração Flexível**: Plugins podem escolher o modo de exibição

## Criando um Plugin MCP

### Estrutura Básica

```javascript
export default class MinhaFerramentaMCP {
    constructor(bot, options) {
        this.name = 'MinhaFerramenta'
        this.type = 'output'
        this.isMCPTool = true // Marca como ferramenta MCP
        
        this.bot = bot
        this.options = options
        
        // Configurar modo de exibição
        this.outputMode = options.outputMode || 'modal' // 'modal' | 'inline' | 'both'
        this.allowModeToggle = options.allowModeToggle || false
    }
}
```

### Definição da Ferramenta MCP

```javascript
getMCPToolDefinition() {
    return {
        name: 'minha_ferramenta',
        description: 'Descrição da funcionalidade da ferramenta',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Parâmetro de consulta',
                    enum: ['opcao1', 'opcao2'], // Se aplicável
                },
                outputMode: {
                    type: 'string',
                    enum: ['modal', 'inline'],
                    description: 'Como exibir o resultado: modal (popup) ou inline (no chat)',
                    default: this.outputMode
                }
            },
            required: ['query']
        },
        execute: async (params) => {
            const mode = params.outputMode || this.outputMode
            return await this.executeTool(params.query, mode)
        }
    }
}
```

### Implementação da Execução

```javascript
async executeTool(query, mode = 'modal') {
    try {
        // Processar a consulta
        const dados = await this.processarConsulta(query)
        
        if (mode === 'inline') {
            // Retornar conteúdo para exibição inline
            return this.gerarConteudoInline(dados)
        } else {
            // Comportamento modal tradicional
            this.abrirModal(dados)
            return {
                success: true,
                message: `Ferramenta executada: ${query}`
            }
        }
    } catch (error) {
        return {
            success: false,
            error: `Erro ao executar ferramenta: ${error.message}`
        }
    }
}
```

### Gerando Conteúdo Inline

```javascript
gerarConteudoInline(dados) {
    // Criar HTML estruturado
    const html = `
        <div class="minha-ferramenta-content">
            <h3 class="titulo">${dados.titulo}</h3>
            <div class="conteudo">
                ${dados.items.map(item => `
                    <div class="item">
                        <h4>${item.nome}</h4>
                        <p>${item.descricao}</p>
                        ${item.imagem ? `<img src="${item.imagem}" alt="${item.nome}">` : ''}
                    </div>
                `).join('')}
            </div>
            <div class="metadata">
                <small>Processado em ${new Date().toLocaleString()}</small>
            </div>
        </div>
    `
    
    return {
        type: 'inline_content',
        data: {
            text: `${dados.titulo} - ${dados.items.length} itens encontrados`,
            html: html,
            images: dados.items.map(item => item.imagem).filter(Boolean),
            title: dados.titulo
        }
    }
}
```

## Configuração de Plugins MCP

### No Bot Principal

```javascript
// Configurar plugin com modo inline
let mcpToolConfig = {
    plugin: 'MinhaFerramentaMCP',
    type: 'output',
    outputMode: 'inline',     // Modo padrão
    allowModeToggle: true     // Permitir alternar entre modos
}
bot_options.plugins.push(mcpToolConfig)
```

### Configuração Avançada

```javascript
let mcpToolConfig = {
    plugin: 'ImageGallery',
    type: 'output',
    outputMode: 'both',       // Suporta ambos os modos
    allowModeToggle: true,
    
    // Configurações específicas do plugin
    attributeType: 'data-image-gallery-id',
    responsive: true,
    
    // Configurações de layout inline
    inlineLayout: {
        columns: 'auto-fit',
        minWidth: '200px',
        gap: '15px'
    }
}
```

## Estilização CSS

### CSS Básico para Conteúdo Inline

```css
/* Estilos globais para ferramentas MCP inline */
.mcp_inline_content {
    background: #f9f9f9;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 15px;
    margin: 10px 0;
}

.mcp_inline_content h3 {
    margin: 0 0 15px 0;
    color: #333;
    border-bottom: 2px solid #007cba;
    padding-bottom: 8px;
}

/* Estilos específicos para sua ferramenta */
.mcp_inline_content .minha-ferramenta-content .item {
    margin: 10px 0;
    padding: 10px;
    background: white;
    border-radius: 4px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.mcp_inline_content .minha-ferramenta-content img {
    max-width: 100%;
    height: auto;
    border-radius: 4px;
    margin-top: 8px;
}
```

### CSS Responsivo

```css
/* Adaptação para dispositivos móveis */
@media (max-width: 768px) {
    .mcp_inline_content {
        padding: 10px;
        margin: 5px 0;
    }
    
    .mcp_inline_content .conteudo {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }
}

/* Adaptação para tablets */
@media (min-width: 769px) and (max-width: 1024px) {
    .mcp_inline_content .conteudo {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 15px;
    }
}

/* Desktop */
@media (min-width: 1025px) {
    .mcp_inline_content .conteudo {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 20px;
    }
}
```

## Exemplos Práticos

### Galeria de Imagens

```javascript
// Plugin de galeria que suporta modo inline
export default class ImageGalleryMCP {
    constructor(bot, options) {
        this.name = 'ImageGallery'
        this.type = 'output'
        this.isMCPTool = true
        this.outputMode = options.outputMode || 'modal'
        
        // Inicializar elementos da página
        this.elements = this.descobrirElementos()
    }
    
    gerarConteudoInline(queries, titulo) {
        const imagens = this.coletarImagens(queries)
        const textos = this.coletarTextos(queries)
        
        const html = `
            <div class="inline-gallery-content">
                <h3 class="inline-gallery-title">${titulo}</h3>
                <div class="inline-gallery-images">
                    ${imagens.map(img => `
                        <figure class="inline-gallery-image">
                            <img src="${img.src}" alt="${img.alt}">
                            <figcaption>${img.alt}</figcaption>
                        </figure>
                    `).join('')}
                </div>
                <div class="inline-gallery-text">
                    ${textos}
                </div>
            </div>
        `
        
        return {
            type: 'inline_content',
            data: {
                text: `Galeria: ${titulo}`,
                html: html,
                images: imagens.map(img => img.src),
                title: titulo
            }
        }
    }
}
```

### Ferramenta de Documentação

```javascript
export default class DocumentationMCP {
    async executeTool(topico, modo = 'inline') {
        const documentacao = await this.buscarDocumentacao(topico)
        
        if (modo === 'inline') {
            return {
                type: 'inline_content',
                data: {
                    text: `Documentação: ${documentacao.titulo}`,
                    html: `
                        <div class="doc-content">
                            <h3>${documentacao.titulo}</h3>
                            <div class="doc-meta">
                                <span class="doc-version">v${documentacao.versao}</span>
                                <span class="doc-updated">${documentacao.atualizado}</span>
                            </div>
                            <div class="doc-body">
                                ${documentacao.conteudo}
                            </div>
                            <div class="doc-examples">
                                <h4>Exemplos</h4>
                                ${documentacao.exemplos.map(ex => `
                                    <div class="example">
                                        <h5>${ex.titulo}</h5>
                                        <pre><code>${ex.codigo}</code></pre>
                                        <p>${ex.descricao}</p>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `
                }
            }
        }
    }
}
```

## Melhores Práticas

### 1. Performance
- Processe dados de forma assíncrona
- Limite o tamanho do HTML gerado
- Use lazy loading para imagens quando possível
- Implemente cache para consultas frequentes

### 2. Experiência do Usuário
- Forneça feedback visual durante processamento
- Use animações sutis para transições
- Mantenha consistência visual com o tema do chat
- Implemente estados de erro informativos

### 3. Responsividade
- Teste em diferentes tamanhos de tela
- Use CSS Grid/Flexbox para layouts flexíveis
- Otimize imagens para dispositivos móveis
- Considere limitações de largura de banda

### 4. Acessibilidade
- Use tags semânticas adequadas
- Forneça texto alternativo para imagens
- Mantenha contraste adequado de cores
- Suporte navegação por teclado

## Integração com Backend

### Enviando Dados para LLM

O sistema automaticamente envia resultados de ferramentas de volta para o LLM para processamento adicional:

```javascript
// O MCPHelper cuida automaticamente do feedback
async executeToolCalls(toolCalls, originalResponse) {
    // ... execução das ferramentas
    
    // Enviar resultados de volta para LLM
    if (toolResults.length > 0) {
        await this.sendToolResultsToLLM(toolResults)
    }
}
```

### Formato de Feedback

```javascript
const feedbackData = {
    tool: 'image_gallery',
    parameters: { query: 'wordpress', outputMode: 'inline' },
    result: {
        type: 'inline_content',
        data: { /* dados do conteúdo */ },
        success: true,
        timestamp: '2024-01-01T12:00:00Z'
    }
}
```

Esta documentação fornece uma base sólida para criar e integrar ferramentas MCP com suporte a conteúdo inline no HandsForBots.
