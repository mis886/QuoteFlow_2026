import React from 'react';
import { Eye, Download } from 'lucide-react';

// View (eye) + Download buttons for ONE already-saved document.
// 2026-10-10: added for the Dispatch "Documents Attachment" card, shown only
// for saved files of a Dispatched / Email Sent entry (see NewDispatchEntry.tsx).
//
// Both are <a> tags, not <button>s, on purpose: a <fieldset disabled> (the
// read-only lock used on the Dispatch page) disables every button inside it,
// but never a link — so View / Download keep working for read-only logins.
//
// Download: the plain <a download> attribute is ignored for a file on another
// domain (the browser just opens it), so:
//   (a) Supabase Storage URL → add ?download=<original name>; Storage then
//       sends the file as an attachment with that name.
//   (b) any other URL → fetch it, and save the blob under the original name.
//       If even that fails, open it in a new tab so the user still gets it.

const isSupabaseStorageUrl = (url: string) => /\/storage\/v1\/object\//.test(url);

function withDownloadParam(url: string, name: string): string {
  try {
    const u = new URL(url, window.location.href);
    u.searchParams.set('download', name);
    return u.toString();
  } catch {
    return `${url}${url.includes('?') ? '&' : '?'}download=${encodeURIComponent(name)}`;
  }
}

async function downloadViaBlob(url: string, name: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const objectUrl = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (err) {
    console.error('Download failed, opening the file instead:', err);
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

const iconCls = 'p-1.5 text-g400 hover:text-blue-600 transition-colors shrink-0';

export function DocFileActions({ url, name }: { url: string; name: string }) {
  const fileName = name?.trim() || 'Document';
  const viaParam = isSupabaseStorageUrl(url);
  return (
    <>
      <a href={url} target="_blank" rel="noopener noreferrer" title="View" aria-label={`View ${fileName}`}
        className={iconCls} onClick={e => e.stopPropagation()}>
        <Eye size={14} />
      </a>
      <a href={viaParam ? withDownloadParam(url, fileName) : url} download={fileName} title="Download" aria-label={`Download ${fileName}`}
        className={iconCls}
        onClick={e => {
          e.stopPropagation();
          if (!viaParam) { e.preventDefault(); downloadViaBlob(url, fileName); }
        }}>
        <Download size={14} />
      </a>
    </>
  );
}
