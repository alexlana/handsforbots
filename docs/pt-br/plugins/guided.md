##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; home dos docs](../README.md) / [plugins](../plugins.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](./guided.md)
[![en-US](https://img.shields.io/badge/en-US-white)](../../en-us/plugins/guided.md)

</div>


# Plugin GUIDed

O plugin GUIDed capacita seu chatbot a fornecer tutoriais interativos passo a passo aos usuários, guiando-os por vários recursos ou funcionalidades do seu aplicativo da web. Este plugin aumenta o engajamento do usuário e os ajuda a aprender fazendo.


## Como funciona


O plugin GUIDed utiliza uma sequência de etapas, cada uma definida como um objeto JSON, para criar uma experiência guiada. Essas etapas podem ser caixas de diálogo modais ou balões sensíveis ao contexto que apontam para elementos específicos em sua página da web.


### Estrutura da etapa


Cada etapa na sequência do tutorial deve aderir a um dos seguintes formatos:


#### Etapa Modal


```json

{
  "type": "modal",
  "title": "Título Modal",
  "text": "Texto explicativo para o usuário",
  "btn_next": "Texto do Botão Próximo"  // Opcional, padrão para "Próximo >>" específico do idioma
  "btn_previous": "Texto do Botão Anterior"  // Opcional, padrão para "<< Anterior" específico do idioma
  "btn_close": "Texto do Botão Fechar" // Opcional, padrão para "Fechar [x]" específico do idioma
}

```


#### Etapa de Balão


```json

{
  "type": "balloon",
  "title": "Título do Balão",
  "text": "Texto explicativo para o usuário",
  "dom_element": "#elementId" // O seletor CSS para o elemento DOM de destino
  "btn_next": "Texto do Botão Próximo"  // Opcional
  "btn_previous": "Texto do Botão Anterior"  // Opcional
  "btn_close": "Texto do Botão Fechar" // Opcional
}

```


### Exemplo de Sequência


```json

[
  {
    "type": "modal",
    "title": "Bem-vindo ao Tutorial",
    "text": "Este guia irá guiá-lo pelos principais recursos do nosso aplicativo."
  },
  {
    "type": "balloon",
    "title": "Botão Salvar",
    "text": "Clique neste botão para salvar seu trabalho.",
    "dom_element": "#saveButton"
  },
  {
    "type": "balloon",
    "title": "Menu de Navegação",
    "text": "Use este menu para navegar entre diferentes seções.",
    "dom_element": "#navigationMenu"
  },
  {
    "type": "modal",
    "title": "Tutorial Concluído",
    "text": "Parabéns! Você concluiu o tutorial.",
    "btn_close": "Entendi!"
  }
]

```


## Referência da API


### Construtor


```javascript

constructor(bot, options)

```


**Parâmetros:**


- `bot`: A instância inicializada da classe `Bot`.

- `options`: Um objeto contendo opções de configuração:
  - `sequence`: (Opcional) Uma matriz de objetos de etapa definindo o tutorial. Se não for fornecido, você pode usar `newGuide()` para iniciar um tutorial mais tarde.
  - `wait_user`: (Opcional) Se `true`, o tutorial aguardará a entrada do usuário (por exemplo, cliques de botão) para prosseguir para a próxima etapa. Se `false`, o tutorial avançará automaticamente com base no tempo ou outros gatilhos. O padrão é `true`.
  - `auto_start`: (Opcional) Se `true`, o tutorial será iniciado automaticamente quando o plugin for carregado. O padrão é `false`.
  - `skip`: (Opcional) Texto personalizado para o link "Pular este guia". O padrão é um equivalente específico do idioma.

### Métodos


#### `output(payload)`


Este método não é usado atualmente pelo plugin GUIDed, pois ele lida principalmente com eventos da interface do usuário e gatilhos do chatbot.


#### `redirectedInput(payload)`


Captura a entrada do usuário durante um tutorial guiado, permitindo a navegação usando comandos de texto ou botões.


#### `newGuide(sequence)`


Inicia um novo tutorial guiado usando a sequência de etapas fornecida.


```javascript

newGuide(sequence)

```


**Parâmetros:**


- `sequence`: Uma matriz de objetos de etapa definindo o tutorial.


#### `ui(options)`


Cria os elementos da interface do usuário para o tutorial, incluindo modais, balões e botões de navegação.


#### `navigate(direction)`


Navega pelas etapas do tutorial com base na entrada ou comandos do usuário.


```javascript

navigate(direction)

```


**Parâmetros:**


- `direction`: Um inteiro indicando a direção da navegação:
  - `1`: Avançar para a próxima etapa.
  - `-1`: Voltar para a etapa anterior.
  - `0`: Cancelar ou pular o tutorial.

#### `nextStep()`


Avança para a próxima etapa na sequência do tutorial.


#### `button(direction, el)`


Cria um botão HTML para navegar pelas etapas do tutorial.


#### `skip()`


Cria o link "Pular este guia", permitindo que os usuários saiam do tutorial.


#### `footerButtons(message, current, total)`


Gera o HTML para os botões de navegação (Próximo, Anterior, Fechar) dentro de um modal ou balão.


#### `modal(message, current, total)`


Cria e exibe uma etapa de caixa de diálogo modal.


#### `balloon(message, current, total)`


Cria e exibe uma etapa de balão, posicionando-a próximo ao elemento DOM de destino.


#### `balloonPosition()`


Calcula a posição ideal para uma etapa de balão.


#### `mask(focus_bounds)`


Cria uma sobreposição de máscara para destacar o elemento DOM de destino de uma etapa de balão.


#### `waiting()`


Este método não é usado atualmente pelo plugin GUIDed.

