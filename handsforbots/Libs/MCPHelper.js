/**
 * MCP Helper - Centralized MCP (Model Context Protocol) management
 * Handles tool registration, prompt formatting, and tool execution
 */

export default class MCPHelper {

	/**
	 * MCP Helper constructor
	 * @param {Object} bot - Bot instance
	 */
	constructor(bot) {
		this.bot = bot
		this.tools = []
		this.models = []
		this.functions = []
		
		console.log('[✔︎] MCP Helper initialized.')
	}

	async processIfHasTools(response) {
		const toolCalls = this.extractToolCalls(response)
		if (toolCalls.length > 0) {
			return await this.executeToolCalls(toolCalls, response)
		}
		return response
	}

	/**
	 * Register a tool with the MCP system
	 * @param {Object} tool - Tool configuration
	 * @param {string} tool.name - Tool name
	 * @param {string} tool.description - Tool description
	 * @param {Object} tool.parameters - Tool parameters schema
	 * @param {Function} tool.execute - Tool execution function
	 */
	registerTool(tool) {
		if (!tool.name || !tool.description) {
			console.warn('MCP Tool must have name and description')
			return false
		}

		// Check if tool already exists
		const existingTool = this.tools.find(t => t.name === tool.name)
		if (existingTool) {
			console.warn(`MCP Tool ${tool.name} already registered, updating...`)
			const index = this.tools.indexOf(existingTool)
			this.tools[index] = tool
		} else {
			this.tools.push(tool)
		}

		console.log(`[✔︎] MCP Tool registered: ${tool.name}`)
		return true
	}

	/**
	 * Register a model with the MCP system
	 * @param {Object} model - Model configuration
	 */
	registerModel(model) {
		if (!model.name || !model.description) {
			console.warn('MCP Model must have name and description')
			return false
		}

		const existingModel = this.models.find(m => m.name === model.name)
		if (existingModel) {
			console.warn(`MCP Model ${model.name} already registered, updating...`)
			const index = this.models.indexOf(existingModel)
			this.models[index] = model
		} else {
			this.models.push(model)
		}

		console.log(`[✔︎] MCP Model registered: ${model.name}`)
		return true
	}

	/**
	 * Register a function with the MCP system
	 * @param {Object} func - Function configuration
	 */
	registerFunction(func) {
		if (!func.name || !func.description) {
			console.warn('MCP Function must have name and description')
			return false
		}

		const existingFunction = this.functions.find(f => f.name === func.name)
		if (existingFunction) {
			console.warn(`MCP Function ${func.name} already registered, updating...`)
			const index = this.functions.indexOf(existingFunction)
			this.functions[index] = func
		} else {
			this.functions.push(func)
		}

		console.log(`[✔︎] MCP Function registered: ${func.name}`)
		return true
	}

	/**
	 * Get all registered tools
	 * @return {Array} Array of tools
	 */
	getTools() {
		return this.tools
	}

	/**
	 * Get all registered models
	 * @return {Array} Array of models
	 */
	getModels() {
		return this.models
	}

	/**
	 * Get all registered functions
	 * @return {Array} Array of functions
	 */
	getFunctions() {
		return this.functions
	}

	/**
	 * Check if MCP has any registered items
	 * @return {boolean} True if MCP has items
	 */
	hasMCPItems() {
		return this.tools.length > 0 || this.models.length > 0 || this.functions.length > 0
	}

	/**
	 * Prepare MCP context for sending to backend
	 * @return {Object} MCP context object
	 */
	prepareContext() {
		const context = {}
		
		if (this.tools.length > 0) {
			context.tools = this.tools.map(tool => ({
				name: tool.name,
				description: tool.description,
				parameters: tool.parameters
			}))
		}
		
		if (this.models.length > 0) {
			context.available_models = this.models
		}
		
		if (this.functions.length > 0) {
			context.available_functions = this.functions
		}
		
		return context
	}

