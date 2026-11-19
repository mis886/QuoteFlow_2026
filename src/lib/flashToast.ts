// Minimal self-contained error toast (bottom right, 5 s). Moved here from the
// store on 2026-11-19 so pages can show the same toast (e.g. the line-item
// "pick a product from the list" Save block in Enquiry / Quotation / Order).
export function flashErrorToast(msg: string) {
  if (typeof document === 'undefined') return;
  const el = document.createElement('div');
  el.textContent = msg;
  el.setAttribute('role', 'alert');
  el.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;background:#dc2626;color:#fff;padding:12px 16px;border-radius:4px;font-size:12.5px;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,.15);max-width:360px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}
