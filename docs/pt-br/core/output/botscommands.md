##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; docs' home](../../README.md) / [core](../../core.md) / [output](../output.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](./botscommands.md)
[![en-US](https://img.shields.io/badge/en-US-white)](../../en-us/core/output/botscommands.md)

</div>


# Plugin de Saída de Comandos de Bots


O plugin de saída de Comandos de Bots permite que seu chatbot acione ações ou funções personalizadas dentro do seu aplicativo da web diretamente de suas respostas de texto. Este plugin extrai comandos formatados em JSON incorporados nas mensagens do bot e executa as ações especificadas.


## Estrutura do Comando


Os comandos são definidos como objetos JSON com a seguinte estrutura:


```json

{
  "action": "FunçãoAlvo",  // O nome da função ou método do plugin para chamar
  "params": ["param1", "param2", { "param3": "valor" }]  // Uma matriz opcional de parâmetros
}

```


- **`action`:** Especifica a função de destino ou método de plugin para invocar. Para funções JavaScript padrão, use apenas o nome da função. Para métodos de plugin, use `NomeDaClasse.NomeDoMétodo`.

- **`params`:** Uma matriz opcional de parâmetros para passar para a função de destino. Você pode passar um único parâmetro (string, objeto, etc.) ou omitir `params` se a função não exigir argumentos.


## Incorporando Comandos em Respostas


Para acionar um comando, incorpore o objeto JSON no texto de resposta do chatbot, entre delimitadores especiais: `[•` (abrir) e `•]` (fechar).


**Exemplo:**


```

Aqui estão algumas informações. [•{"action": "exibirGráfico", "params": ["dados-de-vendas"]}•]

```


## Referência da API


### Construtor


```javascript

constructor(bot)

```


**Parâmetros:**


- `bot`: A instância inicializada da classe `Bot`.


### Métodos


#### `output(payload)`


Processa a resposta do chatbot, extrai quaisquer comandos incorporados e os executa.


```javascript

async output(payload)

```


**Parâmetros:**


- `payload`: A resposta do chatbot como uma matriz de objetos (seguindo o formato de resposta do Hands for Bots).


#### `rebuildHistory()`


Executa quaisquer comandos que estavam presentes no histórico de conversas do bot quando o plugin é carregado. Útil para restaurar ações de sessões anteriores.


#### `ui(options)`


Este plugin não possui uma interface de usuário. Este método simplesmente sinaliza para o núcleo que o plugin está pronto.


#### `waiting()`


Este método não é usado atualmente pelo plugin de Comandos de Bots.

