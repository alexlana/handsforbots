# [•_•] Hands for Bots

<div align="center">
<br />

[![made-with-javascript](https://img.shields.io/badge/Made%20with-JavaScript-1f425f.svg)](https://www.javascript.com) [![GitHub contributors](https://img.shields.io/github/contributors/alexlana/handsforbots)](https://GitHub.com/alexlana/handsforbots/graphs/contributors/) 😥

</div>

For now the **Hands for Bots** is a conversational UI framework for browsers. It gives to chatbots / assistants the hability to interact with GUI and other user interfaces through functions calling, and receive inputs from the UIs. 

**Important:** the core do not give to assistants the hability to "view" the screen and do things.

Internally, it uses concepts from Ports and Adapters (Hexagonal Architecture). Event triggers and listeners connects the core to plugins / adapters. To call external functions, we should call the function directly, this not depends on the internal architecture.


## Table of contents

- [Get started](./docs/getstarted.md)
- [Development](./docs/development.md)

## License and notice

[![Licence](https://img.shields.io/github/license/alexlana/handsforbots?style=for-the-badge)](./LICENSE)

[Grateful for the authors of these third-party libraries](./NOTICE.md)
