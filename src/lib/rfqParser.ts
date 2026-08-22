// RFQ PDF parser — runs entirely in the browser using pdfjs-dist (already in deps).
// No server, no API. Handles 5 real-world formats seen in rubber/gasket industry RFQs.
//
// Strategy waterfall (tried in order, first non-empty result wins):
//   1. camelotStyle  — detects table structure from text position clusters
//   2. numberedList  — "1. ITEM DESC   QTY : 30 NOS"
//   3. sapNative     — SAP line format: item_no + mat_code + desc + qty + uom
//   4. spaceAligned  — free text with whitespace-separated qty + uom far right

import type { LineItem } from './types';

export interface ParseResult {
  items: LineItem[];
  method: string;
  confidence: number;
  warnings: string[];
  // Raw columns for manual mapping dialog — always populated
  rawHeaders: string[];
  rawRows: string[][];
}

// ── UOM normalisation ─────────────────────────────────────────────────────────
const UOM_SET = new Set([
  'nos','no','ea','each','kg','pcs','pc','set','sets','mtr','m',
  'ltr','l','sht','sheet','roll','pair','pairs','box','boxes',
  'lot','lots','unit','units','length','lengths','rmt','rm',
]);

function normaliseUom(raw: string): string {
  const u = raw.trim().toUpperCase();
  if (UOM_SET.has(u.toLowerCase())) return u;
  // Common OCR/SAP variants
  const map: Record<string,string> = {
    'NOS.':'NOS','NO.':'NOS','PCS.':'PCS','KGS':'KG',
    'MTR':'MTR','MTRS':'MTR','LTRS':'LTR','SHT':'SHT',
  };
  return map[u] ?? u;
}

function cleanNum(s: string): number | null {
  const m = s.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

function cleanDesc(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

// Lines that signal end of item table — stop parsing when matched
const STOP_RE = /^\s*(terms\s*(and|&)\s*conditions?|general\s*terms|special\s*terms|notes?\s*:|note\s*:|remarks?\s*:|payment\s*terms?|delivery\s*terms?|warranty|guarantee|validity|commercial\s*terms?|kindly\s*(send|quote|submit)|please\s*(send|quote|submit|note|confirm|mention)|thank(s|\s*ing)\s*(you|&\s*regards?)|yours?\s*(faithfully|truly|sincerely)|with\s*regards?|regards?[,\s]*$|for\s*and\s*on\s*behalf|authoris[e|z]d\s*signatory|signature|^total$|total\s*amount|grand\s*total|sub[\s-]?total|gst\s*amount|tax\s*amount|amount\s*in\s*words|rupees|end\s*of\s*(order|enquiry|rfq))\b/i;

// Lines to skip silently (page headers/footers that repeat on every page — don't stop, just ignore)
const SKIP_LINE_RE = /^\s*(page\s*\d+\s*of\s*\d+|continued\s*on\s*next\s*page|contd\.?\.?\s*on\s*next|sheet\s*\d+\s*of\s*\d+)\s*$/i;

// ── Text item with position ───────────────────────────────────────────────────
interface TextItem {
  str: string;
  x: number;   // left edge
  y: number;   // baseline (higher = higher on page in PDF coords)
  w: number;   // width
}

// ── Extract positioned text items from all pages ──────────────────────────────
async function extractItems(file: File): Promise<TextItem[]> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const allItems: TextItem[] = [];
  let yOffset = 0;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    for (const item of content.items as any[]) {
      if (!item.str?.trim()) continue;
      allItems.push({
        str: item.str,
        x: Math.round(item.transform[4]),
        // Flip Y: pdfjs Y=0 is bottom; we want Y=0 at top, increasing downward
        y: Math.round(yOffset + (vp.height - item.transform[5])),
        w: Math.round(item.width ?? 0),
      });
    }
    yOffset += vp.height + 20; // gap between pages
  }
  return allItems;
}

