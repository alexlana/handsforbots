import Bot from '../../../Bot.js'

import EventEmitter from '../../../Libs/EventEmitter.js'

/**
 * Text input channel.
 */
export default class ShowRelevantContent {

	/**
	 * Text input constructor.
	 * @return void
	 */
	constructor ( bot, options ) {

		this.name = 'ShowRelevantContent'
		this.type = 'output'

        this.isMCPTool = true

		this.bot = bot
		this.emitter = new EventEmitter()

		this.options = options

		console.log('[✔︎] Bot\'s Show Relevant Content module connected.')

        this.elements = []
        if ( typeof options.attributeType === 'string' ) {
            let parent = options.parent || null
            let attributeType = options.attributeType
            let nodeList
            if (parent && typeof parent === 'string') {
                const parentElement = document.querySelector(parent)
                if (parentElement) {
                    nodeList = parentElement.querySelectorAll(`[${attributeType}]`)
                } else {
                    nodeList = []
                }
            } else {
                nodeList = document.querySelectorAll(`[${attributeType}]`)
            }
            this.elements = Array.from(nodeList).map(el => el.getAttribute(attributeType))
        }
	}

	/**
	 * Get MCP Tool Definition for this plugin
	 * @return Object MCP tool definition
	 */
	getMCPToolDefinition() {
		if (this.elements.length === 0 || !this.options.attributeType) {
			return null // No elements available or no attribute type configured, don't register tool
		}

		return {
			name: 'show_relevant_content',
			description: `Show content relevant to the user's question. It's important to use this tool when the user asks for a specific section of the page. Available options/enums (use exactly as is, do change any character): ${this.elements.join(', ')}`,
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description: `The query to use to find the element. Must be one of the available options/enums (use exactly as is, do change any character): ${this.elements.join(', ')}`,
						enum: this.elements,
						examples: this.elements.slice(0, 3) // Show first 3 examples
					}
				},
				required: ['query']
			},
			execute: async (params) => {
				console.log('ShowRelevantContent called with params:', params)
				return await this.executeTool(params.query)
			}
		}
	}

	/**
	 * Output payload.
	 * @param  String payload Text from bot to user.
	 * @return Void
	 */
	async output ( payload ) {}

	/**
	 * Create UI for user input on front end.
	 * @return Void
	 */
	async ui ( options ) {
		const css = ` `
		const style = document.createElement( 'STYLE' )
		style.setAttribute( 'id', 'scroll_to_css' )
		style.innerHTML = css
		document.querySelector( 'head' ).append( style )

		this.bot.eventEmitter.trigger( 'core.ui_loaded' )
	}

    /**
     * Executa a ferramenta show_relevant_content
     * @param {string} query - A query para encontrar o elemento
     * @return {Promise<Object>} Resultado da execução
     */
    async executeTool(query) {
        try {
            // Verificar se a query está nas opções disponíveis
            if (!this.elements.includes(query)) {
                return {
                    success: false,
                    error: `Query "${query}" not found. Available options: ${this.elements.join(', ')}`,
                    availableOptions: this.elements,
                    suggestion: `Please use one of the available options: ${this.elements.join(', ')}`
                }
            }

            // Buscar o elemento no DOM
            const element = document.querySelector(`[${this.options.attributeType}="${query}"]`)

            if (element) {
                // Fazer scroll para o elemento com duração controlada de 2 segundos
                await this.smoothScrollToElement(element, 2000)
                
                // Opcional: destacar o elemento temporariamente
                this.highlightElement(element)

                return {
                    success: true,
                    message: `Successfully scrolled to content: ${query}`,
                    element: {
                        tagName: element.tagName,
                        textContent: element.textContent.substring(0, 100) + '...',
                        attributes: Array.from(element.attributes).map(attr => ({
                            name: attr.name,
                            value: attr.value
                        }))
                    }
                }
            } else {
                return {
                    success: false,
                    error: `Element with ${this.options.attributeType}="${query}" not found in DOM`
                }
            }
        } catch (error) {
            return {
                success: false,
                error: `Error executing show_relevant_content: ${error.message}`
            }
        }
    }

    /**
     * Faz scroll suave para um elemento com duração controlada
     * @param {Element} element - Elemento para onde fazer scroll
     * @param {number} duration - Duração do scroll em milissegundos
     * @return {Promise} Promise que resolve quando o scroll termina
     */
    smoothScrollToElement(element, duration = 2000) {
        return new Promise((resolve) => {
            const startPosition = window.pageYOffset
            const targetPosition = element.offsetTop - 100 // 100px de margem do topo
            const distance = targetPosition - startPosition
            let startTime = null

            function animation(currentTime) {
                if (startTime === null) startTime = currentTime
                const timeElapsed = currentTime - startTime
                const progress = Math.min(timeElapsed / duration, 1)
                
                // Função de easing para movimento mais suave
                const easeInOutCubic = t => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1
                const easedProgress = easeInOutCubic(progress)
                
                window.scrollTo(0, startPosition + distance * easedProgress)
                
                if (timeElapsed < duration) {
                    requestAnimationFrame(animation)
                } else {
                    resolve()
                }
            }
            
            requestAnimationFrame(animation)
        })
    }

    /**
     * Destaca temporariamente um elemento
     * @param {Element} element - Elemento a ser destacado
     */
    highlightElement(element) {
        const originalBackground = element.style.backgroundColor
        const originalTransition = element.style.transition
        
        element.style.transition = 'background-color 0.3s ease'
        element.style.backgroundColor = '#ffff99'
        
        setTimeout(() => {
            element.style.backgroundColor = originalBackground
            element.style.transition = originalTransition
        }, 2000)
    }

	waiting () {}

}

