##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; docs' home](../../../README.md) / [core](../core.md) / [backend](../backend.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](../../pt-br/core/backend/insecure-local-ollama.md)
[![en-US](https://img.shields.io/badge/en-US-white)](./insecure-local-ollama.md)

</div>

# InsecureLocalOllama Backend

The InsecureLocalOllama backend connects HandsForBots to local Ollama for development and testing. This backend is ideal for local development without the need for external APIs.

## Features

- **Local Execution**: Runs completely on your computer
- **No Authentication**: Ideal for development
- **Local Models**: Use any installed Ollama model
- **Quick Development**: Minimal configuration required

## Setup

### Ollama Installation

1. Install Ollama on your system:
   ```bash
   # macOS
   brew install ollama
   
   # Linux
   curl -fsSL https://ollama.ai/install.sh | sh
   
   # Windows
   # Download from official site: https://ollama.ai
   ```

2. Start the Ollama server:
   ```bash
   ollama serve
   ```

3. Download a model (example):
   ```bash
   ollama pull llama2
   ollama pull codellama
   ollama pull mistral
   ```

### Bot Configuration

```javascript
const bot = new Bot({
    // ... other configurations
    engine: 'insecure-local-ollama',
    engine_endpoint: 'http://localhost:11434',
    engine_specific: {
        model: 'llama2', // Ollama model name
        temperature: 0.7,
        max_tokens: 2048
    }
})
```

## Configuration Parameters

### `engine_specific`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `model` | string | `'llama2'` | Ollama model name |
| `temperature` | number | `0.7` | Generation temperature (0.0 - 1.0) |
| `max_tokens` | number | `2048` | Maximum tokens in response |
| `top_p` | number | `0.9` | Top-p parameter for diversity |
| `top_k` | number | `40` | Top-k parameter for diversity |

### Complete Example

```javascript
const bot = new Bot({
    engine: 'insecure-local-ollama',
    engine_endpoint: 'http://localhost:11434',
    engine_specific: {
        model: 'codellama',
        temperature: 0.3,
        max_tokens: 4096,
        top_p: 0.95,
        top_k: 50
    },
    plugins: [
        // ... your plugins
    ]
})
```

## Recommended Models

### For General Conversation
- **llama2**: Good general performance
- **mistral**: Fast and efficient
- **neural-chat**: Optimized for conversation

### For Code
- **codellama**: Specialized in programming
- **deepseek-coder**: Excellent for code

### For Analysis
- **llama2-uncensored**: No filters
- **wizard-vicuna**: Good for analysis

## Limitations

⚠️ **IMPORTANT**: This backend is marked as "insecure" because:

- **No Authentication**: No access protection
- **Local Only**: Should not be used in production
- **Development**: Ideal only for development and testing

## Troubleshooting

### Connection Error
```
Error: Connection error. Please check your settings.
```

**Solutions:**
1. Check if Ollama is running: `ollama serve`
2. Confirm the endpoint URL: `http://localhost:11434`
3. Test the connection: `curl http://localhost:11434/api/tags`

### Model Not Found
```
Error: Model not found
```

**Solutions:**
1. List available models: `ollama list`
2. Download the model: `ollama pull model-name`
3. Check the exact model name

### Slow Performance
- Use smaller models for development
- Adjust `max_tokens` for shorter responses
- Consider using GPU if available

## Usage Example

```javascript
// Configuration for development
const bot = new Bot({
    engine: 'insecure-local-ollama',
    engine_endpoint: 'http://localhost:11434',
    engine_specific: {
        model: 'llama2',
        temperature: 0.7,
        max_tokens: 1024
    },
    plugins: [
        {
            plugin: 'Text',
            type: 'input',
            // ... plugin configurations
        }
    ]
})
```

## Next Steps

For production, consider using:
- [UniversalLLM](./universal-llm.md) - Universal backend with authentication
- [OpenAI](./openai.md) - OpenAI API for production
- [RASA](./rasa.md) - Complete conversation framework