// ── Group items into lines by Y proximity ─────────────────────────────────────
function groupIntoLines(items: TextItem[], yTolerance = 4): TextItem[][] {
  if (!items.length) return [];
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: TextItem[][] = [];
  let currentLine: TextItem[] = [sorted[0]];
  let lineY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].y - lineY) <= yTolerance) {
      currentLine.push(sorted[i]);
    } else {
      lines.push(currentLine.sort((a, b) => a.x - b.x));
      currentLine = [sorted[i]];
      lineY = sorted[i].y;
    }
  }
  lines.push(currentLine.sort((a, b) => a.x - b.x));
  return lines;
}

// ── Reconstruct plain text (for regex strategies) ────────────────────────────
function linesToPlainText(lines: TextItem[][]): string {
  return lines
    .map(line => line.map(it => it.str).join(' '))
    .join('\n');
}

// ── Detect column X boundaries from a header line ─────────────────────────────
// Each header cell gives us a column's approximate X range.
interface ColBoundary { canon: string; xMin: number; xMax: number }

const COL_PATTERNS: Record<string, RegExp> = {
  seq:  /^(s\.?no\.?|sr\.?no\.?|item\s*no\.?|line\s*no\.?|sl\.?no\.?|#|no\.|item)$/i,
  mat:  /^(mat\.?\s*code|material\s*(code|no\.?|number)|item\s*code|part\s*no\.?|sap\s*code|pr\s*no\.?|mat\.\s*code|material)$/i,
  hsn:  /^(hsn\s*(code)?|hsn\/sac|hsn\/sac\s*code)$/i,
  desc: /^(description|material\s*desc(ription)?|item\s*desc(ription)?|particulars|goods\s*desc(ription)?|name\s*of\s*item|description\s*of\s*goods?|details|product\s*desc(ription)?)$/i,
  make: /^(make|brand|manufacturer)$/i,
  qty:  /^(qty\.?|quantity|req(uired)?\s*qty|order\s*qty|order\s*quantity)$/i,
  uom:  /^(uom|unit|u\/m|base\s*unit|unit\s*of\s*measure)$/i,
  drwg: /^(dr(a?w(ing)?)?\.?\s*no\.?|dwg\.?\s*no\.?)$/i,
  price: /^(price|rate|unit\s*price|price\s*per\s*unit|net\s*value|amount)$/i,
};


// Merge adjacent TextItems on the SAME Y-line that belong to the same table cell.
// "Same cell" = gap between items is less than the median inter-item gap on that line.
// Works per-line so items from different rows (multi-row header merge) don't bleed together.
function mergeLineCells(lineItems: TextItem[]): TextItem[] {
  if (lineItems.length <= 1) return lineItems;
  const sorted = [...lineItems].sort((a, b) => a.x - b.x);

  // Collect all gaps
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(Math.max(0, sorted[i].x - (sorted[i - 1].x + sorted[i - 1].w)));
  }
  // Median gap — items within one cell have gap << median (e.g., "Name" "of" "Items")
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const median = sortedGaps[Math.floor(sortedGaps.length / 2)] ?? 0;
  // Within-cell threshold: half the median, minimum 2px, maximum 20px
  const threshold = Math.min(Math.max(median * 0.5, 2), 20);

  const cells: TextItem[] = [];
  let current = { ...sorted[0] };
  for (let i = 1; i < sorted.length; i++) {
    const gap = Math.max(0, sorted[i].x - (current.x + current.w));
    if (gap <= threshold) {
      current.str = current.str + ' ' + sorted[i].str;
      current.w = (sorted[i].x + sorted[i].w) - current.x;
    } else {
      cells.push(current);
      current = { ...sorted[i] };
    }
  }
  cells.push(current);
  return cells;
}

