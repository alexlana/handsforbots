# Security

H4B lets software (an LLM, a rule-based bot, an external browser agent) act on a live user session. Treat every action call as untrusted input.

- **Only registered actions run.** There is no `window[...]` lookup or code from messages (v1's action tags are gone). Arguments are validated against the action's schema before the handler runs.
- **Origins.** Calls come from `user` (menu, buttons, `runAction`), `assistant` (tool calls of your backend) or `agent` (WebMCP). Use `exposeTo` to limit who sees and calls an action; `expose-webmcp` publishes only actions that explicitly include `'agent'`.
- **Confirmation.** `destructive: true` (or `confirm: 'always'`) asks the `confirm` service for every origin. Without a `confirm` service, such calls are refused.
- **Interceptors.** `action.before` can veto or rewrite any call (rate limits, business rules); `request.before` can redact data before it leaves the browser; `signal.before` can drop input.
- **Secrets.** Keys never belong in the browser. Use `httpSTT`/`httpTTS`, `websocketSTT` with short-lived tokens, `universalLLM` or `http` pointing at your backend. `openAICompatible` warns when a key is used outside localhost.
- **Rendering.** The widget escapes all text and renders a small Markdown subset; links are limited to http(s), mailto, tel and relative URLs; images in the gallery renderer are filtered the same way. Custom renderers receive props from the backend: treat them as untrusted.
- **Privacy.** `observability` does not record message content unless `includeContent: true`. Sensors and camera are opt-in and show their state; `storage-local` stores the conversation in the browser (pick `area: 'session'` or a short `ttlMinutes` for shared devices).
