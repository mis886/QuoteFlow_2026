// Single source of truth for how a product is identified across the whole
// production module. Identity is the Type_Model_MOC family code (e.g.
// 'GCH_S121_NBR'), snapshotted onto the job at creation. Falls back to the
// free-text description for legacy / unlinked jobs.

export interface HasProductIdentity {
  family_code?: string | null;
  product_desc?: string | null;
}

/** Returns the product identity to display: family_code, else product_desc, else '—'. */
export function productIdentity(j: HasProductIdentity | null | undefined): string {
  if (!j) return '—';
  const fam = (j.family_code || '').trim();
  if (fam) return fam;
  const desc = (j.product_desc || '').trim();
  return desc || '—';
}
