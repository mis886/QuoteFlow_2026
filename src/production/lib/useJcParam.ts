// Reads the `?jc=<jobId>` query param (set by the Job Card Board action links)
// and preselects that Job Card once on mount. Stage Log pages call this so that
// clicking "Mold / Finish / Inspect / PDI" on a job lands with that job already
// chosen — which in turn triggers each page's existing prefill logic.

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

export function useJcParam(setJcId: (id: string) => void) {
  const [params] = useSearchParams();
  const applied = useRef(false);
  useEffect(() => {
    if (applied.current) return;
    const jc = params.get('jc');
    if (jc) {
      applied.current = true;
      setJcId(jc);
    }
    // setJcId is a stable state setter; only depend on the param.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
}
