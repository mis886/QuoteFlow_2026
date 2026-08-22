import type { Order, Quote } from './types';
import { getS3SignedUrl } from './s3';

export interface SheetsPayload {
  po: (string | number)[];
  items: (string | number)[][];
  orderId: string;
  poNo: string;
  driveFolderId?: string;
  poAttachmentUrl?: string;
  drgAttachmentUrls?: string[];
}

function nowIST(): string {
  return new Date().toLocaleString('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).replace(',', '');
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

async function resolveUrl(storagePath: string): Promise<string> {
  if (storagePath.startsWith('http')) return storagePath;
  return (await getS3SignedUrl(storagePath, false)) ?? '';
}

export async function buildSheetsPayload(
  order: Order,
  quote: Quote | undefined,
  userEmail: string,
  driveFolderId?: string,
): Promise<SheetsPayload> {
  const now = nowIST();
  const quoteValue = quote ? quote.items.reduce((s, i) => s + i.total, 0) : 0;

  // PO file URL — script saves it as PO_<poNo>.<ext>
  const poAttachmentUrl = order.poFileName
    ? await resolveUrl(order.poFileName)
    : undefined;

  // Drawing attachment URLs — script saves each as Drg_<poNo>_N.<ext>
  let drgAttachmentUrls: string[] | undefined;
  if (order.attachments?.length) {
    const urls = await Promise.all(order.attachments.map(a => resolveUrl(a.storagePath)));
    const valid = urls.filter(Boolean);
    if (valid.length) drgAttachmentUrls = valid;
  }

  const po: (string | number)[] = [
    order.id,
    now,
    userEmail,
    order.poNo,
    fmtDate(order.poDate),
    order.cust,
    order.authorizedPerson?.name ?? '',
    order.authorizedPerson?.phone ?? '',
    '',
    order.items.map(i => i.desc).join('; '),
    '',
    '',
    '',   // col 13 — Apps Script fills with Drive link: PO_<poNo>.<ext>
    order.value,
    '',
    quoteValue,
    '',
    fmtDate(order.dlvDate),
    order.items.length,
  ];

  const items: (string | number)[][] = order.items.map(item => [
    now,
    fmtDate(order.poDate),
    order.poNo,
    '',   // col 4  — Apps Script fills Job Card No (JCxxxx)
    '', '',
    '',
    item.desc,
    '', '',
    item.desc,
    item.mat,
    '',
    item.qty,
    item.uom,
    item.agreedRate,
    '',
    fmtDate(order.dlvDate),
    item.drwg ?? '',
    '',   // col 20 — Apps Script fills Drg. Copy link(s)
    '', '',
  ]);

  return {
    po,
    items,
    orderId: order.id,
    poNo: order.poNo,
    driveFolderId: driveFolderId || undefined,
    poAttachmentUrl: poAttachmentUrl || undefined,
    drgAttachmentUrls,
  };
}

export function exportOrderToSheets(webhookUrl: string, payload: SheetsPayload): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', webhookUrl);
    xhr.setRequestHeader('Content-Type', 'text/plain');
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText);
        if (!json.ok) reject(new Error(json.error ?? 'Script error'));
        else resolve(Array.isArray(json.warnings) ? json.warnings : []);
      } catch {
        reject(new Error('Invalid response from Apps Script'));
      }
    };
    xhr.onerror = () => reject(new Error('Network error — check the Web App URL in Settings'));
    xhr.send(JSON.stringify(payload));
  });
}