function detectXColumns(headerItems: TextItem[]): ColBoundary[] | null {
  // Group headerItems by Y (they may come from multiple merged header lines),
  // merge within-cell words per line, then flatten for pattern matching.
  const byY = new Map<number, TextItem[]>();
  for (const it of headerItems) {
    const key = it.y;
    if (!byY.has(key)) byY.set(key, []);
    byY.get(key)!.push(it);
  }
  const cells: TextItem[] = [];
  for (const lineItems of byY.values()) {
    cells.push(...mergeLineCells(lineItems));
  }

  const cols: ColBoundary[] = [];

  for (const cell of cells) {
    const text = cell.str.trim();
    for (const [canon, re] of Object.entries(COL_PATTERNS)) {
      if (re.test(text) && !cols.find(c => c.canon === canon)) {
        cols.push({ canon, xMin: cell.x - 4, xMax: cell.x + Math.max(cell.w, 30) + 4 });
        break;
      }
    }
  }

  // ── Fallback: infer desc as the unmatched cell with most words / widest span ──
  if (!cols.find(c => c.canon === 'desc') && cols.length >= 2) {
    const matchedXRanges = cols.map(c => ({ xMin: c.xMin, xMax: c.xMax }));
    const unmatched = cells.filter(cell => {
      const xMid = cell.x + (cell.w ?? 0) / 2;
      return !matchedXRanges.some(r => xMid >= r.xMin && xMid <= r.xMax);
    });
    if (unmatched.length > 0) {
      const best = unmatched.reduce((a, b) =>
        (b.str.split(/\s+/).length > a.str.split(/\s+/).length ? b : a)
      );
      cols.push({ canon: 'desc', xMin: best.x - 4, xMax: best.x + Math.max(best.w, 80) + 4 });
    }
  }

  // Need at least: something identifiable + qty or uom
  const hasDesc = cols.find(c => c.canon === 'desc');
  const hasQtyOrUom = cols.find(c => c.canon === 'qty' || c.canon === 'uom');
  return (hasDesc && hasQtyOrUom && cols.length >= 2) ? cols : null;
}

// Assign a text item to the best matching column boundary by X overlap
function assignToCol(item: TextItem, cols: ColBoundary[]): string | null {
  const xMid = item.x + item.w / 2;
  // First try mid-point containment
  for (const col of cols) {
    if (xMid >= col.xMin && xMid <= col.xMax) return col.canon;
  }
  // Fallback: nearest column
  let best: ColBoundary | null = null;
  let bestDist = Infinity;
  for (const col of cols) {
    const colMid = (col.xMin + col.xMax) / 2;
    const dist = Math.abs(xMid - colMid);
    if (dist < bestDist) { bestDist = dist; best = col; }
  }
  return bestDist < 60 ? best!.canon : null;
}

