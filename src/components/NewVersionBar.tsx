// 2026-11-18: "New version available — Reload". A tab left open keeps running
// the code it loaded, so a deploy does not reach it until someone reloads
// (ORD-2026-838: Step 11 was done from a days-old tab, without the
// auto-Delivered check). Every few minutes, and when the tab comes back into
// view, this fetches the tiny /version.json the build writes (vite.config.ts)
// and compares its buildId with the one baked into this bundle. Different →
// a bar with a Reload button. Never reloads by itself: a half-filled form
// would be lost. Production builds only (the dev server has no version.json).
import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

const CHECK_EVERY_MS = 5 * 60 * 1000;

async function liveBuildId(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body?.buildId === 'string' ? body.buildId : null;
  } catch {
    return null; // offline, or an HTML fallback page — try again next time
  }
}

export function NewVersionBar() {
  const [outdated, setOutdated] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD || outdated) return;
    let stopped = false;
    const check = async () => {
      const live = await liveBuildId();
      if (!stopped && live && live !== __APP_BUILD_ID__) setOutdated(true);
    };
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    const timer = setInterval(check, CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', onVisible);
    check();
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [outdated]);

  if (!outdated) return null;
  return (
    <div role="status" className="fixed top-0 inset-x-0 z-[10000] flex items-center justify-center gap-3 bg-blk text-white text-[12.5px] px-4 py-2 shadow-md">
      <span>New version available — reload to get the latest changes.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-1.5 rounded bg-white text-blk font-semibold px-3 py-1 hover:opacity-90"
      >
        <RefreshCw size={13} /> Reload
      </button>
    </div>
  );
}