	/**
	 * Generate tool instructions for the prompt
	 * @return {string} Formatted tool instructions
	 */
	generateToolInstructions() {
		if (this.tools.length === 0) {
			return ''
		}

		let step = 1;

		let instructions = `### INSTRUÇÕES FUNDAMENTAIS

`
		if ( typeof this.bot.options.assistent_persona === 'string' ) {
			instructions += `**${step}. Sua persona e objetivo:**\n`
			step++;
			instructions += `Você é um assistente especialista em documentação técnica. Seu objetivo é responder às perguntas do usuário de forma clara, direta e útil. Você deve usar as ferramentas disponíveis para buscar informações precisas, mas o usuário NUNCA deve saber que uma ferramenta foi usada. Para o usuário, deve parecer que você já conhece a resposta. Aja como um especialista, não como um robô que apenas chama funções.\n`
		}

		instructions += `**${step}. O Processo de Trabalho (MUITO IMPORTANTE):**\n`
		step++;
		instructions += `Seu fluxo de trabalho tem duas etapas:
- **Etapa 1: Obter a Informação.** Quando a pergunta do usuário exigir informações da documentação, sua PRIMEIRA resposta deve ser APENAS a chamada da ferramenta no formato '<tool>'. Não escreva mais nada.
- **Etapa 2: Formular a Resposta.** Após a ferramenta ser executada, você receberá o resultado. Use esse resultado para construir uma resposta final, completa e amigável em linguagem natural para o usuário.
`

		instructions += `**${step}. Regra de Ouro: NUNCA Fale Sobre as Ferramentas:**\n`
		step++;
		instructions += `- **NÃO** diga "Vou usar a ferramenta para buscar...".
- **NÃO** diga "A ferramenta retornou a seguinte informação...".
- **NÃO** explique o que é a ferramenta selecionada.
- A interação deve ser 100% natural. A ferramenta é um mecanismo interno seu, invisível para o usuário.
`

		instructions += `---

### FERRAMENTAS DISPONÍVEIS
		
Você tem acesso à seguinte(s) ferramenta(s):
`

		this.tools.forEach(tool => {
			instructions += `🔧 ${tool.name}: ${tool.description}\n`

			if (tool.parameters && tool.parameters.properties) {
				instructions += `   Parâmetros:\n`
				Object.entries(tool.parameters.properties).forEach(([paramName, paramConfig]) => {
					instructions += `   - ${paramName}: ${paramConfig.description}`
					if (paramConfig.enum) {
						instructions += ` (opções válidas: ${paramConfig.enum.join(', ')})`
					}
					if (paramConfig.examples) {
						instructions += ` (exemplos: ${paramConfig.examples.join(', ')})`
					}
					instructions += `\n`
				})
			}
			instructions += `\n`
		})

		instructions += `---

### FORMATO DE RESPOSTA DA FERRAMENTA

Quando decidir usar uma ferramenta, sua resposta deve conter APENAS o bloco de código XML, sem nenhum texto antes ou depois.

<tool>
{
  "name": "nome_da_ferramenta",
  "parameters": {
    "parametro": "valor"
  }
}
</tool>

---

### EXEMPLO DE FLUXO COMPLETO (Siga este modelo):

**Exemplo 1:**

*   **O usuário pergunta:**
    'preciso entender melhor o processo do sql'

*   **Sua primeira resposta (para o sistema, para chamar a ferramenta):**
    <tool>
    {
      "name": "nome_da_ferramenta",
      "parameters": {
        "query": "criar-instancia-cloud-sql"
      }
    }
    </tool>
*   **(O sistema executa a ferramenta e te fornece o resultado. Por exemplo: "Para criar uma instância do Cloud SQL, acesse o console, vá para a seção SQL, clique em Criar Instância, escolha MySQL e defina um ID e senha.")**

*   **Sua resposta final (para o usuário, baseada no resultado da ferramenta):**
    Claro! Para criar uma instância do Cloud SQL, o processo geral envolve os seguintes passos:
    1. Acessar o console do Google Cloud e navegar até a seção "SQL".
    2. Clicar em "Criar Instância" e escolher o tipo de banco de dados que deseja, como o MySQL.
    3. Definir um ID para a instância e uma senha segura para o usuário administrador.

    Precisa de mais detalhes em alguma dessas etapas?

`
		
		// // Gerar exemplos dinâmicos baseados nas ferramentas disponíveis
		// this.tools.forEach((tool, index) => {
		// 	if (tool.parameters && tool.parameters.properties) {
		// 		const paramNames = Object.keys(tool.parameters.properties)
		// 		const exampleParams = {}
				
		// 		paramNames.forEach(paramName => {
		// 			const param = tool.parameters.properties[paramName]
		// 			if (param.enum && param.enum.length > 0) {
		// 				exampleParams[paramName] = param.enum[0]
		// 			} else if (param.examples && param.examples.length > 0) {
		// 				exampleParams[paramName] = param.examples[0]
		// 			} else {
		// 				// Valor padrão baseado no tipo
		// 				exampleParams[paramName] = param.type === 'string' ? 'exemplo' : 
		// 										  param.type === 'number' ? 1 : 
		// 										  param.type === 'boolean' ? true : 'valor'
		// 			}
		// 		})
				
		// 		instructions += `\n${index + 1}. Para ${tool.description.toLowerCase()}:`
		// 		instructions += `\nUsuário: "Use ${tool.name.replace(/_/g, ' ')}"`
		// 		instructions += `\nAssistente: <tool>`
		// 		instructions += `\n{`
		// 		instructions += `\n  "name": "${tool.name}",`
		// 		instructions += `\n  "parameters": {`
		// 		Object.entries(exampleParams).forEach(([key, value], i, arr) => {
		// 			const comma = i < arr.length - 1 ? ',' : ''
		// 			const formattedValue = typeof value === 'string' ? `"${value}"` : value
		// 			instructions += `\n    "${key}": ${formattedValue}${comma}`
		// 		})
		// 		instructions += `\n  }`
		// 		instructions += `\n}`
		// 		instructions += `\n</tool>`
		// 	}
		// })

		return instructions
	}

