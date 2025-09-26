##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; docs' home](../../../README.md) / [core](../core.md) / [backend](../backend.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](../../pt-br/core/backend/universal-llm.md)
[![en-US](https://img.shields.io/badge/en-US-white)](./universal-llm.md)

</div>

# UniversalLLM Backend

The UniversalLLM backend is a universal solution that connects HandsForBots to multiple LLM providers through a unified backend. Ideal for applications that need flexibility between different AI providers.

## Features

- **Multiple Providers**: OpenAI, Anthropic, Google, Ollama, etc.
- **Unified Backend**: One endpoint for all providers
- **Flexible Configuration**: Switch providers without changing code
- **MCP Support**: Integration with Model Context Protocol
- **Production Ready**: Authentication and security included

## Setup

### Universal PHP Backend

UniversalLLM depends on the PHP backend available in the [handsforbots-backend](https://github.com/alexlana/handsforbots-backend) repository. This backend provides a universal API for multiple LLM providers.

### Prerequisites

1. **PHP Backend**: Clone and configure [handsforbots-backend](https://github.com/alexlana/handsforbots-backend)
2. **Docker**: Backend runs in Docker container
3. **API Keys**: Configure LLM provider API keys

### Backend Setup

1. **Clone the backend repository**:
   ```bash
   git clone https://github.com/alexlana/handsforbots-backend.git
   cd handsforbots-backend/php
   ```

2. **Configure environment variables**:
   ```bash
   cp env.example .env
   nano .env  # Configure your API keys
   ```

3. **Start the backend**:
   ```bash
   ./start.sh
   ```

4. **Test the connection**:
   ```bash
   curl http://localhost:8081/health
   ```

### Frontend Configuration

After configuring the PHP backend, configure the frontend:

```javascript
const bot = new Bot({
    engine: 'universal-llm',
    engine_endpoint: 'http://localhost:8081/universal_llm_backend.php',
    engine_specific: {
        provider: 'openai', // or 'anthropic', 'google', 'ollama', etc.
        model: 'gpt-4',
        apiKey: 'your-api-key',
        sessionId: null // Will be obtained automatically
    }
})
```

## Configuration Parameters

### `engine_specific`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `provider` | string | `'auto'` | LLM provider: 'openai', 'anthropic', 'google', 'ollama' |
| `model` | string | `'auto'` | Specific provider model |
| `apiKey` | string | `null` | Provider API key |
| `sessionId` | string | `null` | Session ID (generated automatically) |

### Supported Providers

#### OpenAI
```javascript
engine_specific: {
    provider: 'openai',
    model: 'gpt-4',
    apiKey: 'sk-...'
}
```

#### Anthropic
```javascript
engine_specific: {
    provider: 'anthropic',
    model: 'claude-3-sonnet',
    apiKey: 'sk-ant-...'
}
```

#### Google
```javascript
engine_specific: {
    provider: 'google',
    model: 'gemini-pro',
    apiKey: 'AIza...'
}
```

#### Ollama
```javascript
engine_specific: {
    provider: 'ollama',
    model: 'llama2',
    apiKey: null // Local Ollama doesn't require API key
}
```

## Complete Example

```javascript
const bot = new Bot({
    engine: 'universal-llm',
    engine_endpoint: 'https://api.example.com/llm',
    engine_specific: {
        provider: 'openai',
        model: 'gpt-4',
        apiKey: 'sk-proj-...',
        sessionId: null
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

## UniversalLLM Advantages

### 1. Flexibility
- Switch providers without changing code
- Use different models for different cases
- Automatic fallback between providers

### 2. Cost Efficiency
- Use the cheapest provider for each case
- Automatic cost optimization
- Performance comparison between providers

### 3. Reliability
- Redundancy between providers
- Automatic fallback on failure
- Availability monitoring

## Backend Configuration

### Backend Structure

The UniversalLLM backend should implement:

```javascript
// Endpoint: POST /api/llm
{
    "provider": "openai",
    "model": "gpt-4",
    "messages": [...],
    "sessionId": "uuid-session",
    "apiKey": "sk-..."
}
```

### Expected Response

```javascript
{
    "response": "LLM response",
    "sessionId": "uuid-session",
    "provider": "openai",
    "model": "gpt-4",
    "usage": {
        "prompt_tokens": 100,
        "completion_tokens": 50,
        "total_tokens": 150
    }
}
```

## Use Cases

### 1. Development
```javascript
// Use local Ollama for development
engine_specific: {
    provider: 'ollama',
    model: 'llama2'
}
```

### 2. Production
```javascript
// Use OpenAI for production
engine_specific: {
    provider: 'openai',
    model: 'gpt-4',
    apiKey: 'sk-proj-...'
}
```

### 3. Specialized Analysis
```javascript
// Use Claude for complex analysis
engine_specific: {
    provider: 'anthropic',
    model: 'claude-3-opus',
    apiKey: 'sk-ant-...'
}
```

## Troubleshooting

### Authentication Error
```
Error: Invalid API key
```

**Solutions:**
1. Check the API key
2. Confirm the provider is correct
3. Verify key permissions

### Model Error
```
Error: Model not found
```

**Solutions:**
1. Check if the model exists in the provider
2. Confirm the model name spelling
3. Verify model availability in your region

### Connection Error
```
Error: Connection error
```

**Solutions:**
1. Check the endpoint URL
2. Confirm the backend is running
3. Verify network connectivity

## Next Steps

To implement the UniversalLLM backend:

1. **Configure Backend**: Implement the server that manages multiple providers
2. **Configure Authentication**: Implement secure authentication system
3. **Configure Monitoring**: Add logs and metrics
4. **Configure Fallback**: Implement fallback between providers

## Architecture

### Dependencies

UniversalLLM requires the PHP backend from the [handsforbots-backend](https://github.com/alexlana/handsforbots-backend) repository:

```
Frontend (HandsForBots) 
    ↓ HTTP/HTTPS
PHP Backend (handsforbots-backend)
    ↓ API Calls
LLM Providers (OpenAI, Anthropic, Google, Ollama)
```

### Data Flow

1. **Frontend** sends request to PHP backend
2. **PHP Backend** validates and processes the request
3. **PHP Backend** calls the appropriate LLM provider
4. **LLM Provider** returns the response
5. **PHP Backend** formats and returns to frontend

### Security

The PHP backend implements:
- **Rate Limiting**: Request control
- **CORS**: Origin control
- **Authentication**: API key validation
- **Validation**: Input sanitization
- **Logs**: Security monitoring

## Alternatives

If UniversalLLM doesn't meet your needs:

- [OpenAI](./openai.md) - For direct OpenAI API usage
- [RASA](./rasa.md) - For complete conversation framework
- [InsecureLocalOllama](./insecure-local-ollama.md) - For local development
