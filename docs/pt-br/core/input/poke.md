##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; home dos docs](../../README.md) / [core](../../core.md) / [input](../input.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](./poke.md)
[![en-US](https://img.shields.io/badge/en-US-white)](../../en-us/core/input/poke.md)

</div>


# Plugin de Entrada Poke


O plugin de entrada Poke fornece um mecanismo para engajar proativamente os usuários ou acionar ações com base em diversos eventos ou condições dentro de sua aplicação web. Este plugin atua como uma forma para sua aplicação "cutucar" o chatbot, incentivando-o a responder ou iniciar comportamentos específicos.


## Propósito


O plugin Poke é útil para:


- **Manter o Fluxo da Conversa:** Incentivar o chatbot a sugerir tópicos ou re-engajar os usuários após períodos de inatividade.

- **Reagir a Ações do Usuário:** Acionar respostas do chatbot com base em interações do usuário com sua aplicação web, como clicar em um botão, completar um formulário ou alcançar um determinado ponto em um processo.

- **Entregar Mensagens Temporizadas:** Mostrar mensagens aos usuários em horários ou intervalos específicos.


## Referência da API


### Construtor


```javascript

constructor(bot)

```


**Parâmetros:**


- `bot`: A instância inicializada da classe `Bot`.


### Métodos


#### `input(payload)`


Coloca na fila um payload "poke" e o envia para o mecanismo de backend quando o backend estiver disponível.


```javascript

input(payload)

```


**Parâmetros:**


- `payload`: Um objeto contendo informações sobre o poke. A estrutura deste payload é flexível e pode ser definida com base nas necessidades de sua aplicação. Propriedades comuns podem incluir:
  - `time`: Um timestamp ou intervalo de tempo.
  - `event`: O nome de um evento que acionou o poke.
  - `target_type`: O tipo de alvo (por exemplo, 'plugin', 'função').
  - `target_plugin`: O nome de um plugin ou função específico.
  - `parameters`: Quaisquer dados adicionais relevantes ao poke.

#### `receiver(response)`


Trata a resposta do mecanismo de backend e aciona plugins de saída para exibir a resposta ao usuário.


```javascript

receiver(response)

```


**Parâmetros:**


- `response`: A resposta do mecanismo de backend.


#### `ui(options)`


Este método atualmente não cria nenhum elemento de UI, pois os gatilhos de poke são normalmente iniciados por eventos ou condições dentro de sua aplicação web. 


