# Hands for Bots + Vue

Host-rendered chat with the [Vue adapter](../../docs/en-us/adapters/vue.md): the app owns the UI (thread, composer, cart panel); Hands for Bots runs the backend, history, action policies and the commands the bot triggers on the page.

What it shows:

- `useHandsForBots()` driving a custom chat thread, with suggestion buttons;
- `useBotCommand()` letting the bot change a component (`Cart.add`, `Cart.clear`);
- `loopDetector` blocking a repeated command, surfaced with `useBotEvent( 'core.action_blocked' )`;
- `useActionPolicy()` asking the user before a destructive command;
- history restore on reload (messages and the cart state).

## Run

```bash
npm install
npm run dev:mock   # built-in mock backend, no Docker
npm run dev        # real Rasa at http://localhost/rasa (see ../README.md)
```

With the mock, try "quero um café" and "limpar carrinho".