	/**
	 * Prepare prompt with MCP instructions
	 * @param {string} userMessage - User message
	 * @return {string} Formatted prompt
	 */
	preparePrompt(userMessage) {
		if (!this.hasMCPItems()) {
			return userMessage
		}

		const toolInstructions = this.generateToolInstructions()
		return `${toolInstructions}\n\nUsuário: ${userMessage}\n\nAssistente:`
	}

	/**
	 * Build contextual prompt with MCP instructions
	 * @param {*} userPrompt - User prompt
	 * @returns {string} Formatted prompt
	 */
	buildContextualPrompt(userPrompt) {
		let fullPrompt = '';
		
		if (this.bot.options.systemPrompt) {
			fullPrompt += `SYSTEM: ${this.bot.options.systemPrompt}\n\n`;
		}
		
		const mcpContext = this.prepareContext();
		// if (mcpContext && mcpContext.tools && mcpContext.tools.length > 0) {
		// 	fullPrompt += `FERRAMENTAS DISPONÍVEIS:\n`;
		// 	mcpContext.tools.forEach(tool => {
		// 		fullPrompt += `- ${tool.name}: ${tool.description}\n`;
		// 	});
		// 	fullPrompt += '\n';
		// }
		
		fullPrompt += `USER: ${userPrompt}`;
		
		return fullPrompt;
	}

	/**
	 * Extract tool calls from model response
	 * @param {string|Array} response - Model response (string or object)
	 * @return {Array} Array of tool calls
	 */
	extractToolCalls(response) {
		// Determinar se a resposta é string ou objeto
		if (typeof response === 'string') {
			return this.extractToolCallsFromString(response)
		} else if (Array.isArray(response)) {
			return this.extractToolCallsFromObject(response)
		} else {
			console.warn('MCPHelper: Tipo de resposta não suportado:', typeof response)
			return []
		}
	}

