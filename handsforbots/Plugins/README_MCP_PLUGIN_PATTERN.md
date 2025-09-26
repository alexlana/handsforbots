# Padrão para Plugins MCP

Este documento descreve o padrão padronizado para criar plugins MCP no sistema HandsForBots.

## Visão Geral

O registro de ferramentas MCP foi centralizado no `Bot.js` para simplificar o desenvolvimento de novos plugins. Os plugins precisam apenas definir suas ferramentas seguindo um padrão específico, e o Bot se encarrega do registro automático.

## Estrutura do Plugin MCP

### 1. Propriedades Obrigatórias

Todo plugin MCP deve ter as seguintes propriedades:

```javascript
class MyMCPPlugin {
    constructor(bot, options) {
        this.name = 'MyPluginName'
        this.type = 'output' // ou 'input'
        this.isMCPTool = true // Marca o plugin como MCP Tool
        
        this.bot = bot
        this.options = options
        
        // ... inicialização do plugin
    }
}
```

### 2. Métodos de Definição MCP

O plugin pode implementar um ou mais métodos de definição para diferentes tipos de recursos MCP:

#### 2.1. getMCPToolDefinition() - Para Ferramentas

```javascript
getMCPToolDefinition() {
    // Verificar se o plugin está pronto para registrar a ferramenta
    if (!this.isReady()) {
        return null // Retorna null se não deve registrar a ferramenta
    }

    return {
        name: 'my_tool_name',
        description: 'Descrição clara do que a ferramenta faz',
        parameters: {
            type: 'object',
            properties: {
                param1: {
                    type: 'string',
                    description: 'Descrição do parâmetro',
                    enum: ['option1', 'option2'], // opcional: valores permitidos
                    examples: ['exemplo1', 'exemplo2'] // opcional: exemplos
                },
                param2: {
                    type: 'string',
                    description: 'Outro parâmetro'
                }
            },
            required: ['param1'] // parâmetros obrigatórios
        },
        execute: async (params) => {
            console.log('Ferramenta executada com params:', params)
            return await this.executeTool(params)
        }
    }
}
```

#### 2.2. getMCPModelDefinition() - Para Modelos

```javascript
getMCPModelDefinition() {
    // Verificar se o plugin deve registrar um modelo
    if (!this.hasModelCapability()) {
        return null
    }

    return {
        name: 'my_model_name',
        description: 'Descrição do modelo e suas capacidades',
        version: '1.0.0', // opcional: versão do modelo
        capabilities: ['text-generation', 'completion'], // opcional: capacidades
        parameters: {
            maxTokens: 4096,
            temperature: 0.7,
            // outros parâmetros específicos do modelo
        },
        // Métodos específicos do modelo podem ser incluídos aqui
    }
}
```

#### 2.3. getMCPFunctionDefinition() - Para Funções

```javascript
getMCPFunctionDefinition() {
    // Verificar se o plugin deve registrar uma função
    if (!this.hasFunctionCapability()) {
        return null
    }

    return {
        name: 'my_function_name',
        description: 'Descrição da função e seu propósito',
        parameters: {
            type: 'object',
            properties: {
                input: {
                    type: 'string',
                    description: 'Entrada para a função'
                }
            },
            required: ['input']
        },
        returns: {
            type: 'object',
            description: 'Descrição do que a função retorna'
        },
        execute: async (params) => {
            return await this.executeFunction(params)
        }
    }
}
```

### 3. Método executeTool()

Implemente o método que será executado quando a ferramenta for chamada:

```javascript
async executeTool(params) {
    try {
        // Validar parâmetros
        if (!this.validateParams(params)) {
            return {
                success: false,
                error: 'Parâmetros inválidos',
                availableOptions: this.getAvailableOptions()
            }
        }
        
        // Executar a lógica da ferramenta
        const result = await this.performAction(params)
        
        return {
            success: true,
            message: 'Ferramenta executada com sucesso',
            data: result
        }
    } catch (error) {
        return {
            success: false,
            error: `Erro ao executar ferramenta: ${error.message}`
        }
    }
}
```

