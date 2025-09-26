##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; home dos docs](../../../README.md) / [core](../core.md) / [backend](../backend.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](./universal-llm.md)
[![en-US](https://img.shields.io/badge/en-US-white)](../../en-us/core/backend/universal-llm.md)

</div>

# UniversalLLM Backend

O backend UniversalLLM é uma solução universal que conecta o HandsForBots a múltiplos provedores de LLM através de um backend unificado. Ideal para aplicações que precisam de flexibilidade entre diferentes provedores de IA.

## Características

- **Múltiplos Provedores**: OpenAI, Anthropic, Google, Ollama, etc.
- **Backend Unificado**: Um endpoint para todos os provedores
- **Configuração Flexível**: Troque de provedor sem alterar código
- **Suporte a MCP**: Integração com Model Context Protocol
- **Produção Ready**: Autenticação e segurança incluídas

## Configuração

### Backend PHP Universal

O UniversalLLM depende do backend PHP que está disponível no repositório [handsforbots-backend](https://github.com/alexlana/handsforbots-backend). Este backend fornece uma API universal para múltiplos provedores de LLM.

### Pré-requisitos

1. **Backend PHP**: Clone e configure o [handsforbots-backend](https://github.com/alexlana/handsforbots-backend)
2. **Docker**: Backend roda em container Docker
3. **Chaves de API**: Configure as chaves dos provedores LLM

### Configuração do Backend

1. **Clone o repositório do backend**:
   ```bash
   git clone https://github.com/alexlana/handsforbots-backend.git
   cd handsforbots-backend/php
   ```

2. **Configure as variáveis de ambiente**:
   ```bash
   cp env.example .env
   nano .env  # Configure suas chaves de API
   ```

3. **Inicie o backend**:
   ```bash
   ./start.sh
   ```

4. **Teste a conexão**:
   ```bash
   curl http://localhost:8081/health
   ```

### Configuração do Frontend

Após configurar o backend PHP, configure o frontend:

```javascript
const bot = new Bot({
    engine: 'universal-llm',
    engine_endpoint: 'http://localhost:8081/universal_llm_backend.php',
    engine_specific: {
        provider: 'openai', // ou 'anthropic', 'google', 'ollama', etc.
        model: 'gpt-4',
        sessionId: null // Será obtido automaticamente
    }
})
```

## Parâmetros de Configuração

### `engine_specific`

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|--------|-----------|
| `provider` | string | `'auto'` | Provedor LLM: 'openai', 'anthropic', 'google', 'ollama' |
| `model` | string | `'auto'` | Modelo específico do provedor |
| `sessionId` | string | `null` | ID da sessão (gerado automaticamente) |

⚠️ **IMPORTANTE**: As chaves de API são gerenciadas **exclusivamente pelo backend PHP** por questões de segurança. Nunca passe `apiKey` do frontend.

### Provedores Suportados

#### OpenAI
```javascript
engine_specific: {
    provider: 'openai',
    model: 'gpt-4'
    // API key é gerenciada pelo backend PHP
}
```

#### Anthropic
```javascript
engine_specific: {
    provider: 'anthropic',
    model: 'claude-3-sonnet'
    // API key é gerenciada pelo backend PHP
}
```

#### Google
```javascript
engine_specific: {
    provider: 'google',
    model: 'gemini-pro'
    // API key é gerenciada pelo backend PHP
}
```

#### Ollama
```javascript
engine_specific: {
    provider: 'ollama',
    model: 'llama2'
    // Ollama local não requer API key
}
```

## Exemplo Completo

```javascript
const bot = new Bot({
    engine: 'universal-llm',
    engine_endpoint: 'http://localhost:8081/universal_llm_backend.php',
    engine_specific: {
        provider: 'openai',
        model: 'gpt-4',
        sessionId: null
    },
    plugins: [
        {
            plugin: 'Text',
            type: 'input',
            // ... configurações do plugin
        }
    ]
})
```

## Vantagens do UniversalLLM

### 1. Flexibilidade
- Troque de provedor sem alterar código
- Use diferentes modelos para diferentes casos
- Fallback automático entre provedores

### 2. Economia
- Use o provedor mais barato para cada caso
- Otimização automática de custos
- Comparação de performance entre provedores

### 3. Confiabilidade
- Redundância entre provedores
- Fallback automático em caso de falha
- Monitoramento de disponibilidade

## Configuração do Backend

### Estrutura do Backend

O backend UniversalLLM deve implementar:

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

### Resposta Esperada

```javascript
{
    "response": "Resposta do LLM",
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

## Casos de Uso

### 1. Desenvolvimento
```javascript
// Use Ollama local para desenvolvimento
engine_specific: {
    provider: 'ollama',
    model: 'llama2'
}
```

### 2. Produção
```javascript
// Use OpenAI para produção
engine_specific: {
    provider: 'openai',
    model: 'gpt-4',
    apiKey: 'sk-proj-...'
}
```

### 3. Análise Especializada
```javascript
// Use Claude para análise complexa
engine_specific: {
    provider: 'anthropic',
    model: 'claude-3-opus',
    apiKey: 'sk-ant-...'
}
```

## Troubleshooting

### Erro de Autenticação
```
Erro: API key inválida
```

**Soluções:**
1. Verifique a chave de API
2. Confirme se o provedor está correto
3. Verifique as permissões da chave

### Erro de Modelo
```
Erro: Modelo não encontrado
```

**Soluções:**
1. Verifique se o modelo existe no provedor
2. Confirme a ortografia do nome do modelo
3. Verifique se o modelo está disponível na sua região

### Erro de Conexão
```
Erro: Connection error
```

**Soluções:**
1. Verifique a URL do endpoint
2. Confirme se o backend está rodando
3. Verifique a conectividade de rede

## Próximos Passos

Para implementar o backend UniversalLLM:

1. **Configure o Backend**: Implemente o servidor que gerencia múltiplos provedores
2. **Configure Autenticação**: Implemente sistema de autenticação seguro
3. **Configure Monitoramento**: Adicione logs e métricas
4. **Configure Fallback**: Implemente fallback entre provedores

## Arquitetura

### Dependências

O UniversalLLM requer o backend PHP do repositório [handsforbots-backend](https://github.com/alexlana/handsforbots-backend):

```
Frontend (HandsForBots) 
    ↓ HTTP/HTTPS
Backend PHP (handsforbots-backend)
    ↓ API Calls
Provedores LLM (OpenAI, Anthropic, Google, Ollama)
```

### Fluxo de Dados

1. **Frontend** envia requisição para o backend PHP
2. **Backend PHP** valida e processa a requisição
3. **Backend PHP** chama o provedor LLM apropriado
4. **Provedor LLM** retorna a resposta
5. **Backend PHP** formata e retorna para o frontend

### Segurança

O backend PHP implementa:
- **Rate Limiting**: Controle de requisições
- **CORS**: Controle de origens
- **Autenticação**: Validação de API keys
- **Validação**: Sanitização de entrada
- **Logs**: Monitoramento de segurança

### ⚠️ Segurança de API Keys

**NUNCA** configure `apiKey` no frontend. As chaves de API devem ser:

1. **Configuradas no backend PHP** através do arquivo `.env`
2. **Gerenciadas pelo servidor** de forma segura
3. **Nunca expostas** no código JavaScript
4. **Rotacionadas regularmente** para máxima segurança

#### ❌ Configuração INCORRETA (NÃO FAÇA):
```javascript
// PERIGOSO - NUNCA FAÇA ISSO!
engine_specific: {
    provider: 'openai',
    apiKey: 'sk-...' // ❌ RISCO DE SEGURANÇA!
}
```

#### ✅ Configuração CORRETA:
```javascript
// SEGURO - API keys no backend PHP
engine_specific: {
    provider: 'openai',
    model: 'gpt-4'
    // API key configurada no backend PHP
}
```

## Alternativas

Se o UniversalLLM não atender suas necessidades:

- [OpenAI](./openai.md) - Para uso direto da API OpenAI
- [RASA](./rasa.md) - Para framework completo de conversação
- [InsecureLocalOllama](./insecure-local-ollama.md) - Para desenvolvimento local
