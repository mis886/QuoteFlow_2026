// 2026-07-09: verify Cloudflare Git integration auto-build
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// ── [DIAG-R4] TEMPORARY — remove once the dropdown double-click bug is fixed ──
// Traps every write to HTMLSelectElement.prototype.value AND
// HTMLOptionElement.prototype.selected, logging a stack trace each time.
// NOTE: react-dom does NOT set select.value directly for controlled <select>s —
// it walks the <option> children and toggles option.selected on each one
// (see react-dom-client.development.js's updateOptions()). So the .selected
// trap is the one that will actually show React's own reconciliation writes;
// the .value trap is kept in case something else (not React) writes it
// directly. Together they should reveal every write, native or app-code.
(() => {
  const patch = (proto: any, prop: string, tag: string) => {
    const nativeDesc = Object.getOwnPropertyDescriptor(proto, prop);
    if (!nativeDesc || !nativeDesc.get || !nativeDesc.set) return;
    Object.defineProperty(proto, prop, {
      get() { return nativeDesc.get!.call(this); },
      set(v) {
        const el = this as HTMLElement & { id: string; className: string };
        // eslint-disable-next-line no-console
        console.log(`[DIAG-R4][${tag} SET]`, {
          newValue: v,
          oldValue: nativeDesc.get!.call(this),
          text: (this as any).text ?? null,
          value: (this as any).value ?? null,
          id: el.id || null,
          className: el.className || null,
          t: performance.now(),
          stack: new Error().stack,
        });
        return nativeDesc.set!.call(this, v);
      },
      configurable: true,
    });
  };
  patch(HTMLSelectElement.prototype, 'value', 'select.value');
  patch(HTMLOptionElement.prototype, 'selected', 'option.selected');
})();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