// ── X-position aware table parser ─────────────────────────────────────────────
function tryXColumnTable(lines: TextItem[][]): LineItem[] | null {
  // Find header — try merging up to 3 consecutive lines (SAP uses 2-row headers)
  let headerLineIdx = -1;
  let cols: ColBoundary[] | null = null;

  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    for (let merge = 1; merge <= 3 && i + merge <= lines.length; merge++) {
      const combined = ([] as TextItem[]).concat(...lines.slice(i, i + merge));
      const detected = detectXColumns(combined);
      if (detected) {
        cols = detected;
        headerLineIdx = i + merge - 1; // last merged line index
        break;
      }
    }
    if (cols) break;
  }

  if (headerLineIdx < 0 || !cols) return null;

  // Widen column boundaries: each col extends to the next col's left edge
  cols.sort((a, b) => a.xMin - b.xMin);
  for (let i = 0; i < cols.length - 1; i++) {
    cols[i].xMax = cols[i + 1].xMin - 1;
  }
  cols[cols.length - 1].xMax = 9999;

  const items: LineItem[] = [];
  let seq = 1;

  const seqCol = cols.find(c => c.canon === 'seq');
  const matCol = cols.find(c => c.canon === 'mat');
  // Left-most X across all columns — a lone number here = new row (SAP seq-only line)
  const leftmostX = Math.min(...cols.map(c => c.xMin));

  const dataLines = lines.slice(headerLineIdx + 1);

  type RowCells = Record<string, string[]>;
  const rows: RowCells[] = [];
  let currentRow: RowCells = {};

  const isNewRowLine = (line: TextItem[]): boolean => {
    // Has a number in seq column
    if (seqCol) {
      const inSeq = line.filter(it => {
        const xMid = it.x + (it.w ?? 0) / 2;
        return xMid >= seqCol.xMin && xMid <= seqCol.xMax;
      });
      if (inSeq.some(it => /^\d+$/.test(it.str.trim()))) return true;
    }
    // Has a material/item code in mat column
    if (matCol) {
      const inMat = line.filter(it => {
        const xMid = it.x + (it.w ?? 0) / 2;
        return xMid >= matCol.xMin && xMid <= matCol.xMax;
      });
      if (inMat.some(it => /^\d{4,}/.test(it.str.trim()))) return true;
    }
    // SAP pattern: sole item on line is a small integer at far left (seq on its own line)
    if (line.length === 1 && /^\d{1,3}$/.test(line[0].str.trim()) && line[0].x <= leftmostX + 20) {
      return true;
    }
    return false;
  };

  for (const line of dataLines) {
    const lineText = line.map(it => it.str).join(' ');
    if (STOP_RE.test(lineText)) break;
    if (SKIP_LINE_RE.test(lineText)) continue;

    if (isNewRowLine(line) && Object.keys(currentRow).length > 0) {
      rows.push(currentRow);
      currentRow = {};
    }

    for (const item of line) {
      const canon = assignToCol(item, cols);
      if (!canon) continue;
      if (!currentRow[canon]) currentRow[canon] = [];
      currentRow[canon].push(item.str.trim());
    }
  }
  if (Object.keys(currentRow).length > 0) rows.push(currentRow);

  for (const row of rows) {
    const desc = (row.desc ?? []).join(' ').trim();
    const qtyRaw = (row.qty ?? []).join(' ').trim();
    const uomRaw = (row.uom ?? []).join(' ').trim();
    const mat = (row.mat ?? []).join(' ').replace(/^0+/, '').trim();
    const drwg = (row.drwg ?? []).join(' ').trim();
    const seqRaw = (row.seq ?? []).join(' ').trim();

    if (!desc) continue;
    const qty = cleanNum(qtyRaw);

    // No qty → continuation of previous item's description
    if (qty === null) {
      if (items.length > 0) {
        items[items.length - 1].desc = cleanDesc(items[items.length - 1].desc + ' ' + desc);
      }
      continue;
    }

    const seqNum = cleanNum(seqRaw) ?? seq;
    items.push({
      seq: seqNum,
      desc: cleanDesc(desc),
      mat,
      qty,
      uom: normaliseUom(uomRaw || 'NOS'),
      drwg: drwg.replace(/^[-–]$/, '').trim(),
    });
    seq = seqNum + 1;
  }

  return items.length > 0 ? items : null;
}

// ── Kept for regex strategies ─────────────────────────────────────────────────
async function extractText(file: File): Promise<{ plain: string; lines: TextItem[][] }> {
  const items = await extractItems(file);
  const lines = groupIntoLines(items);
  return { plain: linesToPlainText(lines), lines };
}

// ── Strategy 1b: Text-based table (fallback when X-column table fails) ────────
// Works on plain text. Tries single-space AND multi-space splitting.
// Merges up to 3 header lines. Applies "most words = desc" fallback.

function splitCells(line: string): string[] {
  // Try multi-space split first (preserves more columns)
  const multi = line.split(/\s{2,}|\t/).map(c => c.trim()).filter(Boolean);
  if (multi.length >= 3) return multi;
  // Fall back to single-space split
  return line.split(/\s+/).map(c => c.trim()).filter(Boolean);
}

