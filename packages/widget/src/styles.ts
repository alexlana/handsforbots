/** Preset palettes (v1 `color` option). Any value can be overridden with `colors`. */
export const PALETTES: Record<string, Record<string, string>> = {
  blue: { primary: '#2563eb', primaryHover: '#1d4ed8', soft: '#e8efff' },
  purple: { primary: '#6b3fd4', primaryHover: '#5a2fc2', soft: '#efe9fc' },
  orange: { primary: '#ea580c', primaryHover: '#c2410c', soft: '#fff1e7' },
  green: { primary: '#15803d', primaryHover: '#166534', soft: '#e6f6ec' },
}

export const STYLES = /* css */ `
:host {
  --h4b-primary: #2563eb;
  --h4b-primary-hover: #1d4ed8;
  --h4b-soft: #e8efff;
  --h4b-bg: #ffffff;
  --h4b-surface: #f6f7fb;
  --h4b-text: #1d1b29;
  --h4b-muted: #6b6880;
  --h4b-border: #e3e1ec;
  --h4b-danger: #c2410c;
  --h4b-radius: 14px;
  --h4b-width: 360px;
  --h4b-height: min(620px, calc(100vh - 100px));
  --h4b-font: system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-family: var(--h4b-font);
  color: var(--h4b-text);
}
:host([data-theme='dark']) { color-scheme: dark; }
@media (prefers-color-scheme: dark) {
  :host(:not([data-theme='light'])) {
    --h4b-bg: #1d1c27;
    --h4b-surface: #16151e;
    --h4b-text: #ecebf3;
    --h4b-muted: #a19eb5;
    --h4b-border: #2e2c3b;
    --h4b-soft: #2c2a45;
  }
}
:host([data-theme='dark']) {
  --h4b-bg: #1d1c27;
  --h4b-surface: #16151e;
  --h4b-text: #ecebf3;
  --h4b-muted: #a19eb5;
  --h4b-border: #2e2c3b;
  --h4b-soft: #2c2a45;
}
* { box-sizing: border-box; }
button, input { font: inherit; color: inherit; }
button { cursor: pointer; }

.launcher {
  position: fixed; z-index: 2147483000;
  width: 56px; height: 56px; border-radius: 50%; border: 0;
  background: var(--h4b-primary); color: white; font-size: 24px;
  box-shadow: 0 6px 20px rgba(0,0,0,.2);
}
.launcher:hover { background: var(--h4b-primary-hover); }
.window {
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--h4b-bg); border: 1px solid var(--h4b-border);
}
.window[hidden] { display: none; }

/* floating: window above a corner launcher */
:host([data-layout='floating']) .window {
  position: fixed; z-index: 2147483000;
  width: min(var(--h4b-width), calc(100vw - 24px)); height: var(--h4b-height);
  border-radius: var(--h4b-radius); box-shadow: 0 12px 40px rgba(0,0,0,.18);
}
:host([data-corner$='right']) .launcher, :host([data-corner$='right']) .window { right: 20px; }
:host([data-corner$='left']) .launcher, :host([data-corner$='left']) .window { left: 20px; }
:host([data-corner^='bottom']) .launcher { bottom: 20px; }
:host([data-corner^='bottom']) .window { bottom: 88px; }
:host([data-corner^='top']) .launcher { top: 20px; }
:host([data-corner^='top']) .window { top: 88px; }
:host([data-always-open]) .window { bottom: 20px; }
:host([data-corner^='top'][data-always-open]) .window { top: 20px; }

/* sidebar: full-height panel on one side */
:host([data-layout='sidebar']) .window {
  position: fixed; z-index: 2147483000; top: 0; bottom: 0;
  width: min(var(--h4b-width), 100vw); border-width: 0 0 0 1px;
}
:host([data-layout='sidebar'][data-corner$='right']) .window { right: 0; }
:host([data-layout='sidebar'][data-corner$='left']) .window { left: 0; border-width: 0 1px 0 0; }

/* inline: fills its container (the host decides the size) */
:host([data-layout='inline']) { display: block; height: 100%; }
:host([data-layout='inline']) .window { height: 100%; border-radius: var(--h4b-radius); }
:host([data-layout='inline']) .launcher, :host([data-layout='sidebar']) .launcher[data-hidden] { display: none; }

header {
  display: flex; align-items: center; gap: 10px; padding: 12px 14px;
  background: var(--h4b-primary); color: white;
}
header img { width: 34px; height: 34px; border-radius: 50%; object-fit: cover; background: rgba(255,255,255,.2); }
header .who { flex: 1; min-width: 0; line-height: 1.2; }
header strong { display: block; }
header small { opacity: .85; }
header button { border: 0; background: transparent; color: white; font-size: 18px; padding: 4px 8px; border-radius: 8px; }
header button:hover { background: rgba(255,255,255,.15); }

.log {
  flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 8px;
  background: var(--h4b-surface); scroll-behavior: smooth;
}
.msg { max-width: 85%; padding: 8px 12px; border-radius: 14px; line-height: 1.45; overflow-wrap: anywhere; }
.msg p { margin: 0 0 .5em; } .msg p:last-child { margin-bottom: 0; }
.msg ul, .msg ol { margin: 0 0 .5em; padding-left: 1.2em; }
.msg code { background: rgba(0,0,0,.07); padding: 0 4px; border-radius: 4px; }
.msg a { color: inherit; }
.msg.user { align-self: flex-end; background: var(--h4b-primary); color: white; border-bottom-right-radius: 4px; }
.msg.assistant { align-self: flex-start; background: var(--h4b-bg); border: 1px solid var(--h4b-border); border-bottom-left-radius: 4px; }
.msg img { display: block; max-width: 100%; border-radius: 10px; margin-top: 4px; }
.msg.streaming::after { content: '▍'; animation: blink 1s steps(2) infinite; opacity: .6; }
.msg.pending { display: none; }
.action { align-self: flex-start; font-size: 12px; color: var(--h4b-muted); border: 1px dashed var(--h4b-border); border-radius: 8px; padding: 3px 8px; }
.action.failed { color: var(--h4b-danger); }
.typing { align-self: flex-start; color: var(--h4b-muted); font-size: 20px; letter-spacing: 2px; }
.typing[hidden] { display: none; }
.disclaimer { font-size: 12px; color: var(--h4b-muted); }
.disclaimer summary { cursor: pointer; }
@keyframes blink { 50% { opacity: 0; } }

.status { font-size: 12px; color: var(--h4b-muted); padding: 4px 14px 0; min-height: 20px; }
.status[data-phase='received'], .status[data-phase='acting'] { color: var(--h4b-primary); }
.status[data-phase='error'] { color: var(--h4b-danger); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px 14px 0; }
.chips:empty { display: none; }
.chips button { border: 1px solid var(--h4b-primary); color: var(--h4b-primary); background: transparent; border-radius: 99px; padding: 4px 12px; font-size: 13px; }
.chips button:hover { background: var(--h4b-soft); }
.partial { font-size: 13px; color: var(--h4b-muted); font-style: italic; padding: 4px 14px 0; }
.partial:empty { display: none; }

form { display: flex; gap: 6px; padding: 10px 12px 12px; border-top: 1px solid var(--h4b-border); background: var(--h4b-bg); align-items: center; }
form input { flex: 1; min-width: 0; border: 1px solid var(--h4b-border); background: var(--h4b-surface); border-radius: 99px; padding: 9px 14px; outline: none; }
form input:focus { border-color: var(--h4b-primary); }
form button { border: 0; border-radius: 99px; padding: 8px 12px; background: var(--h4b-primary); color: white; }
form button:hover { background: var(--h4b-primary-hover); }
form button.icon { background: var(--h4b-soft); color: var(--h4b-primary); width: 38px; height: 38px; padding: 0; }
form button.icon[aria-pressed='true'] { background: var(--h4b-primary); color: white; }
form button[hidden] { display: none; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (prefers-reduced-motion: reduce) { .log { scroll-behavior: auto; } .msg.streaming::after { animation: none; } }
`
