##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; docs' home](../../README.md) / [core](../../core.md) / [output](../output.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](./voice.md)
[![en-US](https://img.shields.io/badge/en-US-white)](../../en-us/core/output/voice.md)

</div>


# Plugin de Saída de Voz


O plugin de saída de voz dá voz ao seu chatbot, permitindo que ele fale suas respostas ao usuário usando texto-para-fala (TTS). Este plugin utiliza a biblioteca EasySpeech para compatibilidade entre navegadores e síntese de fala de alta qualidade.


## Referência da API


### Construtor


```javascript

constructor(bot)

```


**Parâmetros:**


- `bot`: A instância inicializada da classe `Bot`.


### Métodos


#### `output(payload)`


Fala a resposta do chatbot usando a voz TTS selecionada. Ignora a saída se a voz estiver silenciada.


```javascript

async output(payload)

```


**Parâmetros:**


- `payload`: A resposta do chatbot como uma matriz de objetos (seguindo o formato de resposta do Hands for Bots).


#### `initSpeech(say_no_text = false)`


Inicializa a biblioteca EasySpeech e seleciona a voz TTS apropriada.


**Parâmetros:**


- `say_no_text`: (Opcional) Se `true`, o EasySpeech será inicializado, mas não falará nenhum texto inicial. Útil para plataformas móveis onde a interação do usuário é necessária para ativar o áudio. O padrão é `false`.


#### `ui(options)`


Cria a interface do usuário para o plugin de saída de voz, que normalmente inclui um botão de silenciar/ativar som.


**Parâmetros:**


- `options`: Um objeto contendo opções de configuração:
  - `name`: (Opcional) O nome da voz TTS preferida (se disponível). Se não for fornecido, o plugin tentará selecionar uma voz com base na configuração de idioma do bot.

#### `waiting()`


Este método não é usado atualmente pelo plugin de saída de voz.