function detectHeaderRow(lines: string[]): { rowIdx: number; colMap: Record<string, number> } | null {
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    // Merge up to 3 lines for multi-row headers
    for (let merge = 1; merge <= 3 && i + merge <= lines.length; merge++) {
      const merged = lines.slice(i, i + merge).join(' ');
      const cells = splitCells(merged);
      if (cells.length < 2) continue;

      const colMap: Record<string, number> = {};
      for (let ci = 0; ci < cells.length; ci++) {
        for (const [canon, re] of Object.entries(COL_PATTERNS)) {
          if (re.test(cells[ci]) && !(canon in colMap)) {
            colMap[canon] = ci;
            break;
          }
        }
      }

      // Desc fallback: unmatched col with most words that isn't seq/hsn/qty/uom/price
      if (!('desc' in colMap)) {
        const skipCols = new Set(Object.values(colMap));
        let bestIdx = -1, bestWords = 0;
        for (let ci = 0; ci < cells.length; ci++) {
          if (skipCols.has(ci)) continue;
          const words = cells[ci].split(/\s+/).length;
          if (words > bestWords) { bestWords = words; bestIdx = ci; }
        }
        if (bestIdx >= 0) colMap['desc'] = bestIdx;
      }

      if ('desc' in colMap && ('qty' in colMap || 'uom' in colMap)) {
        return { rowIdx: i + merge - 1, colMap };
      }
    }
  }
  return null;
}

function parseTableRows(
  lines: string[],
  startIdx: number,
  colMap: Record<string, number>,
): LineItem[] {
  const items: LineItem[] = [];
  let seq = 1;
  const maxIdx = Math.max(...Object.values(colMap));

  for (let i = startIdx; i < lines.length; i++) {
    if (STOP_RE.test(lines[i])) break;
    if (SKIP_LINE_RE.test(lines[i])) continue;
    const cells = splitCells(lines[i]);
    while (cells.length <= maxIdx) cells.push('');

    const desc    = cells[colMap.desc]  ?? '';
    const qtyRaw  = colMap.qty  !== undefined ? cells[colMap.qty]  ?? '' : '';
    const uomRaw  = colMap.uom  !== undefined ? cells[colMap.uom]  ?? '' : '';
    const mat     = colMap.mat  !== undefined ? cells[colMap.mat]  ?? '' : '';
    const drwg    = colMap.drwg !== undefined ? cells[colMap.drwg] ?? '' : '';
    const seqRaw  = colMap.seq  !== undefined ? cells[colMap.seq]  ?? '' : '';
    const qty     = cleanNum(qtyRaw);

    // Continuation line: desc text but no qty — append to previous item desc
    if (desc && qty === null && items.length > 0) {
      items[items.length - 1].desc = cleanDesc(items[items.length - 1].desc + ' ' + desc);
      continue;
    }

    if (!desc || qty === null) continue;

    const seqNum = cleanNum(seqRaw) ?? seq;
    items.push({
      seq: seqNum,
      desc: cleanDesc(desc),
      mat: mat.replace(/^0+/, '').trim(),
      qty,
      uom: normaliseUom(uomRaw || 'NOS'),
      drwg: drwg.replace(/^[-–]$/, '').trim(),
    });
    seq = seqNum + 1;
  }
  return items;
}

function tryTableStrategy(text: string): LineItem[] | null {
  const lines = text.split('\n').filter(l => l.trim());
  const header = detectHeaderRow(lines);
  if (!header) return null;
  const items = parseTableRows(lines, header.rowIdx + 1, header.colMap);
  return items.length > 0 ? items : null;
}

// ── Strategy 2: Numbered list ─────────────────────────────────────────────────
// Pattern A: "1. ITEM DESC   30 NOS"  (2+ spaces before qty)
const NUMBERED_RE = /^(\d{1,3})[.)]\s{1,3}(.+?)\s{2,}(?:QTY\s*[:\-]?\s*)?(\d+(?:\.\d+)?)\s+([A-Z]{1,6})\s*$/im;
// Pattern B: "1. ITEM DESC  QTY: 30 NOS"  (inline QTY keyword)
const NUMBERED_INLINE_QTY = /^(\d{1,3})[.)]\s{1,3}(.+?)\s+QTY\s*[:\-]?\s*(\d+(?:\.\d+)?)\s+([A-Z]{1,6})/im;
// Pattern C: "1. ITEM DESC 4No"  (qty+uom glued at end, no separator)
// Handles: 4No, 50Mtr, 5NOS, 100Pcs, 20EA — number immediately followed by letters
const NUMBERED_GLUED_RE = /^(\d{1,3})[.)]\s*(.+?)\s+(\d+(?:\.\d+)?)(nos?|pcs?|ea|each|kg|kgs?|mtr?s?|m|ltr?s?|no|sets?|shts?|rmt?)\s*$/im;