## Registro Automático

O `Bot.js` automaticamente:

1. Inicializa o `MCPHelper` no constructor (sempre disponível)
2. Durante o carregamento de plugins, detecta aqueles com `isMCPTool = true`
3. Chama `getMCPToolDefinition()`, `getMCPModelDefinition()` e `getMCPFunctionDefinition()` para cada plugin MCP
4. Valida cada definição usando métodos específicos de validação
5. Registra tools, models e functions diretamente no `MCPHelper` 
6. Exibe logs detalhados de sucesso, avisos ou erros para cada tipo de recurso

## Exemplo Completo

```javascript
import Bot from '../../../Bot.js'
import EventEmitter from '../../../Libs/EventEmitter.js'

export default class ExampleMCPPlugin {
    constructor(bot, options) {
        this.name = 'ExampleMCPPlugin'
        this.type = 'output'
        this.isMCPTool = true
        
        this.bot = bot
        this.emitter = new EventEmitter()
        this.options = options
        
        // Inicializar dados do plugin
        this.availableActions = this.initializeActions()
        this.hasModelSupport = this.checkModelSupport()
        this.hasFunctionSupport = this.checkFunctionSupport()
        
        console.log('[✔︎] Example MCP Plugin connected.')
    }
    
    initializeActions() {
        // Lógica de inicialização específica do plugin
        return ['action1', 'action2', 'action3']
    }
    
    checkModelSupport() {
        // Verificar se plugin tem capacidade de modelo
        return this.options.enableModel === true
    }
    
    checkFunctionSupport() {
        // Verificar se plugin tem capacidade de função
        return this.options.enableFunction === true
    }
    
    // ===== MCP TOOL DEFINITION =====
    getMCPToolDefinition() {
        if (this.availableActions.length === 0) {
            return null // Não registrar se não há ações disponíveis
        }
        
        return {
            name: 'example_tool',
            description: `Execute actions on the page. Available actions: ${this.availableActions.join(', ')}`,
            parameters: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        description: `The action to execute. Must be one of: ${this.availableActions.join(', ')}`,
                        enum: this.availableActions,
                        examples: this.availableActions.slice(0, 2)
                    },
                    params: {
                        type: 'object',
                        description: 'Additional parameters for the action'
                    }
                },
                required: ['action']
            },
            execute: async (params) => {
                return await this.executeTool(params.action, params.params)
            }
        }
    }
    
    // ===== MCP MODEL DEFINITION =====
    getMCPModelDefinition() {
        if (!this.hasModelSupport) {
            return null
        }
        
        return {
            name: 'example_model',
            description: 'Example model for demonstration purposes',
            version: '1.0.0',
            capabilities: ['text-processing', 'action-execution'],
            parameters: {
                maxTokens: 2048,
                temperature: 0.7,
                supportedActions: this.availableActions
            }
        }
    }
    
    // ===== MCP FUNCTION DEFINITION =====
    getMCPFunctionDefinition() {
        if (!this.hasFunctionSupport) {
            return null
        }
        
        return {
            name: 'example_function',
            description: 'Process input and return formatted result',
            parameters: {
                type: 'object',
                properties: {
                    input: {
                        type: 'string',
                        description: 'Input text to process'
                    },
                    format: {
                        type: 'string',
                        description: 'Output format',
                        enum: ['json', 'text', 'html'],
                        default: 'json'
                    }
                },
                required: ['input']
            },
            returns: {
                type: 'object',
                description: 'Processed result with metadata'
            },
            execute: async (params) => {
                return await this.executeFunction(params)
            }
        }
    }
    
    // ===== EXECUTION METHODS =====
    async executeTool(action, params = {}) {
        try {
            if (!this.availableActions.includes(action)) {
                return {
                    success: false,
                    error: `Action "${action}" not available`,
                    availableActions: this.availableActions
                }
            }
            
            const result = await this.performAction(action, params)
            
            return {
                success: true,
                message: `Successfully executed action: ${action}`,
                result: result
            }
        } catch (error) {
            return {
                success: false,
                error: `Error executing action: ${error.message}`
            }
        }
    }
    
    async executeFunction(params) {
        try {
            const { input, format = 'json' } = params
            
            // Processar entrada
            const processed = await this.processInput(input)
            
            // Formatar saída
            const formatted = this.formatOutput(processed, format)
            
            return {
                success: true,
                input: input,
                output: formatted,
                format: format,
                timestamp: new Date().toISOString()
            }
        } catch (error) {
            return {
                success: false,
                error: `Error executing function: ${error.message}`
            }
        }
    }
    
    async performAction(action, params) {
        // Implementar a lógica específica da ação
        switch (action) {
            case 'action1':
                return this.doAction1(params)
            case 'action2':
                return this.doAction2(params)
            case 'action3':
                return this.doAction3(params)
            default:
                throw new Error(`Unknown action: ${action}`)
        }
    }
    
    async processInput(input) {
        // Lógica de processamento de entrada
        return input.toUpperCase().trim()
    }
    
    formatOutput(processed, format) {
        switch (format) {
            case 'json':
                return { processed: processed }
            case 'text':
                return processed
            case 'html':
                return `<span>${processed}</span>`
            default:
                return processed
        }
    }
    
    // Implementações específicas das ações
    async doAction1(params) {
        return { action: 'action1', params, result: 'Action 1 executed' }
    }
    
    async doAction2(params) {
        return { action: 'action2', params, result: 'Action 2 executed' }
    }
    
    async doAction3(params) {
        return { action: 'action3', params, result: 'Action 3 executed' }
    }
    
    // Métodos obrigatórios do plugin
    async output(payload) {}
    async ui(options) {}
    waiting() {}
}
```