	/**
	 * Extract tool calls from string response
	 * @param {string} responseText - Model response text
	 * @return {Array} Array of tool calls
	 */
	extractToolCallsFromString(responseText) {
		const toolCalls = []

		// Obter nomes das ferramentas disponíveis para validação
		const availableToolNames = this.tools.map(t => t.name)
		
		// Regex para capturar diferentes formatos de chamada de ferramenta
		const toolRegexes = [
			// Formato padrão <tool>{...}</tool>
			{
				regex: /<tool>\s*(\{[\s\S]*?\})\s*<\/tool>/g,
				handler: (match) => {
					try {
						const toolCall = JSON.parse(match[1])
						return toolCall
					} catch (error) {
						console.error('Erro ao parsear JSON do formato <tool>:', error)
						return null
					}
				}
			},
			// Formato 🔧 FERRAMENTA: {...} - mais específico
			{
				regex: /🔧\s*([A-Z_]+):\s*(\{[\s\S]*?\})/g,
				handler: (match) => {
					try {
						const toolNameUpper = match[1]
						const toolParams = JSON.parse(match[2])
						
						// Verificar se é uma ferramenta válida
						if (!availableToolNames.includes(toolNameUpper)) {
							console.warn(`Ferramenta não reconhecida: ${toolNameUpper}`)
							return null
						}
						
						// Converter para formato padrão
						const toolName = toolNameUpper.toLowerCase().replace(/_/g, '-')
						
						return {
							name: toolName,
							parameters: toolParams
						}
					} catch (error) {
						console.error('Erro ao parsear formato 🔧:', error)
						return null
					}
				}
			}
		]
		
		for (const { regex, handler } of toolRegexes) {
			let match
			while ((match = regex.exec(responseText)) !== null) {
				const toolCall = handler(match)
				
				if (toolCall && toolCall.name && toolCall.parameters) {
					// Normalizar nome da ferramenta para comparação
					const normalizedName = toolCall.name.toLowerCase().replace(/_/g, '_')
					const availableNormalized = availableToolNames.map(name => name.toLowerCase().replace(/-/g, '_'))
					
					// Validar se a ferramenta existe (comparação normalizada)
					if (availableNormalized.includes(normalizedName)) {
						// Encontrar o nome original da ferramenta
						const originalName = availableToolNames.find(name => 
							name.toLowerCase().replace(/-/g, '_') === normalizedName
						)
						toolCall.name = originalName
						toolCalls.push(toolCall)
					} else {
						console.warn(`Ferramenta não encontrada: ${toolCall.name} (normalizada: ${normalizedName})`)
						console.warn(`Ferramentas disponíveis: ${availableToolNames.join(', ')}`)
					}
				}
			}
		}
		
		console.log('MCPHelper: Ferramentas disponíveis:', availableToolNames)
		console.log('MCPHelper: Tool calls extraídos (string):', toolCalls)
		
		return toolCalls
	}

	/**
	 * Extract tool calls from object response
	 * @param {Array} responseArray - Model response array
	 * @return {Array} Array of tool calls
	 */
	extractToolCallsFromObject(responseArray) {
		const toolCalls = []

		// Obter nomes das ferramentas disponíveis para validação
		const availableToolNames = this.tools.map(t => t.name)

		// Iterar sobre array de resposta
		for (const responseItem of responseArray) {
			// Verificar se o item tem tool_result e action: "execute_tool"
			if (responseItem.tool_result && 
				responseItem.tool_result.tool_name &&
				responseItem.tool_result.parameters) {

				const toolName = responseItem.tool_result.tool_name
				const parameters = responseItem.tool_result.parameters

				// Normalizar nome da ferramenta para comparação
				const normalizedName = toolName.toLowerCase().replace(/_/g, '_')
				const availableNormalized = availableToolNames.map(name => name.toLowerCase().replace(/-/g, '_'))
				
				// Validar se a ferramenta existe (comparação normalizada)
				if (availableNormalized.includes(normalizedName)) {
					// Encontrar o nome original da ferramenta
					const originalName = availableToolNames.find(name => 
						name.toLowerCase().replace(/-/g, '_') === normalizedName
					)
					toolCalls.push({
						name: originalName,
						parameters: parameters
					})
				} else {
					console.warn(`Ferramenta não encontrada: ${toolName} (normalizada: ${normalizedName})`)
					console.warn(`Ferramentas disponíveis: ${availableToolNames.join(', ')}`)
				}
			} else if ( responseItem.text.indexOf('<tool>') > -1 ) {
				toolCalls.push(...this.extractToolCallsFromString(responseItem.text))
			} else {
				console.warn('Ferramenta não encontrada: ', responseItem)
			}
		}
		
		console.log('MCPHelper: Ferramentas disponíveis:', availableToolNames)
		console.log('MCPHelper: Tool calls extraídos (object):', toolCalls)
		
		return toolCalls
	}

