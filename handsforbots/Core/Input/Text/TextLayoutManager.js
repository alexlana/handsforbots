/**
 * TextLayoutManager - Manages UI layout configurations for Text Input plugin
 * 
 * Handles parsing, validation, and CSS generation for different layout options:
 * - position: 'sidebar' | 'main'
 * - display_mode: 'floating' | 'snap'
 * 
 * Ensures backward compatibility by defaulting to current behavior (sidebar + floating)
 */
export default class TextLayoutManager {
    
    /**
     * Constructor
     * @param {Object} bot - Bot instance
     * @param {Object} options - Plugin options containing ui_layout configuration
     */
    constructor(bot, options) {
        this.bot = bot
        this.options = options
        this.layout = this.parseLayoutOptions(options)
        
        // Validate layout configuration
        this.validateLayout()
    }
    
    /**
     * Parse layout options with proper defaults for backward compatibility
     * @param {Object} options - Plugin options
     * @returns {Object} Parsed layout configuration
     */
    parseLayoutOptions(options) {
        // Default layout maintains current behavior exactly
        const defaults = {
            position: 'sidebar',
            display_mode: 'floating',
            container: 'body'
        }
        
        // If no ui_layout specified, use defaults (current behavior)
        if (!options.ui_layout) {
            return defaults
        }
        
        // Merge provided options with defaults
        return {
            position: options.ui_layout.position || defaults.position,
            display_mode: options.ui_layout.display_mode || defaults.display_mode,
            container: options.ui_layout.container || defaults.container
        }
    }
    
    /**
     * Validate layout configuration
     * @throws {Error} If configuration is invalid
     */
    validateLayout() {
        const validPositions = ['sidebar', 'main']
        const validDisplayModes = ['floating', 'snap']
        
        if (!validPositions.includes(this.layout.position)) {
            throw new Error(`Invalid position "${this.layout.position}". Must be one of: ${validPositions.join(', ')}`)
        }
        
        if (!validDisplayModes.includes(this.layout.display_mode)) {
            throw new Error(`Invalid display_mode "${this.layout.display_mode}". Must be one of: ${validDisplayModes.join(', ')}`)
        }
        
        // Validate container is a valid CSS selector
        if (typeof this.layout.container !== 'string' || this.layout.container.length === 0) {
            throw new Error('Container must be a valid CSS selector string')
        }
    }
    
    /**
     * Check if current layout is the default (current behavior)
     * @returns {boolean} True if using default layout
     */
    isDefaultLayout() {
        return this.layout.position === 'sidebar' && 
               this.layout.display_mode === 'floating'
    }
    
    /**
     * Get CSS classes for the current layout
     * @returns {Array} Array of CSS class names
     */
    getLayoutClasses() {
        const classes = ['chat_box']
        
        // Add position-specific classes
        classes.push(`chat-position-${this.layout.position}`)
        
        // Add display mode classes
        classes.push(`chat-mode-${this.layout.display_mode}`)
        
        // Maintain backward compatibility with existing classes
        if (this.isDefaultLayout()) {
            classes.push('keyboard_active')
        }
        
        return classes
    }
    
    /**
     * Get layout-specific container element
     * @returns {Element} Container element for the chat
     */
    getContainer() {
        const container = document.querySelector(this.layout.container)
        
        if (!container) {
            console.warn(`Layout container "${this.layout.container}" not found, falling back to body`)
            return document.body
        }
        
        return container
    }
    
    /**
     * Get positioning styles for the chat window
     * @returns {Object} CSS style properties
     */
    getPositioningStyles() {
        const { position, display_mode } = this.layout
        
        if (position === 'sidebar') {
            if (display_mode === 'floating') {
                // Current default behavior - exact positioning
                return {
                    position: 'fixed',
                    bottom: '10px',
                    right: '20px',
                    width: '300px',
                    maxWidth: 'calc(100% - 40px)'
                }
            } else { // snap
                return {
                    position: 'absolute',
                    top: '20px',
                    right: '20px',
                    width: '300px',
                    maxWidth: 'calc(100% - 40px)'
                }
            }
        } else { // main
            if (display_mode === 'floating') {
                return {
                    position: 'fixed',
                    bottom: '20px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '90%',
                    maxWidth: '800px'
                }
            } else { // snap
                return {
                    position: 'relative',
                    margin: '20px auto',
                    width: '100%',
                    maxWidth: '800px'
                }
            }
        }
    }
    
    /**
     * Get visual styling properties
     * @returns {Object} CSS style properties for visual appearance
     */
    getVisualStyles() {
        const { display_mode } = this.layout
        
        if (display_mode === 'floating') {
            // Current default behavior - exact styling
            return {
                padding: '18px 20px',
                background: 'white',
                borderRadius: '40px',
                boxShadow: '0 3px 8px rgba(0,0,0,0.3)',
                zIndex: '1000'
            }
        } else { // snap
            return {
                padding: '18px 20px',
                background: 'white',
                border: '1px solid #e0e0e0',
                borderRadius: '10px',
                boxShadow: 'none',
                zIndex: '100'
            }
        }
    }
    
    /**
     * Get complete inline styles object
     * @returns {Object} Complete CSS styles for the layout
     */
    getInlineStyles() {
        return {
            ...this.getPositioningStyles(),
            ...this.getVisualStyles()
        }
    }
    
    /**
     * Apply styles to an element
     * @param {Element} element - Element to apply styles to
     */
    applyStylesToElement(element) {
        const styles = this.getInlineStyles()
        
        Object.keys(styles).forEach(property => {
            element.style[property] = styles[property]
        })
    }
    
    /**
     * Log layout information for debugging
     */
    logLayoutInfo() {
        console.log('[TextLayoutManager] Layout configuration:', {
            position: this.layout.position,
            display_mode: this.layout.display_mode,
            container: this.layout.container,
            isDefault: this.isDefaultLayout(),
            classes: this.getLayoutClasses()
        })
    }
}
