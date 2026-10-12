import type { CanvasDocument, View } from './model';

export type CanvasExport = {
  format: 'lokinvas';
  version: 1;
  exportedAt: string;
  document: CanvasDocument;
  view: View;
};

export function exportFilename(name: string): string {
  let base = name.replace(/\.lokinvas$/i, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim().replace(/[. ]+$/, '').slice(0, 120).replace(/[. ]+$/, '');
  if (!base) base = 'Canvas sin título';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base)) base = `Canvas ${base}`;
  return `${base}.lokinvas`;
}

/** Image data is embedded in the document, so the file is independent of IndexedDB. */
export function createCanvasExport(document: CanvasDocument, view: View, date = new Date()) {
  const project: CanvasExport = { format: 'lokinvas', version: 1, exportedAt: date.toISOString(), document, view };
  return { filename: exportFilename(document.name), content: JSON.stringify(project) };
}

export function downloadCanvas(document: CanvasDocument, view: View): void {
  const { filename, content } = createCanvasExport(document, view);
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  try {
    anchor.href = url;
    anchor.download = filename;
    window.document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    // Give the browser time to start reading the file before releasing the Blob.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