	/**
	 * Execute tool calls and return results
	 * @param {Array} toolCalls - Array of tool calls
	 * @param {string} originalResponse - Original model response
	 * @return {Object} Object containing messages and inline content
	 */
	async executeToolCalls(toolCalls, originalResponse) {
		const messages = []
		const inlineContent = []
		const toolResults = []

		for (const toolCall of toolCalls) {
			// Action policies (loop detector, project rules) may block or rewrite the call
			const verdict = await this.bot.actionGuard.evaluate({
				type: 'tool',
				name: toolCall.name,
				params: toolCall.parameters
			})
			if (!verdict.allowed) {
				toolResults.push({
					tool: toolCall.name,
					parameters: toolCall.parameters,
					result: {
						success: false,
						blocked: true,
						error: `Ferramenta ${toolCall.name} bloqueada: ${verdict.reason}`
					}
				})
				continue
			}
			toolCall.parameters = verdict.action.params

			try {
				// Find the tool in registered tools
				const tool = this.tools.find(t => t.name === toolCall.name)
				
				if (tool && tool.execute) {
					// Execute the tool
					const result = await tool.execute(toolCall.parameters)
					
					// Check if result contains inline content
					if (result && result.type === 'inline_content') {
						inlineContent.push({
							source: toolCall.name,
							data: result.data,
							parameters: toolCall.parameters
						})
					}
					
					// Store tool result for feedback
					toolResults.push({
						tool: toolCall.name.toLowerCase().replace(/-/g, '_'),
						parameters: toolCall.parameters,
						result: result
					})

				} else {
					// Try to find MCP plugin with executeTool method
					const mcpPlugin = this.findMCPPlugin(toolCall.name)
					
					if (mcpPlugin && mcpPlugin.executeTool) {
						// Execute the MCP plugin
						const result = await mcpPlugin.executeTool(toolCall.parameters.query || toolCall.parameters)
						
						// Check if result contains inline content
						if (result && result.type === 'inline_content') {
							inlineContent.push({
								source: toolCall.name,
								data: result.data,
								parameters: toolCall.parameters
							})
						}
						
						// Store tool result for feedback
						toolResults.push({
							tool: toolCall.name,
							parameters: toolCall.parameters,
							result: result
						})

					} else {
						const availableTools = this.tools.map(t => t.name).join(', ')
						const errorResult = {
							success: false,
							error: `Ferramenta ${toolCall.name} não encontrada ou não pode ser executada.`,
							availableTools: this.tools.map(t => t.name),
							suggestion: `Ferramentas disponíveis: ${availableTools}`
						}
						
						toolResults.push({
							tool: toolCall.name,
							parameters: toolCall.parameters,
							result: errorResult
						})
						
						messages.push({
							recipient_id: "user",
							text: `${errorResult.error} Ferramentas disponíveis: ${availableTools}`
						})
					}
				}
			} catch (error) {
				const errorResult = {
					success: false,
					error: `Erro ao executar ferramenta ${toolCall.name}: ${error.message}`,
					toolName: toolCall.name,
					parameters: toolCall.parameters,
					availableTools: this.tools.map(t => t.name)
				}
				
				toolResults.push({
					tool: toolCall.name,
					parameters: toolCall.parameters,
					result: errorResult
				})
				
				messages.push({
					recipient_id: "user",
					text: `${errorResult.error}. Ferramentas disponíveis: ${this.tools.map(t => t.name).join(', ')}`
				})
			}
		}

		// Send tool results back to LLM for feedback
		if (toolResults.length > 0) {
			await this.sendToolResultsToLLM(toolResults)
		}

		for (const message of originalResponse) {
			if ( message.text.length == 0 ) {
				continue
			}
			const cleanResponse = message.text.replace(/<tool>[\s\S]*?<\/tool>/g, '').trim()
			if (cleanResponse) {
				messages.push({
					recipient_id: "user",
					text: cleanResponse
				})
			}
		}
		
		return {
			messages,
			inlineContent
		}
	}

