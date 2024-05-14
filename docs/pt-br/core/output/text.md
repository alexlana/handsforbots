##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; home dos docs](../../README.md) / [core](../../core.md) / [output](../output.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](./text.md)
[![en-US](https://img.shields.io/badge/en-US-white)](../../../en-us/core/output/text.md)

</div>


# Plugin de Saída de Texto


O plugin de saída de texto é o canal de saída padrão para interações de chatbot baseadas em texto. Ele renderiza as respostas de texto, imagens e botões do chatbot em uma área designada da sua página da web, normalmente uma janela de bate-papo.


## Referência da API


### Construtor


```javascript

constructor(bot)

```


**Parâmetros:**


- `bot`: A instância inicializada da classe `Bot`.


### Métodos


#### `output(payload, side = 'bot')`


Exibe as respostas do chatbot na janela de bate-papo.


```javascript

async output(payload, side = 'bot')

```


**Parâmetros:**


- `payload`: A resposta do chatbot como uma matriz de objetos (seguindo o formato de resposta do Hands for Bots).

- `side`: (Opcional) Indica se a mensagem é do 'bot' ou do 'usuário'. O padrão é 'bot'.


#### `insertMessage(payload, side)`


Um método interno para adicionar uma mensagem à exibição do bate-papo.


#### `ui(options)`


O plugin de saída de texto utiliza a interface do usuário criada pelo plugin de entrada de texto. Este método sinaliza para o núcleo que a interface do usuário está pronta.


#### `messageWrapper(payload, side = 'bot', recipient = null)`


Cria a estrutura HTML para uma bolha de mensagem de bate-papo, delegando para o método `messageWrapper` do plugin de entrada de texto.


#### `imageWrapper(payload)`


Cria o HTML para exibir uma imagem no bate-papo, delegando para o método `imageWrapper` do plugin de entrada de texto.


#### `buttonWrapper(title, payload)`


Cria um botão HTML para uma resposta do chatbot, delegando para o método `buttonWrapper` do plugin de entrada de texto.


#### `listButtons(buttons = null)`


Gera HTML para uma lista de botões, delegando para o método `listButtons` do plugin de entrada de texto.


#### `waiting()`


Exibe uma mensagem temporária "aguarde" enquanto o bot está processando uma resposta.

