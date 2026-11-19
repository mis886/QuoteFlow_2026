// Minimal self-contained error toast (bottom right, 5 s). Moved here from the
// store on 2026-11-19 so pages can show the same toast (e.g. the line-item
// "pick a product from the list" Save block in Enquiry / Quotation / Order).
function flash(msg: string, bg: string, role: string, ms: number) {
  if (typeof document === 'undefined') return;
  const el = document.createElement('div');
  el.textContent = msg;
  el.setAttribute('role', role);
  el.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;background:${bg};color:#fff;padding:12px 16px;border-radius:4px;font-size:12.5px;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,.15);max-width:360px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

export function flashErrorToast(msg: string) {
  flash(msg, '#dc2626', 'alert', 5000);
}

// Success twin of the above (green, 3 s) — used by the ticket status buttons.
export function flashSuccessToast(msg: string) {
  flash(msg, '#16a34a', 'status', 3000);
}
