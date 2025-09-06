import Bot from '../../../Bot.js'

import EventEmitter from '../../../Libs/EventEmitter.js'

/**
 * Image Gallery output channel.
 */
export default class ImageGallery {

	/**
	 * Image Gallery constructor.
	 * @return void
	 */
	constructor ( bot, options ) {

		this.name = 'ImageGallery'
		this.type = 'output'
		this.toolName = 'image_gallery'

        this.isMCPTool = true

		this.bot = bot
		this.emitter = new EventEmitter()

		this.options = options

		console.log('[✔︎] Bot\'s Image Gallery module connected.')

        // Initialize elements first
        this.elements = []
        this.imgElements = document.querySelectorAll('[data-image-gallery-id]')

        if (this.imgElements.length > 0) {
            this.elements = Array.from(this.imgElements).map(element => 
                element.getAttribute('data-image-gallery-id')
            )
        }

    }

	/**
	 * Get MCP Tool Definition for this plugin
	 * @return Object MCP tool definition
	 */
	getMCPToolDefinition() {
		if (this.elements.length === 0) {
			return null // No elements available, don't register tool
		}

		return {
			name: 'image_gallery',
			description: `Show a gallery of images, title and text relevants to the user's question. It's important to use this tool when the user asks for a specific section of the page. You can return a list of queries separated by commas, it's multiple choice. Available options (use exactly as is, do not add a path): ${this.elements.join(', ')}`,
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description: `The query to use to show the gallery and texts. You can return a list of queries separated by commas, it's multiple choice. Must be one of the available options (use exactly as is, do not add a path): ${this.elements.join(', ')}`,
						enum: this.elements,
						examples: this.elements.slice(0, 3) // Show first 3 examples
					},
					title: {
						type: 'string',
						description: `The title to use to show the gallery. Must be a concise title related to the gallery or the topic.`,
						examples: this.elements.slice(0, 3) // Show first 3 examples
					}
				},
				required: ['query', 'title']
			},
			execute: async (params) => {
				console.log('ImageGallery called with params:', params)
				return await this.executeTool(params.query, params.title)
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
        this.gelleryStyle()

        const modal = document.createElement('div')
        modal.classList.add('gallery-modal')
        modal.innerHTML = `
            <div class="gallery-modal-inner">
                <h2 id="gallery-modal-title">
                    Um título pra teste
                </h2>
                <div id="gallery-modal-images">
                    <figure class="gallery-modal-image"><img src="./assets/content/cicd_wordpress-na-google-cloud-platform-GCP-com-docker-cloud-run-e-cloud-storage/load-balancing-back-g.gif" alt="GIF de criação de Load Balancing na GCP"><figcaption>GIF de criação de Load Balancing na GCP</figcaption></figure>
                    <figure class="gallery-modal-image"><img src="./assets/content/cicd_wordpress-na-google-cloud-platform-GCP-com-docker-cloud-run-e-cloud-storage/load-balancing-back-g.gif" alt="GIF de criação de Load Balancing na GCP"><figcaption>GIF de criação de Load Balancing na GCP</figcaption></figure>
                    <figure class="gallery-modal-image"><img src="./assets/content/cicd_wordpress-na-google-cloud-platform-GCP-com-docker-cloud-run-e-cloud-storage/load-balancing-back-g.gif" alt="GIF de criação de Load Balancing na GCP"><figcaption>GIF de criação de Load Balancing na GCP</figcaption></figure>
                    <figure class="gallery-modal-image"><img src="./assets/content/cicd_wordpress-na-google-cloud-platform-GCP-com-docker-cloud-run-e-cloud-storage/load-balancing-back-g.gif" alt="GIF de criação de Load Balancing na GCP"><figcaption>GIF de criação de Load Balancing na GCP</figcaption></figure>
                </div>
                <div id="gallery-modal-text">
                    <p>Nam convallis ante sed aliquet aliquam. Nulla elit massa, facilisis eu luctus eu, euismod vitae libero. Cras eleifend ligula tellus, quis pulvinar ipsum elementum non. Etiam bibendum ornare ultrices. Aenean varius cursus vestibulum. Etiam lacinia cursus augue, in vestibulum purus rhoncus ac. Pellentesque gravida urna nec neque imperdiet tempus vitae eget lectus. Nullam orci purus, maximus quis porta ac, pellentesque eget mauris. Curabitur sed pharetra neque. Etiam sollicitudin faucibus turpis a eleifend. Vivamus condimentum euismod bibendum.</p>
                    <p>Vestibulum ut nisi ut dolor fermentum imperdiet. Duis eleifend libero dui, eget tempus mauris semper in. Mauris varius posuere nisl id pharetra. Morbi non arcu non augue maximus lacinia ac et lorem. Fusce in lorem est. Proin gravida lacus at sapien sodales, sed feugiat urna iaculis. Mauris facilisis tellus a sollicitudin iaculis. Donec elementum augue magna, et interdum ligula pretium a. Nunc feugiat posuere turpis, eget egestas eros lacinia fermentum.</p>
                    <p>Curabitur efficitur maximus efficitur. Donec tempus molestie fermentum. Nullam dui turpis, tincidunt at eleifend accumsan, suscipit a augue. Integer efficitur faucibus orci, et mollis magna mattis vitae. Donec vel nisl magna. Maecenas at justo fermentum, sagittis arcu ac, semper lorem. Proin venenatis nunc risus, vitae viverra est dapibus eu. Morbi tristique commodo sodales. Integer at viverra turpis.</p>
                </div>
            </div>
            <div id="gallery-modal-close"></div>
        `
        document.body.appendChild(modal)

        document.querySelector('#gallery-modal-close').addEventListener('click', () => {
            document.body.classList.remove('gallery-open')
        })

        const modalOverlay = document.createElement('div')
        modalOverlay.classList.add('gallery-modal-overlay')
        document.body.appendChild(modalOverlay)

        this.bot.eventEmitter.trigger( 'core.ui_loaded' )
	}

    /**
     * Executa a ferramenta image_gallery
     * @param {string} query - A query para encontrar o elemento
     * @param {string} title - O título da galeria
     * @return {Promise<Object>} Resultado da execução
     */
    async executeTool(query, title) {
        try {
            
            let queries = []
            if ( typeof query === 'string' ) {
                queries = query.split(',')
            } else if ( typeof query === 'object' ) {
                queries = query
            }
            queries = queries.map(query => query.trim())

            // Executar a galeria
            this.galleryModal(queries, title);

            return {
                success: true,
                message: `Successfully executed image_gallery: ${query}`,
                images: queries,
                title: title || query
            }
        } catch (error) {
            console.error(`Error executing image_gallery: ${error.message}`)
            return {
                success: false,
                error: `Error executing image_gallery: ${error.message}`
            }
        }
    }

    /**
     * Get images for a specific query
     * @param {string} query - The query to find images
     * @return {Array} Array of image URLs
     */
    getImagesForQuery(query) {
        const images = [];
        
        // Buscar elementos que correspondem à query
        this.imgElements.forEach(element => {
            const elementId = element.getAttribute('data-image-gallery-id');
            if (elementId === query) {
                const imgSrc = element.getAttribute('src') || element.getAttribute('data-src');
                if (imgSrc) {
                    images.push(imgSrc);
                }
            }
        });
        
        return images;
    }

    galleryModal ( queries, title ) {
        console.log('galleryModal called with:', { queries, title })

        let textSnippets = []
        let selectedSnippets = []
        for ( const query of queries ) {
            textSnippets = document.querySelectorAll(`[data-image-gallery-text-for*="${query}"]`)
            for ( const textSnippet of textSnippets ) {
                if ( selectedSnippets.includes(textSnippet) ) {
                    continue
                }
                selectedSnippets.push(textSnippet)
            }
        }

        const text = selectedSnippets.map((textSnippet) => {return textSnippet ? textSnippet.innerHTML : ''}).join('')

        document.querySelector('#gallery-modal-title').innerHTML = title
        document.querySelector('#gallery-modal-text').innerHTML = text

        document.querySelector('#gallery-modal-images').innerHTML = queries.map((query) => {
            const image = this.getImagesForQuery(query)
            const element = document.querySelector(`[data-image-gallery-id="${query}"]`)
            const alt = element ? element.getAttribute('alt') || '' : ''
            return image ? `<figure class="gallery-modal-image"><img src="${image}" alt="${alt}"><figcaption>${alt}</figcaption></figure>` : ''
        }).join('')

        setTimeout( () => { document.body.classList.add('gallery-open') }, 50)
    }

    gelleryStyle () {
        if (document.querySelector('#gallery-modal-style') != undefined) {
            return
        }
        const css = `
            .gallery-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                z-index: 990;

                pointer-events: none;
                opacity: 0;
                transition: 0.6s opacity;
            }
            .gallery-open .gallery-modal-overlay {
                pointer-events: all;
                opacity: 1;
            }
            .gallery-modal {
                position: fixed;
                top: 50%;
                left: 50%;
                width: 90%;
                max-width: 1140px;
                height: 90%;
                background-color: white;
                z-index: 995;
                border-radius: 2px;
                box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);

                transform: translate(-50%, -40%);
                pointer-events: none;
                opacity: 0;
                transition: 0.3s opacity, 0.3s transform;
            }
            .gallery-open .gallery-modal {
                transform: translate(-50%, -50%);
                pointer-events: all;
                opacity: 1;
            }
            .gallery-modal-inner {
                padding: 25px;
                overflow-x: hidden;
                overflow-y: auto;
                max-height: 100%;
            }
            #gallery-modal-close {
                position: absolute;
                top: 0;
                right: 0;
                transform: translate( 50%, -50% );
                cursor: pointer;
                z-index: 996;
                background-color: rgb(0, 100, 255);
                border-radius: 50%;
                width: 50px;
                height: 50px;
                box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
            }
            #gallery-modal-close:before,
            #gallery-modal-close:after {
                content: '';
                position: absolute;
                top: 50%;
                left: 45%;
                transform: translate( 50%, -50% ) rotate(45deg);
                transform-origin: 50% 50%;
                background-color: white;
                width: 2px;
                height: 20px;
                border-radius: 2px;
                transition: 0.3s background-color;
            }
            #gallery-modal-close:after {
                transform: translate( 50%, -50% ) rotate(-45deg);
            }
            #gallery-modal-title {
                margin-top: 0;
                color: rgb(0, 100, 255);
                font-size: 30px;
                font-weight: 400;
            }
            #gallery-modal-text {
                margin-top: 20px;
                font-size: 18px;
                color: #333;
                line-height: 1.5;
                font-family: Arial, sans-serif;
                text-align: justify;
                padding: 15px;
                background-color:#eee;
                border-radius: 5px;
            }
            #gallery-modal-text p:first-child {
                margin-top: 0;
            }
            #gallery-modal-text p:last-child {
                margin-bottom: 0;
            }
            #gallery-modal-images {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                justify-content: space-between;
            }
            #gallery-modal-images figure {
                border-radius: 3px;
                width: calc( 33.33% - 10px );
                margin: 0;
                margin-bottom: 10px;
                padding: 5px;
                background-color: #f3f3f3;
            }
            #gallery-modal-images figure img {
                border-radius: 2px;
                border: 1px solid silver;
                margin: 0;
            }
            #gallery-modal-images figure figcaption {
                font-size: 13px;
                font-weight: 400;
                color: #333;
                margin-top: 7px;
            }
        `
        const style = document.createElement('style')
        style.setAttribute('id', 'gallery-modal-style')
        style.innerHTML = css
        document.head.appendChild(style)
    }

	waiting () {}

}

