##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; docs' home](../README.md) / [plugins](../plugins.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](./analytics.md)
[![en-US](https://img.shields.io/badge/en-US-white)](../../en-us/plugins/analytics.md)

</div>


# Plugin de Analytics

O plugin de Analytics permite rastrear e analisar as interações do usuário com seu chatbot. Este plugin captura eventos, mensagens e outros dados relevantes e os envia para o serviço de análise escolhido, fornecendo insights valiosos sobre o comportamento do usuário e padrões de conversação.

## Configuração

Para usar o plugin de Analytics, você precisará fornecer a chave de API ou endpoint do seu serviço de análise durante a inicialização. Você também pode personalizar os tipos de eventos que deseja rastrear.

## Referência da API

### Construtor

```javascript
constructor(bot, options)
```

**Parâmetros:**

- `bot`: A instância inicializada da classe `Bot`.
- `options`: Um objeto contendo opções de configuração:
    - `apiKey`: (Obrigatório) A chave de API do seu serviço de análise.
    - `endpoint`: (Opcional) A URL do endpoint do seu serviço de análise, se diferente do padrão.
    - `events`: (Opcional) Uma matriz de eventos para rastrear. Se não for fornecido, o plugin rastreará todos os eventos disponíveis. Os eventos disponíveis incluem:
        - `message_sent`: Disparado quando o usuário envia uma mensagem.
        - `message_received`: Disparado quando o chatbot recebe uma mensagem.
        - `button_clicked`: Disparado quando o usuário clica em um botão no chat.
        - `voice_input_started`: Disparado quando o usuário começa a falar usando a entrada de voz.
        - `voice_input_ended`: Disparado quando o usuário para de falar usando a entrada de voz.

### Métodos

#### `output(payload)`

Processa as respostas do chatbot, extraindo dados relevantes e enviando-os para o serviço de análise.

```javascript
output(payload)
```

**Parâmetros:**

- `payload`: A resposta do chatbot como uma matriz de objetos (seguindo o formato de resposta do Hands for Bots).

#### `trackEvent(eventName, data)`

Rastreia um evento personalizado e o envia para o serviço de análise.

```javascript
trackEvent(eventName, data)
```

**Parâmetros:**

- `eventName`: O nome do evento para rastrear.
- `data`: (Opcional) Um objeto contendo dados adicionais associados ao evento.

#### `ui(options)`

Este plugin não possui uma interface de usuário. Este método simplesmente sinaliza para o núcleo que o plugin está pronto.

#### `waiting()`

Este método não é usado atualmente pelo plugin de Analytics.