function tryNumberedList(text: string): LineItem[] | null {
  const lines = text.split('\n');
  const items: LineItem[] = [];

  for (const line of lines) {
    if (STOP_RE.test(line)) break;

    // Try patterns A and B first (explicit separator), then C (glued)
    const m = NUMBERED_RE.exec(line) || NUMBERED_INLINE_QTY.exec(line);
    if (m) {
      const qty = cleanNum(m[3]);
      if (qty === null) continue;
      items.push({
        seq: parseInt(m[1]),
        desc: cleanDesc(m[2]),
        mat: '',
        qty,
        uom: normaliseUom(m[4]),
        drwg: '',
      });
      continue;
    }

    // Pattern C: qty+uom glued to end of description
    const mg = NUMBERED_GLUED_RE.exec(line);
    if (mg) {
      const qty = cleanNum(mg[3]);
      if (qty === null) continue;
      items.push({
        seq: parseInt(mg[1]),
        desc: cleanDesc(mg[2]),
        mat: '',
        qty,
        uom: normaliseUom(mg[4]),
        drwg: '',
      });
    }
  }
  return items.length > 0 ? items : null;
}

// ── Strategy 3: SAP native format ────────────────────────────────────────────
// "20   00000000002603008  NEOPRENE RUBBER BUSH 62X30X65  100.000  each"
const SAP_LINE_RE = /^(\d{1,4})\s{1,6}(?:0{4,}\d+)?\s*([A-Z][A-Z0-9 ,.\-/"'()&*]+?)\s{2,}(\d+(?:[.,]\d+)?)\s+(each|ea|nos|no|kg|pcs|pc|set|mtr|m|ltr|sht|rmt|rm)\b/im;

function trySapNative(text: string): LineItem[] | null {
  const lines = text.split('\n');
  const items: LineItem[] = [];
  const seen = new Set<number>();

  for (const line of lines) {
    if (STOP_RE.test(line)) break;
    const m = SAP_LINE_RE.exec(line);
    if (!m) continue;
    const seq = parseInt(m[1]);
    if (seen.has(seq)) continue;
    seen.add(seq);
    // Extract material code if present (long zero-padded number after seq)
    const matMatch = line.match(/^\d{1,4}\s{1,6}(0{4,}\d+)/);
    const mat = matMatch ? matMatch[1].replace(/^0+/, '') : '';
    const qty = parseFloat(m[3].replace(',', '.'));
    items.push({
      seq,
      desc: cleanDesc(m[2]),
      mat,
      qty,
      uom: normaliseUom(m[4]),
      drwg: '',
    });
  }
  return items.length > 0 ? items : null;
}

// ── Strategy 4: Space-aligned free text ──────────────────────────────────────
// "CHANNEL PLATE GSKT,PTHE,NT-50X,KELVION              30        EA"
const SPACE_ALIGNED_RE = /^([A-Z][A-Z0-9 ,.\-/"'()&+*]{5,}?)\s{3,}(\d+(?:\.\d+)?)\s{1,8}([A-Z]{1,6})\s*$/im;

function trySpaceAligned(text: string): LineItem[] | null {
  const lines = text.split('\n');
  const items: LineItem[] = [];

  for (const line of lines) {
    if (STOP_RE.test(line)) break;
    const m = SPACE_ALIGNED_RE.exec(line);
    if (!m) continue;
    const qty = cleanNum(m[2]);
    if (qty === null) continue;
    if (!UOM_SET.has(m[3].toLowerCase())) continue; // must be a real UOM token
    items.push({
      seq: items.length + 1,
      desc: cleanDesc(m[1]),
      mat: '',
      qty,
      uom: normaliseUom(m[3]),
      drwg: '',
    });
  }
  return items.length > 0 ? items : null;
}

// ── Build column X-zones from all text items in the document ──────────────────
// Scan the first ~40 lines to find stable X positions that repeat — these are columns.
// Returns sorted column left-edge X values.
function detectColumnZones(lines: TextItem[][]): number[] {
  // Collect all X start positions from the first 40 lines
  const xCounts = new Map<number, number>();
  for (const line of lines.slice(0, 40)) {
    for (const it of line) {
      // Round to nearest 4px to group near-identical positions
      const rx = Math.round(it.x / 4) * 4;
      xCounts.set(rx, (xCounts.get(rx) ?? 0) + 1);
    }
  }
  // Keep X positions that appear in at least 2 different lines (= real column anchor)
  const stable = [...xCounts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([x]) => x)
    .sort((a, b) => a - b);

  if (stable.length < 2) return stable;

  // Merge X positions that are within 12px of each other into a single zone
  const zones: number[] = [stable[0]];
  for (let i = 1; i < stable.length; i++) {
    if (stable[i] - zones[zones.length - 1] > 12) {
      zones.push(stable[i]);
    }
  }
  return zones;
}

// Assign each text item to the nearest column zone, collect cells per zone per line
function buildColumnarRows(
  lines: TextItem[][],
  zones: number[],
): string[][] {
  return lines.map(line => {
    const cells: string[] = new Array(zones.length).fill('');
    for (const it of line) {
      // Find nearest zone
      let best = 0, bestDist = Infinity;
      for (let zi = 0; zi < zones.length; zi++) {
        const dist = Math.abs(it.x - zones[zi]);
        if (dist < bestDist) { bestDist = dist; best = zi; }
      }
      // Only assign if reasonably close (within half the gap to next zone)
      const maxDist = zones.length > 1
        ? Math.min(...zones.slice(1).map((z, i) => (z - zones[i]) / 2))
        : 60;
      if (bestDist <= maxDist + 10) {
        cells[best] = cells[best] ? cells[best] + ' ' + it.str : it.str;
      }
    }
    return cells;
  });
}

// ── Extract raw table rows for manual mapping dialog ─────────────────────────
// Uses X-position clustering on posLines to produce real columnar data.
// Falls back to plain-text splitting if no position data.
function extractRawTable(posLines: TextItem[][], plain: string): { headers: string[]; rows: string[][] } {
  // Try position-aware columnar extraction first
  if (posLines.length > 0) {
    const zones = detectColumnZones(posLines);
    if (zones.length >= 2) {
      // Find the first line that looks like a header (has recognisable column keywords)
      const allRows = buildColumnarRows(posLines, zones);

      // Find header row index: a row where at least 2 cells match known column patterns
      let headerIdx = -1;
      for (let i = 0; i < Math.min(allRows.length, 30); i++) {
        const matchCount = allRows[i].filter(cell =>
          Object.values(COL_PATTERNS).some(re => re.test(cell.trim()))
        ).length;
        // Also accept a row with short cells that look like header labels (all caps, short)
        const shortUpperCount = allRows[i].filter(c => c.trim().length > 0 && c.trim().length < 30 && /^[A-Z0-9 ./#&-]+$/.test(c.trim())).length;
        if (matchCount >= 2 || (matchCount >= 1 && shortUpperCount >= 3)) {
          headerIdx = i;
          break;
        }
      }

      if (headerIdx >= 0) {
        const headers = allRows[headerIdx].map(h => h.trim());
        const dataRows = allRows
          .slice(headerIdx + 1)
          .filter(row => {
            const joined = row.join(' ');
            return !STOP_RE.test(joined) && !SKIP_LINE_RE.test(joined) && row.some(c => c.trim());
          })
          .slice(0, 60);
        return { headers, rows: dataRows };
      }

      // No header found but we have zones — return all rows so user can inspect
      const dataRows = allRows
        .filter(row => row.some(c => c.trim()))
        .slice(0, 60);
      if (dataRows.length > 0) {
        return { headers: zones.map((_, i) => `Col ${i + 1}`), rows: dataRows };
      }
    }
  }

  // Fallback: plain-text splitting
  const textLines = plain.split('\n').filter(l => l.trim());
  const header = detectHeaderRow(textLines);
  if (header) {
    const headers = splitCells(textLines[header.rowIdx]);
    const rows = textLines
      .slice(header.rowIdx + 1)
      .filter(l => !STOP_RE.test(l) && !SKIP_LINE_RE.test(l))
      .slice(0, 60)
      .map(l => splitCells(l));
    return { headers, rows };
  }
  // Free-text / numbered list — single column
  const rows = textLines
    .filter(l => !STOP_RE.test(l) && !SKIP_LINE_RE.test(l))
    .slice(0, 60)
    .map(l => [l.trim()]);
  return { headers: ['Line'], rows };
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function parseRfqPdf(file: File): Promise<ParseResult> {
  const warnings: string[] = [];
  let plain: string;
  let posLines: TextItem[][];

  try {
    const extracted = await extractText(file);
    plain = extracted.plain;
    posLines = extracted.lines;
  } catch (err: any) {
    throw new Error('Could not read PDF: ' + (err?.message ?? 'unknown error'));
  }

  if (!plain.trim()) {
    throw new Error('PDF appears to be a scanned image — text extraction returned nothing. Browser-based parsing requires digitally-generated PDFs.');
  }

  const { headers: rawHeaders, rows: rawRows } = extractRawTable(posLines, plain);

  // 1. X-position aware table parser (handles wrapped cells, multi-row headers)
  const xItems = tryXColumnTable(posLines);
  if (xItems && xItems.length > 0) {
    return { items: xItems.map((it, i) => ({ ...it, seq: i + 1 })), method: 'x_column_table', confidence: 0.92, warnings, rawHeaders, rawRows };
  }

  // 2-5. Text / regex strategies on plain text
  const textStrategies: [string, (t: string) => LineItem[] | null, number][] = [
    ['table_structure', tryTableStrategy, 0.85],
    ['numbered_list',   tryNumberedList,  0.82],
    ['sap_native',      trySapNative,     0.72],
    ['space_aligned',   trySpaceAligned,  0.70],
  ];

  for (const [method, fn, baseConfidence] of textStrategies) {
    const items = fn(plain);
    if (items && items.length > 0) {
      return { items: items.map((it, i) => ({ ...it, seq: i + 1 })), method, confidence: baseConfidence, warnings, rawHeaders, rawRows };
    }
  }

  // Nothing matched — try the Cloudflare Workers AI LLM fallback before giving up.
  const llmItems = await tryLlmFallback(plain);
  if (llmItems && llmItems.length > 0) {
    return {
      items: llmItems.map((it, i) => ({ ...it, seq: i + 1 })),
      method: 'llm_cloudflare',
      confidence: 0.6,
      warnings: [...warnings, 'Items extracted by LLM — verify each row before saving'],
      rawHeaders,
      rawRows,
    };
  }

  // Still nothing — return empty items but provide raw data for manual mapping
  return { items: [], method: 'none', confidence: 0, warnings, rawHeaders, rawRows };
}

// ── Cloudflare Workers AI fallback ────────────────────────────────────────────
// Fires only when every deterministic strategy returns nothing. Configure via Vite env:
//   VITE_RFQ_LLM_URL    = https://<worker>.<account>.workers.dev
//   VITE_RFQ_LLM_SECRET = same value as `wrangler secret put SHARED_SECRET`
async function tryLlmFallback(text: string): Promise<LineItem[] | null> {
  const url = import.meta.env.VITE_RFQ_LLM_URL as string | undefined;
  const secret = import.meta.env.VITE_RFQ_LLM_SECRET as string | undefined;
  if (!url || !secret) return null;

  try {
    // Trim to the Worker's hard cap (60k chars). Items table is usually in the first half.
    const payload = text.length > 60_000 ? text.slice(0, 60_000) : text;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shared-Secret': secret },
      body: JSON.stringify({ text: payload }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { items?: LineItem[] };
    return Array.isArray(data.items) && data.items.length > 0 ? data.items : null;
  } catch {
    return null;
  }
}
