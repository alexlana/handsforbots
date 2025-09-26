##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; home dos docs](../../../README.md) / [core](../core.md) / [backend](../backend.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](./insecure-local-ollama.md)
[![en-US](https://img.shields.io/badge/en-US-white)](../../en-us/core/backend/insecure-local-ollama.md)

</div>

# InsecureLocalOllama Backend

O backend InsecureLocalOllama conecta o HandsForBots ao Ollama local para desenvolvimento e testes. Este backend é ideal para desenvolvimento local sem necessidade de APIs externas.

## Características

- **Execução Local**: Roda completamente no seu computador
- **Sem Autenticação**: Ideal para desenvolvimento
- **Modelos Locais**: Use qualquer modelo Ollama instalado
- **Desenvolvimento Rápido**: Configuração mínima necessária

## Configuração

### Instalação do Ollama

1. Instale o Ollama em seu sistema:
   ```bash
   # macOS
   brew install ollama
   
   # Linux
   curl -fsSL https://ollama.ai/install.sh | sh
   
   # Windows
   # Baixe do site oficial: https://ollama.ai
   ```

2. Inicie o servidor Ollama:
   ```bash
   ollama serve
   ```

3. Baixe um modelo (exemplo):
   ```bash
   ollama pull llama2
   ollama pull codellama
   ollama pull mistral
   ```

### Configuração do Bot

```javascript
const bot = new Bot({
    // ... outras configurações
    engine: 'insecure-local-ollama',
    engine_endpoint: 'http://localhost:11434',
    engine_specific: {
        model: 'llama2', // Nome do modelo Ollama
        temperature: 0.7,
        max_tokens: 2048
    }
})
```

## Parâmetros de Configuração

### `engine_specific`

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|--------|-----------|
| `model` | string | `'llama2'` | Nome do modelo Ollama |
| `temperature` | number | `0.7` | Temperatura da geração (0.0 - 1.0) |
| `max_tokens` | number | `2048` | Máximo de tokens na resposta |
| `top_p` | number | `0.9` | Parâmetro top_p para diversidade |
| `top_k` | number | `40` | Parâmetro top_k para diversidade |

### Exemplo Completo

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
        // ... seus plugins
    ]
})
```

## Modelos Recomendados

### Para Conversação Geral
- **llama2**: Boa performance geral
- **mistral**: Rápido e eficiente
- **neural-chat**: Otimizado para conversação

### Para Código
- **codellama**: Especializado em programação
- **deepseek-coder**: Excelente para código

### Para Análise
- **llama2-uncensored**: Sem filtros
- **wizard-vicuna**: Boa para análise

## Limitações

⚠️ **IMPORTANTE**: Este backend é marcado como "insecure" porque:

- **Sem Autenticação**: Não há proteção de acesso
- **Apenas Local**: Não deve ser usado em produção
- **Desenvolvimento**: Ideal apenas para desenvolvimento e testes

## Troubleshooting

### Erro de Conexão
```
Erro: Connection error. Please check your settings.
```

**Soluções:**
1. Verifique se o Ollama está rodando: `ollama serve`
2. Confirme a URL do endpoint: `http://localhost:11434`
3. Teste a conexão: `curl http://localhost:11434/api/tags`

### Modelo Não Encontrado
```
Erro: Model not found
```

**Soluções:**
1. Liste modelos disponíveis: `ollama list`
2. Baixe o modelo: `ollama pull nome-do-modelo`
3. Verifique o nome exato do modelo

### Performance Lenta
- Use modelos menores para desenvolvimento
- Ajuste `max_tokens` para respostas mais curtas
- Considere usar GPU se disponível

## Exemplo de Uso

```javascript
// Configuração para desenvolvimento
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
            // ... configurações do plugin
        }
    ]
})
```

## Próximos Passos

Para produção, considere usar:
- [UniversalLLM](./universal-llm.md) - Backend universal com autenticação
- [OpenAI](./openai.md) - API OpenAI para produção
- [RASA](./rasa.md) - Framework completo de conversação
