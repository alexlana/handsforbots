##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; docs' home](../README.md) / [plugins](./plugins.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](../../pt-br/plugins/mcp-tools.md)
[![en-US](https://img.shields.io/badge/en-US-white)](./mcp-tools.md)

</div>

# MCP Tools (Model Context Protocol)

MCP tools enable HandsForBots to integrate external functionalities and display rich content directly within conversations. This system provides complete support for inline content display, allowing for a more integrated user experience.

## Overview

The HandsForBots MCP system enables:

- **Tool Execution**: Integration with external APIs and data processing
- **Inline Display**: Content displayed directly within the chat window
- **Modal Display**: Content displayed in traditional popup windows
- **Persistent History**: All content is saved in the conversation
- **Flexible Configuration**: Plugins can choose display modes

## Creating an MCP Plugin

### Basic Structure

```javascript
export default class MyMCPTool {
    constructor(bot, options) {
        this.name = 'MyTool'
        this.type = 'output'
        this.isMCPTool = true // Mark as MCP tool
        
        this.bot = bot
        this.options = options
        
        // Configure display mode
        this.outputMode = options.outputMode || 'modal' // 'modal' | 'inline' | 'both'
        this.allowModeToggle = options.allowModeToggle || false
    }
}
```

### MCP Tool Definition

```javascript
getMCPToolDefinition() {
    return {
        name: 'my_tool',
        description: 'Description of tool functionality',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Query parameter',
                    enum: ['option1', 'option2'], // If applicable
                },
                outputMode: {
                    type: 'string',
                    enum: ['modal', 'inline'],
                    description: 'How to display the result: modal (popup) or inline (in chat)',
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

### Execution Implementation

```javascript
async executeTool(query, mode = 'modal') {
    try {
        // Process the query
        const data = await this.processQuery(query)
        
        if (mode === 'inline') {
            // Return content for inline display
            return this.generateInlineContent(data)
        } else {
            // Traditional modal behavior
            this.openModal(data)
            return {
                success: true,
                message: `Tool executed: ${query}`
            }
        }
    } catch (error) {
        return {
            success: false,
            error: `Error executing tool: ${error.message}`
        }
    }
}
```

### Generating Inline Content

```javascript
generateInlineContent(data) {
    // Create structured HTML
    const html = `
        <div class="my-tool-content">
            <h3 class="title">${data.title}</h3>
            <div class="content">
                ${data.items.map(item => `
                    <div class="item">
                        <h4>${item.name}</h4>
                        <p>${item.description}</p>
                        ${item.image ? `<img src="${item.image}" alt="${item.name}">` : ''}
                    </div>
                `).join('')}
            </div>
            <div class="metadata">
                <small>Processed at ${new Date().toLocaleString()}</small>
            </div>
        </div>
    `
    
    return {
        type: 'inline_content',
        data: {
            text: `${data.title} - ${data.items.length} items found`,
            html: html,
            images: data.items.map(item => item.image).filter(Boolean),
            title: data.title
        }
    }
}
```

## MCP Plugin Configuration

### In Main Bot

```javascript
// Configure plugin with inline mode
let mcpToolConfig = {
    plugin: 'MyMCPTool',
    type: 'output',
    outputMode: 'inline',     // Default mode
    allowModeToggle: true     // Allow switching between modes
}
bot_options.plugins.push(mcpToolConfig)
```

### Advanced Configuration

```javascript
let mcpToolConfig = {
    plugin: 'ImageGallery',
    type: 'output',
    outputMode: 'both',       // Supports both modes
    allowModeToggle: true,
    
    // Plugin-specific configurations
    attributeType: 'data-image-gallery-id',
    responsive: true,
    
    // Inline layout configurations
    inlineLayout: {
        columns: 'auto-fit',
        minWidth: '200px',
        gap: '15px'
    }
}
```

## CSS Styling

### Basic CSS for Inline Content

```css
/* Global styles for inline MCP tools */
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

/* Specific styles for your tool */
.mcp_inline_content .my-tool-content .item {
    margin: 10px 0;
    padding: 10px;
    background: white;
    border-radius: 4px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.mcp_inline_content .my-tool-content img {
    max-width: 100%;
    height: auto;
    border-radius: 4px;
    margin-top: 8px;
}
```

### Responsive CSS

```css
/* Mobile adaptation */
@media (max-width: 768px) {
    .mcp_inline_content {
        padding: 10px;
        margin: 5px 0;
    }
    
    .mcp_inline_content .content {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }
}

/* Tablet adaptation */
@media (min-width: 769px) and (max-width: 1024px) {
    .mcp_inline_content .content {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 15px;
    }
}

/* Desktop */
@media (min-width: 1025px) {
    .mcp_inline_content .content {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 20px;
    }
}
```

## Practical Examples

### Image Gallery

```javascript
// Gallery plugin supporting inline mode
export default class ImageGalleryMCP {
    constructor(bot, options) {
        this.name = 'ImageGallery'
        this.type = 'output'
        this.isMCPTool = true
        this.outputMode = options.outputMode || 'modal'
        
        // Initialize page elements
        this.elements = this.discoverElements()
    }
    
    generateInlineContent(queries, title) {
        const images = this.collectImages(queries)
        const texts = this.collectTexts(queries)
        
        const html = `
            <div class="inline-gallery-content">
                <h3 class="inline-gallery-title">${title}</h3>
                <div class="inline-gallery-images">
                    ${images.map(img => `
                        <figure class="inline-gallery-image">
                            <img src="${img.src}" alt="${img.alt}">
                            <figcaption>${img.alt}</figcaption>
                        </figure>
                    `).join('')}
                </div>
                <div class="inline-gallery-text">
                    ${texts}
                </div>
            </div>
        `
        
        return {
            type: 'inline_content',
            data: {
                text: `Gallery: ${title}`,
                html: html,
                images: images.map(img => img.src),
                title: title
            }
        }
    }
}
```

### Documentation Tool

```javascript
export default class DocumentationMCP {
    async executeTool(topic, mode = 'inline') {
        const documentation = await this.fetchDocumentation(topic)
        
        if (mode === 'inline') {
            return {
                type: 'inline_content',
                data: {
                    text: `Documentation: ${documentation.title}`,
                    html: `
                        <div class="doc-content">
                            <h3>${documentation.title}</h3>
                            <div class="doc-meta">
                                <span class="doc-version">v${documentation.version}</span>
                                <span class="doc-updated">${documentation.updated}</span>
                            </div>
                            <div class="doc-body">
                                ${documentation.content}
                            </div>
                            <div class="doc-examples">
                                <h4>Examples</h4>
                                ${documentation.examples.map(ex => `
                                    <div class="example">
                                        <h5>${ex.title}</h5>
                                        <pre><code>${ex.code}</code></pre>
                                        <p>${ex.description}</p>
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

## Best Practices

### 1. Performance
- Process data asynchronously
- Limit the size of generated HTML
- Use lazy loading for images when possible
- Implement caching for frequent queries

### 2. User Experience
- Provide visual feedback during processing
- Use subtle animations for transitions
- Maintain visual consistency with chat theme
- Implement informative error states

### 3. Responsiveness
- Test across different screen sizes
- Use CSS Grid/Flexbox for flexible layouts
- Optimize images for mobile devices
- Consider bandwidth limitations

### 4. Accessibility
- Use appropriate semantic tags
- Provide alternative text for images
- Maintain adequate color contrast
- Support keyboard navigation

## Backend Integration

### Sending Data to LLM

The system automatically sends tool results back to the LLM for additional processing:

```javascript
// MCPHelper automatically handles feedback
async executeToolCalls(toolCalls, originalResponse) {
    // ... tool execution
    
    // Send results back to LLM
    if (toolResults.length > 0) {
        await this.sendToolResultsToLLM(toolResults)
    }
}
```

### Feedback Format

```javascript
const feedbackData = {
    tool: 'image_gallery',
    parameters: { query: 'wordpress', outputMode: 'inline' },
    result: {
        type: 'inline_content',
        data: { /* content data */ },
        success: true,
        timestamp: '2024-01-01T12:00:00Z'
    }
}
```

This documentation provides a solid foundation for creating and integrating MCP tools with inline content support in HandsForBots.
