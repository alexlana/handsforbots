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

		let instructions = `INSTRUÇÕES IMPORTANTES:

Você tem acesso às seguintes ferramentas que pode usar quando necessário:

`
		
		this.tools.forEach(tool => {
			instructions += `🔧 ${tool.name.toUpperCase()}: ${tool.description}\n`
			
			if (tool.parameters && tool.parameters.properties) {
				instructions += `   Parâmetros:\n`
				Object.entries(tool.parameters.properties).forEach(([paramName, paramConfig]) => {
					instructions += `   - ${paramName}: ${paramConfig.description}`
					if (paramConfig.enum) {
						instructions += ` (opções: ${paramConfig.enum.join(', ')})`
					}
					instructions += `\n`
				})
			}
			instructions += `\n`
		})
		
		instructions += `FORMATO DE RESPOSTA:

Quando você quiser usar uma ferramenta, responda EXATAMENTE neste formato:

<tool>
{
  "name": "nome_da_ferramenta",
  "parameters": {
    "parametro1": "valor1",
    "parametro2": "valor2"
  }
}
</tool>

Depois de usar a ferramenta, continue sua resposta normalmente.

Se não precisar usar ferramentas, responda diretamente ao usuário.

EXEMPLO:
Usuário: "Mostre a seção sobre Docker"
Assistente: <tool>
{
  "name": "show_relevant_content",
  "parameters": {
    "query": "docker"
  }
}
</tool>

Agora vou mostrar a seção sobre Docker para você...`

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
	 * Extract tool calls from model response
	 * @param {string} responseText - Model response text
	 * @return {Array} Array of tool calls
	 */
	extractToolCalls(responseText) {
		const toolCalls = []
		const toolRegex = /<tool>\s*(\{[\s\S]*?\})\s*<\/tool>/g
		let match
		
		while ((match = toolRegex.exec(responseText)) !== null) {
			try {
				const toolCall = JSON.parse(match[1])
				toolCalls.push(toolCall)
			} catch (error) {
				console.error('Erro ao parsear chamada de ferramenta:', error)
			}
		}
		
		return toolCalls
	}

	/**
	 * Execute tool calls and return results
	 * @param {Array} toolCalls - Array of tool calls
	 * @param {string} originalResponse - Original model response
	 * @return {Array} Array of formatted messages
	 */
	async executeToolCalls(toolCalls, originalResponse) {
		const messages = []
		const toolResults = []

		for (const toolCall of toolCalls) {
			try {
				// Find the tool
				const tool = this.tools.find(t => t.name === toolCall.name)
				
				if (tool && tool.execute) {
					// Execute the tool
					const result = await tool.execute(toolCall.parameters)
					
					// Store tool result for feedback
					toolResults.push({
						tool: toolCall.name,
						parameters: toolCall.parameters,
						result: result
					})
					
					// Add result to response
					messages.push({
						recipient_id: "user",
						text: `Executando ${toolCall.name}...`,
						tool_result: result
					})
				} else {
					const errorResult = {
						success: false,
						error: `Ferramenta ${toolCall.name} não encontrada ou não pode ser executada.`
					}
					
					toolResults.push({
						tool: toolCall.name,
						parameters: toolCall.parameters,
						result: errorResult
					})
					
					messages.push({
						recipient_id: "user",
						text: errorResult.error
					})
				}
			} catch (error) {
				const errorResult = {
					success: false,
					error: `Erro ao executar ferramenta ${toolCall.name}: ${error.message}`
				}
				
				toolResults.push({
					tool: toolCall.name,
					parameters: toolCall.parameters,
					result: errorResult
				})
				
				messages.push({
					recipient_id: "user",
					text: errorResult.error
				})
			}
		}
		
		// Send tool results back to LLM for feedback
		if (toolResults.length > 0) {
			await this.sendToolResultsToLLM(toolResults)
		}
		
		// Add original model response (without tool tags)
		const cleanResponse = originalResponse.replace(/<tool>[\s\S]*?<\/tool>/g, '').trim()
		if (cleanResponse) {
			messages.push({
				recipient_id: "user",
				text: cleanResponse
			})
		}
		
		return messages
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
		
		toolResults.forEach((toolResult, index) => {
			feedbackPrompt += `${index + 1}. Ferramenta: ${toolResult.tool}\n`
			feedbackPrompt += `   Parâmetros: ${JSON.stringify(toolResult.parameters)}\n`
			feedbackPrompt += `   Resultado: ${JSON.stringify(toolResult.result, null, 2)}\n\n`
		})
		
		feedbackPrompt += `INSTRUÇÕES:
- Analise os resultados das ferramentas executadas
- Se alguma ferramenta falhou, explique o problema
- Se necessário, sugira correções ou alternativas
- Continue a conversa baseado nos resultados obtidos
- Seja útil e direto ao ponto

Responda como assistente:`

		return feedbackPrompt
	}

	/**
	 * Process model response and handle tool calls with feedback loop
	 * @param {string} responseText - Model response
	 * @return {Array|string} Processed response
	 */
	async processResponse(responseText) {
		const toolCalls = this.extractToolCalls(responseText)
		
		if (toolCalls.length > 0) {
			return await this.executeToolCalls(toolCalls, responseText)
		}
		
		// Return simple response if no tools
		return [{
			recipient_id: "user",
			text: responseText
		}]
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
}