## Benefícios do Novo Padrão

1. **Simplificação**: Plugins focam apenas na lógica de negócio
2. **Consistência**: Padrão uniforme para todos os tipos de recursos MCP (tools, models, functions)
3. **Manutenibilidade**: Registro centralizado facilita manutenção e debugging
4. **Validação**: Validação automática de todas as definições com logs detalhados
5. **Flexibilidade**: Plugins podem registrar qualquer combinação de recursos MCP
6. **Escalabilidade**: Sistema preparado para novos tipos de recursos MCP
7. **Otimização**: Uso eficiente dos métodos do MCPHelper para todos os tipos
8. **Logs Inteligentes**: Sistema de logging específico para cada tipo de recurso

## Fluxo de Registro Simplificado

```
Bot Constructor
    ↓
MCPHelper inicializado (sempre disponível)
    ↓
Plugin Loading (isMCPTool = true)
    ↓
Bot.registerPluginMCPItems()
    ↓
├── registerPluginMCPTool() → MCPHelper.registerTool()
├── registerPluginMCPModel() → MCPHelper.registerModel()
└── registerPluginMCPFunction() → MCPHelper.registerFunction()
    ↓
Recursos MCP imediatamente disponíveis
```

## Migração de Plugins Existentes

Para migrar um plugin existente:

1. **Remover lógica de registro manual**:
   - `this.bot.mcp.availableTools.push()`
   - `this.bot.mcp.availableModels.push()`
   - `this.bot.mcp.availableFunctions.push()`
   - `this.bot.mcpHelper.registerTool()` (se usado diretamente)

2. **Implementar métodos de definição conforme necessário**:
   - `getMCPToolDefinition()` para ferramentas
   - `getMCPModelDefinition()` para modelos
   - `getMCPFunctionDefinition()` para funções

3. **Garantir configuração MCP**:
   - `this.isMCPTool = true`
   - Mover lógica de execução para métodos apropriados

4. **Testar e validar**:
   - Verificar logs de registro no console
   - Confirmar que recursos estão disponíveis via MCPHelper

**Benefício da Simplificação**: Com o MCPHelper sempre disponível desde o constructor, não há mais necessidade de lógica condicional ou registro legacy - tudo é direto e imediato!
