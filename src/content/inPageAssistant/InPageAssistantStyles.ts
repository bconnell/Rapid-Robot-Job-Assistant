export const inPageAssistantStyles = `
  :host {
    all: initial;
    color-scheme: dark;
    --rrja-bg: #07111f;
    --rrja-panel: #0d1b2d;
    --rrja-panel-2: #12243a;
    --rrja-text: #eef6ff;
    --rrja-muted: #a9bad0;
    --rrja-line: #243b55;
    --rrja-blue: #3da5ff;
    --rrja-ok: #72e6ac;
    --rrja-warn: #ffd166;
    --rrja-danger: #ff6b6b;
    font-family: Avenir Next, Segoe UI, Verdana, sans-serif;
  }
  .panel {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 2147483000;
    width: min(390px, calc(100vw - 24px));
    max-height: min(720px, calc(100vh - 24px));
    overflow: hidden;
    border: 1px solid var(--rrja-line);
    border-radius: 18px;
    background: linear-gradient(145deg, rgba(7,17,31,.98), rgba(13,27,45,.98));
    color: var(--rrja-text);
    box-shadow: 0 18px 50px rgba(0,0,0,.38);
  }
  .panel.minimized .body { display: none; }
  .header, .body, .section { display: grid; gap: 10px; }
  .header {
    grid-template-columns: 1fr auto;
    align-items: start;
    padding: 12px;
    border-bottom: 1px solid var(--rrja-line);
  }
  .body {
    padding: 12px;
    max-height: calc(100vh - 120px);
    overflow: auto;
  }
  h2, h3, p { margin: 0; }
  h2 { font-size: 16px; color: var(--rrja-text); }
  h3 { font-size: 13px; color: var(--rrja-text); }
  p, li { color: var(--rrja-muted); font-size: 12px; line-height: 1.4; }
  button {
    border: 0;
    border-radius: 11px;
    padding: 8px 10px;
    color: #02111f;
    background: linear-gradient(135deg, var(--rrja-blue), #8bd0ff);
    cursor: pointer;
    font: inherit;
    font-weight: 700;
  }
  button.secondary {
    color: var(--rrja-text);
    background: var(--rrja-panel-2);
    border: 1px solid var(--rrja-line);
  }
  button:disabled { opacity: .55; cursor: not-allowed; }
  .row { display: flex; gap: 7px; flex-wrap: wrap; align-items: center; }
  .chip {
    display: inline-flex;
    width: fit-content;
    border: 1px solid var(--rrja-line);
    border-radius: 999px;
    padding: 3px 7px;
    color: var(--rrja-muted);
    background: #091827;
    font-size: 11px;
    font-weight: 700;
  }
  .ok { color: var(--rrja-ok); border-color: rgba(114,230,172,.55); }
  .warn { color: var(--rrja-warn); border-color: rgba(255,209,102,.55); }
  .card {
    display: grid;
    gap: 8px;
    border: 1px solid var(--rrja-line);
    border-radius: 14px;
    background: rgba(8,22,37,.72);
    padding: 10px;
  }
  .flow { display: flex; flex-wrap: wrap; gap: 5px; }
  .field {
    display: grid;
    gap: 6px;
    border-top: 1px solid var(--rrja-line);
    padding-top: 8px;
  }
  input[type="text"] {
    width: 100%;
    border: 1px solid var(--rrja-line);
    border-radius: 9px;
    background: #081625;
    color: var(--rrja-text);
    padding: 7px;
    font: inherit;
  }
`;