	/**
	 * Send tool results back to LLM for feedback
	 * @param {Array} toolResults - Array of tool execution results
	 */
	async sendToolResultsToLLM(toolResults) {
		try {
			// Format tool results for LLM feedback
			const feedbackPrompt = this.formatToolResultsForFeedback(toolResults)
			
			// Send feedback to LLM through bot's backend
			if (this.bot && this.bot.backend) {
				const feedbackResponse = await this.bot.backend.sendFeedback(feedbackPrompt)
				
				// Process feedback response if needed
				if (feedbackResponse) {
					console.log('LLM Feedback received:', feedbackResponse)

					// Trigger event for feedback processing
					this.bot.eventEmitter.trigger('mcp.tool_feedback_received', [feedbackResponse])
				}
			}
		} catch (error) {
			console.error('Erro ao enviar feedback para LLM:', error)
		}
	}

	/**
	 * Format tool results for LLM feedback
	 * @param {Array} toolResults - Array of tool execution results
	 * @return {string} Formatted feedback prompt
	 */
	formatToolResultsForFeedback(toolResults) {
		let feedbackPrompt = `FEEDBACK DAS FERRAMENTAS EXECUTADAS:

`

		// Incluir as últimas 3 mensagens do histórico para contexto
		if (this.bot && this.bot.history && this.bot.history.length > 0) {
			feedbackPrompt += `CONTEXTO - ÚLTIMAS 3 MENSAGENS:\n`
			
			// Pegar as últimas 3 mensagens do histórico
			const lastMessages = this.bot.history.slice(-3)
			
			lastMessages.forEach((historyItem, index) => {
				// Estrutura do histórico: [type, plugin, payload, title]
				const [type, plugin, payload, title] = historyItem
				
				// Formatar mensagem baseada no tipo
				if (type === 'input' && payload) {
					// Para input, o payload pode ser string ou objeto
					let content = ''
					if (typeof payload === 'string') {
						content = payload
					} else if (payload && typeof payload === 'object') {
						content = payload.text || payload.message || payload.content || JSON.stringify(payload)
					}
					
					if (content.trim()) {
						feedbackPrompt += `${index + 1}. USUÁRIO: ${content.trim()}\n`
					}
				} else if (type === 'output' && payload) {
					// Para output, o payload é uma string JSON que precisa ser parseada
					try {
						if (typeof payload === 'string') {
							const parsed = JSON.parse(payload)
							if (Array.isArray(parsed)) {
								// Se for array de mensagens
								parsed.forEach((msg, msgIndex) => {
									if (msg.text && msg.text.trim()) {
										feedbackPrompt += `${index + 1}.${msgIndex + 1}. ASSISTENTE: ${msg.text.trim()}\n`
									}
								})
							} else if (parsed.text && parsed.text.trim()) {
								// Se for objeto único
								feedbackPrompt += `${index + 1}. ASSISTENTE: ${parsed.text.trim()}\n`
							}
						} else if (payload.text) {
							feedbackPrompt += `${index + 1}. ASSISTENTE: ${payload.text}\n`
						}
					} catch (parseError) {
						// Se falhar no parsing, usar o payload como está
						console.warn('Error parsing output payload:', parseError, payload)
						if (typeof payload === 'string' && payload.trim()) {
							feedbackPrompt += `${index + 1}. ASSISTENTE: ${payload.trim()}\n`
						}
					}
				}
			})
			
			feedbackPrompt += `\n`
		}
		
		// Adicionar informações sobre ferramentas disponíveis
		feedbackPrompt += `FERRAMENTAS DISPONÍVEIS:\n`
		this.tools.forEach(tool => {
			feedbackPrompt += `- ${tool.name}: ${tool.description}\n`
			if (tool.parameters && tool.parameters.properties) {
				Object.keys(tool.parameters.properties).forEach(paramName => {
					const param = tool.parameters.properties[paramName]
					feedbackPrompt += `  - ${paramName}: ${param.description || 'No description'}`
					if (param.enum) {
						feedbackPrompt += ` (opções: ${param.enum.join(', ')})`
					}
					feedbackPrompt += `\n`
				})
			}
		})
		feedbackPrompt += `\n`

		// Adicionar informações sobre o contexto de execução
		feedbackPrompt += `CONTEXTO DE EXECUÇÃO:\n`
		feedbackPrompt += `- Timestamp: ${new Date().toISOString()}\n`
		feedbackPrompt += `- Total de ferramentas executadas: ${toolResults.length}\n`
		if (toolResults.length > 0) {
			const successCount = toolResults.filter(r => r.success).length
			const errorCount = toolResults.length - successCount
			feedbackPrompt += `- Ferramentas com sucesso: ${successCount}\n`
			feedbackPrompt += `- Ferramentas com erro: ${errorCount}\n`
		}
		feedbackPrompt += `\n`

		toolResults.forEach((toolResult, index) => {
			feedbackPrompt += `${index + 1}. Ferramenta: ${toolResult.tool}\n`
			feedbackPrompt += `   Status: ${toolResult.result.success ? '✅ Sucesso' : '❌ Erro'}\n`
			feedbackPrompt += `   Parâmetros: ${JSON.stringify(toolResult.parameters)}\n`
			feedbackPrompt += `   Resultado: ${JSON.stringify(toolResult.result, null, 2)}\n`
			if (toolResult.execution_type) {
				feedbackPrompt += `   Tipo de execução: ${toolResult.execution_type}\n`
			}
			feedbackPrompt += `\n`
		})

		feedbackPrompt += `INSTRUÇÕES PARA FEEDBACK:
		
1. ANÁLISE DO CONTEXTO:
   - Analise as últimas 3 mensagens para entender o fluxo da conversa
   - Identifique o que o usuário está tentando fazer
   - Entenda o estado atual da conversa

2. ANÁLISE DAS FERRAMENTAS:
   - Verifique se as ferramentas executaram com sucesso
   - Identifique erros de parâmetros ou execução
   - Sugira correções específicas baseadas nas opções disponíveis

3. RESPOSTA ESTRUTURADA:
   - Confirme que você entendeu o contexto
   - Explique o que aconteceu com as ferramentas (sucesso/erro)
   - Se houver erros, sugira soluções específicas
   - Continue a conversa de forma natural e útil
   - Seja direto e prático nas sugestões

4. FORMATO DE RESPOSTA:
   - Comece confirmando o entendimento do contexto
   - Analise os resultados das ferramentas
   - Forneça soluções ou continue a conversa
   - Mantenha o tom de assistente útil

Responda como assistente:`

		return feedbackPrompt
	}

	/**
	 * Get MCP statistics
	 * @return {Object} MCP statistics
	 */
	getStats() {
		return {
			tools: this.tools.length,
			models: this.models.length,
			functions: this.functions.length,
			hasItems: this.hasMCPItems()
		}
	}

	/**
	 * Clear all MCP registrations
	 */
	clear() {
		this.tools = []
		this.models = []
		this.functions = []
		console.log('[✔︎] MCP Helper cleared.')
	}

	/**
	 * Find MCP plugin by tool name
	 * @param {string} toolName - Tool name to find
	 * @return {Object|null} MCP plugin instance or null
	 */
	findMCPPlugin(toolName) {
		// Check if bot.outputs exists
		if (this.bot && this.bot.outputs) {
			// Iterate through all output plugins
			for (const pluginName in this.bot.outputs) {
				const plugin = this.bot.outputs[pluginName];
				
				// Check if the plugin is an MCP tool
				if (plugin && typeof plugin === 'object' && plugin.isMCPTool === true) {
					// Check if this plugin handles the requested tool
					if (plugin.name === toolName || plugin.toolName === toolName) {
						return plugin;
					}
				}
			}
		}
		
		return null;
	}
}
