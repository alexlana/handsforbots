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

            this.bot.mcp.availableTools.push({
                name: 'show_relevant_content',
                description: `Show content relevant to the user's question. Available options: ${this.elements.join(', ')}`,
                parameters: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: `The query to use to find the element. Available options: ${this.elements.join(', ')}`,
                            enum: this.elements
                        }
                    },
                    required: ['query']
                },
                execute: async (params) => {
                    console.log(params)
                    return await this.executeShowRelevantContent(params.query)
                }
            })
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

    // async scrollTo ( payload ) {
    //     const element = document.querySelector( `[${payload.attribute}="${payload.value}"]` )
    //     if ( element ) {
    //         element.scrollIntoView({ behavior: 'smooth' })
    //     }
    // }

    /**
     * Executa a ferramenta show_relevant_content
     * @param {string} query - A query para encontrar o elemento
     * @return {Promise<Object>} Resultado da execução
     */
    async executeShowRelevantContent(query) {
        try {
            // Verificar se a query está nas opções disponíveis
            if (!this.elements.includes(query)) {
                return {
                    success: false,
                    error: `Query "${query}" not found. Available options: ${this.elements.join(', ')}`
                }
            }

            // Buscar o elemento no DOM
            const element = document.querySelector(`[${this.options.attributeType}="${query}"]`)
            
            if (element) {
                // Fazer scroll para o elemento
                element.scrollIntoView({ behavior: 'smooth' })
                
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

