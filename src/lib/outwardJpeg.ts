// 2026-11-14: Delivery Order as a JPEG — replaces the old DOCX on the
// Outward / DO form. Built FROM the DO PDF (generateOutwardPDF), so the
// image always matches the PDF exactly: the PDF is rendered with pdfjs-dist
// at 2x and every page is stacked into one tall JPEG. The JPEG button and the
// "Email to Client" attachment both call buildOutwardJPEG, so they're identical.

import { generateOutwardPDF } from './pdfGenerator';
import type { OutwardDO, Customer, AppSettings, CompanyUnit } from './types';

const SCALE = 2;
const QUALITY = 0.92;

// DO-<DO number>-<party name>.jpg — spaces → _, anything else odd dropped.
export function outwardJpegFileName(movement: OutwardDO): string {
  const clean = (s: string) => s.trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9_-]/g, '').replace(/_+/g, '_');
  const party = (movement.partyName === 'Other' ? movement.otherParty : movement.partyName) || '';
  const parts = ['DO', clean(movement.doNumber || '') || 'draft', clean(party)].filter(Boolean);
  return parts.join('-') + '.jpg';
}

export async function buildOutwardJPEG(
  movement: OutwardDO,
  customer: Customer | undefined,
  settings: AppSettings | null,
  defaultSignatory: Parameters<typeof generateOutwardPDF>[3],
  unit: CompanyUnit | undefined,
): Promise<{ blob: Blob; fileName: string }> {
  const pdf = await generateOutwardPDF(movement, customer, settings, defaultSignatory, unit, false);
  const bytes = new Uint8Array(pdf.output('arraybuffer') as ArrayBuffer);

  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const doc = await pdfjsLib.getDocument({ data: bytes }).promise;

  try {
    const pages: HTMLCanvasElement[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: SCALE });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport, background: '#ffffff' }).promise;
      pages.push(canvas);
    }

    // Stack every page into one tall image (white behind, since JPEG has no alpha).
    const out = document.createElement('canvas');
    out.width = Math.max(...pages.map(c => c.width));
    out.height = pages.reduce((h, c) => h + c.height, 0);
    const ctx = out.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available in this browser.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    let y = 0;
    for (const c of pages) { ctx.drawImage(c, 0, y); y += c.height; }

    const blob = await new Promise<Blob>((resolve, reject) =>
      out.toBlob(b => (b ? resolve(b) : reject(new Error('Could not create the JPEG.'))), 'image/jpeg', QUALITY));
    return { blob, fileName: outwardJpegFileName(movement) };
  } finally {
    doc.destroy();
  }
}

export async function downloadOutwardJPEG(...args: Parameters<typeof buildOutwardJPEG>): Promise<void> {
  const { blob, fileName } = await buildOutwardJPEG(...args);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) binary += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  return btoa(binary);
}
