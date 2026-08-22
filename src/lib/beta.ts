// Beta flag — set via ?beta=true in URL (persists in localStorage for the session)
// Usage: const isBeta = useBeta()  OR  isBetaActive() for non-component use

const BETA_KEY = 'enqboss_beta';

export function isBetaActive(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('beta') === 'true') {
    localStorage.setItem(BETA_KEY, '1');
    return true;
  }
  if (params.get('beta') === 'false') {
    localStorage.removeItem(BETA_KEY);
    return false;
  }
  return localStorage.getItem(BETA_KEY) === '1';
}
