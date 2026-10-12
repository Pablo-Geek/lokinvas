import type { CanvasDocument, LegacyDocument } from './model';
import { migrateDocument } from './model';

let connection: Promise<IDBDatabase> | undefined;
function database() {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('lokinvas', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('documents');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return connection;
}
export async function loadDocument(): Promise<CanvasDocument | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction('documents').objectStore('documents').get('current');
    request.onsuccess = () => {
      const saved = request.result as CanvasDocument | LegacyDocument | undefined;
      if (!saved) resolve(undefined);
      else if (saved.version === 1 || saved.version === 2) resolve(migrateDocument(saved));
      else reject(new Error('Versión de documento no compatible.'));
    };
    request.onerror = () => reject(request.error);
  });
}
export async function saveDocument(document: CanvasDocument): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('documents', 'readwrite');
    transaction.objectStore('documents').put(document, 'current');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
export async function readImage(file: File): Promise<{ src: string; width: number; height: number }> {
  if (!/^image\/(png|jpeg|webp|gif|svg\+xml|avif|bmp)$/.test(file.type)) throw new Error(`${file.name}: formato no compatible.`);
  if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name}: el límite es 25 MB por imagen.`);
  const src = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`No se pudo leer ${file.name}.`));
    reader.readAsDataURL(file);
  });
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => image.naturalWidth && image.naturalHeight ? resolve({ src, width: image.naturalWidth, height: image.naturalHeight }) : reject(new Error(`${file.name}: imagen vacía.`));
    image.onerror = () => reject(new Error(`${file.name}: no se pudo abrir la imagen.`));
    image.src = src;
  });
}
