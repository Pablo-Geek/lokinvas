import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent, ReactNode } from 'react';
import {
  ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, Check, ChevronDown,
  Copy, Eye, EyeOff, Hand, ImagePlus, Layers, Link, LockKeyhole, Maximize,
  Minus, MousePointer2, Plus, Redo2, Sparkles, Trash2, Type, Undo2, UnlockKeyhole, X,
} from 'lucide-react';
import { clamp, commit, createText, fitImages, initialDocument, redo, reorder, transformItem, undo, zoomAt } from './model';
import type { CanvasDocument, CanvasImage, CanvasItem, Geometry, History, ItemPatch, ResizeHandle, View } from './model';
import { constrainSelectionResize, itemsInRect, moveSelectionWithReferences, resizeSelection, resizeSelectionWithReferences, selectionBounds, selectionRect, toggleSelection, translateSelection } from './selection';
import { textHeight } from './text';
import { downloadCanvas } from './export';
import { loadDocument, readImage, saveDocument } from './storage';
import CanvasNode from './CanvasNode';
import ResizeGuides from './ResizeGuides';
import type { ResizePreview } from './references';

const groupHandleLabels: Record<ResizeHandle, string> = { nw: 'superior izquierda', n: 'superior', ne: 'superior derecha', e: 'derecha', se: 'inferior derecha', s: 'inferior', sw: 'inferior izquierda', w: 'izquierda' };

function IconButton({ label, children, active, ...props }: {
  label: string; children: ReactNode; active?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={`icon-button ${active ? 'active' : ''}`} aria-label={label} title={label} {...props}>{children}</button>;
}

function NumericField({ label, value, disabled, onChange }: {
  label: string; value: number; disabled?: boolean; onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(Math.round(value * 10) / 10));
  useEffect(() => setDraft(String(Math.round(value * 10) / 10)), [value]);
  const finish = () => {
    const next = Number(draft);
    if (draft.trim() && Number.isFinite(next)) onChange(next);
    else setDraft(String(Math.round(value * 10) / 10));
  };
  return <label className="numeric-field"><span>{label}</span><input aria-label={label} type="number" step="1" disabled={disabled} value={draft} onChange={event => setDraft(event.target.value)} onBlur={finish} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>;
}

export default function App() {
  const [history, setHistory] = useState<History>({ past: [], present: initialDocument, future: [] });
  const document = history.present;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedItems = document.items.filter(item => selectedIds.includes(item.id));
  const selected = selectedItems.length === 1 ? selectedItems[0] : undefined;
  const selectedId = selected?.id ?? null;
  const setSelectedId = useCallback((id: string | null) => setSelectedIds(id ? [id] : []), []);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [tool, setTool] = useState<'select' | 'hand' | 'text'>('select');
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [space, setSpace] = useState(false);
  const [ratioLocked, setRatioLocked] = useState(true);
  const [resizePreview, setResizePreview] = useState<ResizePreview | null>(null);
  const [ready, setReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Cargando…');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [layerDrag, setLayerDrag] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [marquee, setMarquee] = useState<Geometry | null>(null);
  const [groupOffset, setGroupOffset] = useState<{ ids: string[]; dx: number; dy: number } | null>(null);
  const [groupResizePreview, setGroupResizePreview] = useState<{ ids: string[]; items: CanvasItem[] } | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const pan = useRef<{ x: number; y: number; view: View } | null>(null);
  const groupDrag = useRef<{ pointer: number; x: number; y: number; scale: number; items: CanvasItem[]; ids: string[]; dx: number; dy: number } | null>(null);
  const groupResize = useRef<{ pointer: number; x: number; y: number; scale: number; items: CanvasItem[]; ids: string[]; handle: ResizeHandle; keepRatio: boolean; original: Geometry; bounds: Geometry } | null>(null);
  const marqueeDrag = useRef<{ pointer: number; x: number; y: number; view: View; start: { x: number; y: number }; base: string[]; moved: boolean } | null>(null);
  const initializedView = useRef(false);
  const dragDepth = useRef(0);
  const panning = tool === 'hand' || space;

  const update = useCallback((change: (document: CanvasDocument) => CanvasDocument) => {
    setHistory(current => commit(current, change(current.present)));
  }, []);
  const patchItem = useCallback((id: string, patch: ItemPatch) => {
    update(current => {
      const existing = current.items.find(image => image.id === id);
      if (!existing || !Object.entries(patch).some(([key, value]) => Reflect.get(existing, key) !== value)) return current;
      return { ...current, items: current.items.map(image => image.id === id ? { ...image, ...patch } : image) };
    });
  }, [update]);
  const translateItems = useCallback((ids: string[], dx: number, dy: number) => {
    update(current => {
      const items = translateSelection(current.items, ids, dx, dy);
      return items === current.items ? current : { ...current, items };
    });
  }, [update]);
  const resizeItems = useCallback((ids: string[], original: Geometry, target: Geometry) => {
    update(current => {
      const items = resizeSelection(current.items, ids, original, target);
      return items === current.items ? current : { ...current, items };
    });
  }, [update]);
  const cancelSelectionGesture = useCallback(() => {
    groupDrag.current = null; groupResize.current = null; marqueeDrag.current = null;
    setGroupOffset(null); setGroupResizePreview(null); setMarquee(null); setResizePreview(null);
  }, []);
  const beginGroupDrag = (id: string, event: PointerEvent<HTMLDivElement>) => {
    if (event.shiftKey) {
      event.preventDefault(); event.stopPropagation();
      setSelectedIds(ids => toggleSelection(ids, id));
      return true;
    }
    if (selectedItems.length < 2 || !selectedIds.includes(id)) return false;
    event.preventDefault(); event.stopPropagation();
    const item = document.items.find(item => item.id === id);
    if (item?.locked) return true;
    const ids = selectedItems.map(item => item.id);
    groupDrag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, scale: view.scale, items: document.items, ids, dx: 0, dy: 0 };
    host.current?.setPointerCapture(event.pointerId);
    return true;
  };
  const displayedSelection = selectedItems.filter(item => item.visible).map(item => groupResizePreview?.ids.includes(item.id) ? groupResizePreview.items.find(preview => preview.id === item.id) ?? item : groupOffset?.ids.includes(item.id) && !item.locked ? { ...item, x: item.x + groupOffset.dx, y: item.y + groupOffset.dy } : item);
  const groupBounds = selectedItems.length > 1 ? selectionBounds(displayedSelection) : null;
  const movableCount = selectedItems.filter(item => item.visible && !item.locked).length;
  const groupResizable = selectedItems.length > 1 && movableCount === selectedItems.length;
  const beginGroupResize = (handle: ResizeHandle, event: PointerEvent<HTMLButtonElement>) => {
    if (!groupBounds || !groupResizable || event.button !== 0 || panning || tool !== 'select') return;
    event.preventDefault(); event.stopPropagation();
    groupResize.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, scale: view.scale, items: document.items, ids: selectedIds, handle, keepRatio: ratioLocked, original: groupBounds, bounds: groupBounds };
    host.current?.setPointerCapture(event.pointerId);
  };
  const updateGroupDimension = (dimension: 'width' | 'height', value: number) => {
    if (!groupBounds || !groupResizable) return;
    const target = { ...groupBounds, [dimension]: Math.max(1, value) };
    if (ratioLocked) {
      if (dimension === 'width') target.height = target.width * groupBounds.height / groupBounds.width;
      else target.width = target.height * groupBounds.width / groupBounds.height;
    }
    resizeItems(selectedIds, groupBounds, constrainSelectionResize(document.items, selectedIds, groupBounds, target, 'se', ratioLocked));
  };

  useEffect(() => {
    let mounted = true;
    loadDocument().then(saved => {
      if (mounted && saved?.version === 2) setHistory({ past: [], present: saved, future: [] });
    }).catch(() => { if (mounted) setError('No se pudo recuperar el guardado local. Puedes seguir trabajando.'); })
      .finally(() => { if (mounted) setReady(true); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    setSaveStatus('Guardando…');
    let cancelled = false;
    const timer = setTimeout(() => {
      saveDocument(document).then(() => { if (!cancelled) setSaveStatus('Guardado local'); })
        .catch(() => { if (!cancelled) { setSaveStatus('Sin guardar'); setError('No se pudo guardar en este navegador. Revisa el espacio disponible o los permisos de almacenamiento.'); } });
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [document, ready]);

  useEffect(() => {
    if (!ready) return;
    const flush = () => { if (window.document.visibilityState === 'hidden') void saveDocument(document).catch(() => {}); };
    window.document.addEventListener('visibilitychange', flush);
    return () => window.document.removeEventListener('visibilitychange', flush);
  }, [document, ready]);

  useEffect(() => {
    if (!helpOpen) return;
    const previous = window.document.activeElement as HTMLElement | null;
    const dialog = window.document.querySelector<HTMLElement>('.help-modal');
    dialog?.querySelector<HTMLButtonElement>('button')?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const buttons = dialog?.querySelectorAll<HTMLElement>('button, [href], input, [tabindex="0"]');
      if (!buttons?.length) return;
      const first = buttons[0]; const last = buttons[buttons.length - 1];
      if (event.shiftKey && window.document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && window.document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.document.addEventListener('keydown', trap);
    return () => { window.document.removeEventListener('keydown', trap); previous?.focus(); };
  }, [helpOpen]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (ready && !initializedView.current && host.current) {
      const bounds = host.current.getBoundingClientRect();
      setView(fitImages(document.items, bounds.width, bounds.height));
      initializedView.current = true;
    }
  }, [ready, document.items]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest('textarea')) return;
      event.preventDefault();
      const bounds = element.getBoundingClientRect();
      const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      setView(current => zoomAt(current, point, current.scale * Math.exp(-event.deltaY * .0015)));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);

  const deleteSelected = useCallback(() => {
    const ids = selectedItems.filter(item => !item.locked).map(item => item.id);
    if (!ids.length) return;
    update(current => ({ ...current, items: current.items.filter(item => !ids.includes(item.id)) }));
    setSelectedIds(current => current.filter(id => !ids.includes(id)));
  }, [selectedItems, update]);
  const duplicateSelected = useCallback(() => {
    if (!selectedItems.length) return;
    const copies = selectedItems.map(item => ({ ...item, id: crypto.randomUUID(), name: `${item.name} (copia)`, x: item.x + 24, y: item.y + 24, locked: false }));
    update(current => ({ ...current, items: [...current.items, ...copies] }));
    setSelectedIds(copies.map(item => item.id));
  }, [selectedItems, update]);
  const moveLayer = useCallback((target: number) => {
    if (!selected) return;
    update(current => ({ ...current, items: reorder(current.items, selected.id, target) }));
  }, [selected, update]);
  const fit = useCallback(() => setView(fitImages(document.items, size.width, size.height)), [document.items, size]);
  const zoom = (factor: number) => setView(current => zoomAt(current, { x: size.width / 2, y: size.height / 2 }, current.scale * factor));
  const addText = (x: number, y: number) => {
    if (!ready) return;
    const item = createText(x, y);
    const count = document.items.filter(item => item.kind === 'text').length;
    if (count) item.name = `Texto ${count + 1}`;
    update(current => ({ ...current, items: [...current.items, item] }));
    setSelectedId(item.id); setEditingTextId(item.id); setTool('select');
  };

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (helpOpen) { if (event.key === 'Escape') setHelpOpen(false); return; }
      if (!ready || event.target instanceof HTMLElement && (event.target.closest('input, textarea, select') || event.target.isContentEditable)) return;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (groupResize.current && key !== 'escape') { event.preventDefault(); return; }
      if (event.code === 'Space') { event.preventDefault(); setSpace(true); }
      if (key === 'escape') { cancelSelectionGesture(); setSelectedId(null); setHelpOpen(false); setSpace(false); }
      if (!mod && key === 'v') setTool('select');
      if (!mod && key === 'h') setTool('hand');
      if (!mod && key === 't') setTool('text');
      if (!mod && key === 'f') fit();
      if (mod && key === 'z') { event.preventDefault(); setHistory(current => event.shiftKey ? redo(current) : undo(current)); }
      if (mod && key === 'y') { event.preventDefault(); setHistory(redo); }
      if (mod && key === 'd') { event.preventDefault(); duplicateSelected(); }
      if (mod && key === 'a') { event.preventDefault(); setSelectedIds(document.items.filter(item => item.visible && !item.locked).map(item => item.id)); }
      if (mod && key === 's') { event.preventDefault(); saveDocument(document).then(() => setSaveStatus('Guardado local')).catch(() => setError('No se pudo guardar el canvas.')); }
      if (key === 'delete' || key === 'backspace') { event.preventDefault(); deleteSelected(); }
      if (movableCount && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        const amount = event.shiftKey ? 10 : 1;
        translateItems(selectedIds, event.key === 'ArrowRight' ? amount : event.key === 'ArrowLeft' ? -amount : 0, event.key === 'ArrowDown' ? amount : event.key === 'ArrowUp' ? -amount : 0);
      }
    };
    const release = () => { setSpace(false); pan.current = null; cancelSelectionGesture(); };
    const keyup = (event: KeyboardEvent) => { if (event.code === 'Space') { setSpace(false); pan.current = null; } };
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup); window.addEventListener('blur', release);
    return () => { window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', release); };
  }, [ready, selectedIds, movableCount, document, fit, duplicateSelected, deleteSelected, translateItems, helpOpen, cancelSelectionGesture, setSelectedId]);

  async function importFiles(files: File[], point?: { x: number; y: number }) {
    if (!ready || importing || !files.length) return;
    setImporting(true); setError('');
    const center = point ?? { x: (size.width / 2 - view.x) / view.scale, y: (size.height / 2 - view.y) / view.scale };
    const results = await Promise.allSettled(files.map(async (file, index) => {
      const image = await readImage(file);
      const scale = Math.min(1, 420 / image.width, 420 / image.height);
      const width = image.width * scale; const height = image.height * scale;
      return { id: crypto.randomUUID(), name: file.name, src: image.src, x: center.x - width / 2 + index * 32, y: center.y - height / 2 + index * 32, width, height, naturalWidth: image.width, naturalHeight: image.height, visible: true, locked: false } satisfies CanvasImage;
    }));
    const images = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
    if (images.length) { update(current => ({ ...current, items: [...current.items, ...images] })); setSelectedId(images.at(-1)!.id); setTool('select'); }
    const failures = results.flatMap(result => result.status === 'rejected' ? [result.reason instanceof Error ? result.reason.message : 'No se pudo importar una imagen.'] : []);
    if (failures.length) setError(failures.join(' '));
    setImporting(false);
  }

  async function loadSample() {
    setImporting(true); setError('');
    try {
      const samples = [
        { file: 'arches.svg', name: '01 · Arquitectura', x: -335, y: -205, width: 280, height: 350 },
        { file: 'forms.svg', name: '02 · Formas en equilibrio', x: -10, y: -225, width: 310, height: 239 },
        { file: 'still.svg', name: '03 · La calma de lo simple', x: 25, y: 50, width: 250, height: 300 },
      ];
      const images = await Promise.all(samples.map(async sample => {
        const response = await fetch(`/samples/${sample.file}`);
        if (!response.ok) throw new Error('No se pudo cargar el ejemplo.');
        const decoded = await readImage(new File([await response.blob()], sample.file, { type: 'image/svg+xml' }));
        return { ...sample, id: crypto.randomUUID(), src: decoded.src, naturalWidth: decoded.width, naturalHeight: decoded.height, visible: true, locked: false };
      }));
      update(current => ({ ...current, items: [...current.items, ...images] }));
      setView(fitImages(images, size.width, size.height));
    } catch { setError('No se pudo cargar el ejemplo. Intenta de nuevo.'); }
    finally { setImporting(false); }
  }

  const selectedIndex = document.items.findIndex(image => image.id === selectedId);
  const updateDimension = (key: 'width' | 'height', value: number) => {
    if (!selected || selected.locked) return;
    const ratio = selected.width / selected.height;
    const min = ratioLocked ? key === 'width' ? Math.max(8, 8 * ratio) : Math.max(8, 8 / ratio) : 8;
    const max = ratioLocked ? key === 'width' ? Math.min(20000, 20000 * ratio) : Math.min(20000, 20000 / ratio) : 20000;
    const next = clamp(value, min, max);
    const geometry = { x: selected.x, y: selected.y, width: selected.width, height: selected.height };
    geometry[key] = next;
    if (ratioLocked) {
      if (key === 'width') geometry.height = next / ratio;
      else geometry.width = next * ratio;
    }
    patchItem(selected.id, transformItem(selected, geometry));
  };
  const imageCount = document.items.filter(item => item.kind !== 'text').length;
  const textCount = document.items.length - imageCount;

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="/" aria-label="Lokinvas, inicio"><img src="/favicon.svg" alt="" /><span>lokinvas<span className="brand-dot">.</span></span></a>
      <span className="top-divider" />
      <div className="document-title">
        {renaming ? <input aria-label="Nombre del canvas" autoFocus maxLength={80} defaultValue={document.name} onBlur={event => { const name = event.target.value.trim() || 'Canvas sin título'; if (name !== document.name) update(current => ({ ...current, name })); setRenaming(false); }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setRenaming(false); }} />
          : <button disabled={!ready} onClick={() => setRenaming(true)} title="Cambiar nombre del canvas">{document.name}<ChevronDown size={13} /></button>}
        <span className="save-status" role="status"><span className={`status-dot ${saveStatus === 'Sin guardar' ? 'error' : ''}`} />{saveStatus}</span>
      </div>
      <div className="header-actions">
        <div className="history-buttons"><IconButton label="Deshacer (Ctrl + Z)" disabled={!ready || !history.past.length} onClick={() => setHistory(undo)}><Undo2 size={17} /></IconButton><IconButton label="Rehacer (Ctrl + Shift + Z)" disabled={!ready || !history.future.length} onClick={() => setHistory(redo)}><Redo2 size={17} /></IconButton></div>
        <button className="secondary-button export-button" aria-label="Exportar canvas" title="Descargar el proyecto completo (.lokinvas)" disabled={!ready || importing} onClick={() => { setError(''); try { downloadCanvas(document, view); } catch { setError('No se pudo exportar el canvas. Intenta de nuevo.'); } }}><ArrowDownToLine size={16} /><span>Exportar canvas</span></button>
        <button className="primary-button" disabled={!ready || importing} onClick={() => fileInput.current?.click()}><Plus size={17} />{importing ? 'Importando…' : 'Agregar imágenes'}</button>
        <div className="avatar" aria-label="Espacio personal">L</div>
      </div>
    </header>

    <aside className="layers-panel">
      <div className="panel-heading"><span><Layers size={15} />Capas</span><span className="count">{document.items.length}</span></div>
      <div className="page-label"><span className="page-dot" />Página 01 <span className="page-tag">CANVAS</span></div>
      <div className="layer-list">
        {!document.items.length ? <div className="no-layers"><div className="layer-empty-icon"><Layers size={23} strokeWidth={1.3} /></div><p>Aquí comienza todo</p><span>Las imágenes y los textos<br />aparecerán en este panel.</span></div> : [...document.items].reverse().map(image => <div
          key={image.id} className={`layer-row ${selectedIds.includes(image.id) ? 'selected' : ''} ${!image.visible ? 'muted' : ''} ${layerDrag === image.id ? 'dragging-layer' : ''}`}
          draggable onDragStart={event => { setLayerDrag(image.id); event.dataTransfer.setData('text/plain', image.id); event.dataTransfer.effectAllowed = 'move'; }}
          onDragEnd={() => setLayerDrag(null)} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
          onDrop={event => { event.preventDefault(); const id = event.dataTransfer.getData('text/plain'); if (id !== image.id) update(current => ({ ...current, items: reorder(current.items, id, current.items.findIndex(item => item.id === image.id)) })); setLayerDrag(null); }}
        >
          <button className="layer-select" onClick={event => { if (event.shiftKey) setSelectedIds(ids => toggleSelection(ids, image.id)); else setSelectedId(image.id); setTool('select'); }} aria-label={`Seleccionar ${image.name}`} aria-pressed={selectedIds.includes(image.id)}>{image.kind === 'text' ? <span className="text-layer-icon"><Type size={17} /></span> : <img src={image.src} alt="" />}<span>{image.name}</span></button>
          <IconButton label={`${image.visible ? 'Ocultar' : 'Mostrar'} ${image.name}`} onClick={() => patchItem(image.id, { visible: !image.visible })}>{image.visible ? <Eye size={14} /> : <EyeOff size={14} />}</IconButton>
          <IconButton label={`${image.locked ? 'Desbloquear' : 'Bloquear'} ${image.name}`} onClick={() => patchItem(image.id, { locked: !image.locked })}>{image.locked ? <LockKeyhole size={13} /> : <UnlockKeyhole size={13} />}</IconButton>
        </div>)}
      </div>
      <div className="layers-footnote"><span className="small-label">TU ESPACIO, TUS REGLAS</span><p>Una idea a la vez.<br />O todas al mismo tiempo.</p><span>Hecho para explorar.</span><span className="decorative-asterisk">✳</span></div>
    </aside>

    <main ref={host} className={`canvas-host ${panning ? 'hand-tool' : ''} ${tool === 'text' ? 'text-tool' : ''} ${dragOver ? 'drop-active' : ''}`} aria-label="Canvas de diseño"
      onContextMenu={event => event.preventDefault()}
      onPointerDownCapture={event => {
        if (event.target instanceof HTMLElement && event.target.closest('button, input, textarea, .canvas-overlay')) return;
        if (panning || event.button === 1) {
          event.preventDefault(); pan.current = { x: event.clientX, y: event.clientY, view };
          event.currentTarget.setPointerCapture(event.pointerId);
        } else if (tool === 'text' && event.button === 0) {
          event.preventDefault(); event.stopPropagation();
          const bounds = event.currentTarget.getBoundingClientRect();
          addText((event.clientX - bounds.left - view.x) / view.scale, (event.clientY - bounds.top - view.y) / view.scale);
        } else if (ready && event.button === 0 && (event.target === event.currentTarget || event.target instanceof HTMLElement && event.target.classList.contains('canvas-world'))) {
          event.preventDefault();
          const bounds = event.currentTarget.getBoundingClientRect();
          const start = { x: (event.clientX - bounds.left - view.x) / view.scale, y: (event.clientY - bounds.top - view.y) / view.scale };
          const base = event.shiftKey ? selectedIds : [];
          marqueeDrag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, view, start, base, moved: false };
          setSelectedIds(base);
          event.currentTarget.setPointerCapture(event.pointerId);
        }
      }}
      onPointerMove={event => {
        if (pan.current) setView({ ...pan.current.view, x: pan.current.view.x + event.clientX - pan.current.x, y: pan.current.view.y + event.clientY - pan.current.y });
        const group = groupDrag.current;
        if (group && group.pointer === event.pointerId) {
          const result = moveSelectionWithReferences(group.items, group.ids, (event.clientX - group.x) / group.scale, (event.clientY - group.y) / group.scale, group.scale, event.altKey);
          group.dx = result.dx; group.dy = result.dy;
          setGroupOffset({ ids: group.ids, dx: group.dx, dy: group.dy }); setResizePreview(result.preview);
        }
        const resize = groupResize.current;
        if (resize && resize.pointer === event.pointerId) {
          const result = resizeSelectionWithReferences(resize.items, resize.ids, resize.handle, (event.clientX - resize.x) / resize.scale, (event.clientY - resize.y) / resize.scale, resize.scale, resize.keepRatio, event.altKey);
          if (result.bounds) {
            resize.bounds = result.bounds;
            setGroupResizePreview({ ids: resize.ids, items: result.items }); setResizePreview(result.preview);
          }
        }
        const drag = marqueeDrag.current;
        if (drag && drag.pointer === event.pointerId) {
          if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 3 && !drag.moved) return;
          drag.moved = true;
          const bounds = event.currentTarget.getBoundingClientRect();
          const rect = selectionRect(drag.start, { x: (event.clientX - bounds.left - drag.view.x) / drag.view.scale, y: (event.clientY - bounds.top - drag.view.y) / drag.view.scale });
          setMarquee(rect); setSelectedIds([...new Set([...drag.base, ...itemsInRect(document.items, rect)])]);
        }
      }}
      onPointerUp={event => {
        const group = groupDrag.current;
        if (group && group.pointer === event.pointerId) translateItems(group.ids, group.dx, group.dy);
        const resize = groupResize.current;
        if (resize && resize.pointer === event.pointerId) resizeItems(resize.ids, resize.original, resize.bounds);
        groupDrag.current = null; groupResize.current = null; marqueeDrag.current = null; setGroupOffset(null); setGroupResizePreview(null); setMarquee(null); setResizePreview(null);
        pan.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => { pan.current = null; cancelSelectionGesture(); }}
      onLostPointerCapture={() => { if (groupDrag.current || groupResize.current || marqueeDrag.current) cancelSelectionGesture(); }}
      onDragEnter={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); dragDepth.current++; setDragOver(true); } }}
      onDragLeave={event => { if (event.dataTransfer.types.includes('Files')) { dragDepth.current--; if (dragDepth.current <= 0) setDragOver(false); } }}
      onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }}
      onDrop={event => {
        event.preventDefault(); setDragOver(false); dragDepth.current = 0;
        const bounds = event.currentTarget.getBoundingClientRect();
        void importFiles(Array.from(event.dataTransfer.files), { x: (event.clientX - bounds.left - view.x) / view.scale, y: (event.clientY - bounds.top - view.y) / view.scale });
      }}
      style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${24 * view.scale}px ${24 * view.scale}px` }}
    >
      <div className="canvas-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, pointerEvents: panning ? 'none' : undefined }}>
        {document.items.map(image => <CanvasNode key={image.id} item={image} images={document.items} selected={selectedIds.includes(image.id)} multiple={selectedItems.length > 1} offset={groupOffset?.ids.includes(image.id) && !image.locked ? groupOffset : undefined} preview={groupResizePreview?.ids.includes(image.id) ? groupResizePreview.items.find(item => item.id === image.id) : undefined} scale={view.scale} ratioLocked={ratioLocked} interactive={!panning && tool !== 'text' && ready} editing={editingTextId === image.id} onEdit={() => { setSelectedId(image.id); setEditingTextId(image.id); }} onFinishEdit={() => setEditingTextId(null)} onSelect={() => setSelectedId(image.id)} onGroupStart={event => beginGroupDrag(image.id, event)} onChange={patch => patchItem(image.id, patch)} onReferences={setResizePreview} />)}
        {groupBounds && <div className="selection-group-outline" aria-label="Marco de selección múltiple" style={{ left: groupBounds.x, top: groupBounds.y, width: groupBounds.width, height: groupBounds.height, borderWidth: 1 / view.scale, '--inverse-scale': 1 / view.scale } as CSSProperties}>
          {groupResizable && !panning && tool === 'select' && (['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as ResizeHandle[]).filter(handle => !ratioLocked || handle.length === 2).map(handle => <button key={handle} type="button" tabIndex={-1} className={`resize-handle group-resize-handle handle-${handle}`} aria-label={`Redimensionar conjunto ${groupHandleLabels[handle]}`} onPointerDown={event => beginGroupResize(handle, event)} />)}
          {groupResizable && <span className="dimension-badge">{Math.round(groupBounds.width)} × {Math.round(groupBounds.height)}</span>}
        </div>}
        {marquee && <div className="selection-marquee" aria-label="Área de selección" style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height, borderWidth: 1 / view.scale }} />}
        <ResizeGuides preview={resizePreview} scale={view.scale} />
      </div>

      <div className="canvas-caption canvas-overlay"><span className="canvas-caption-dot" />{tool === 'text' ? 'HAZ CLIC PARA AÑADIR TEXTO' : 'ESPACIO DE TRABAJO'}<span className="canvas-caption-line" /></div>
      {!document.items.length && tool !== 'text' && <div className="empty-canvas canvas-overlay">
        <div className="empty-art" aria-hidden="true"><div className="art-card art-card-back"><div className="art-sun" /><div className="art-mountain" /></div><div className="art-card art-card-front"><div className="art-arch" /></div><div className="art-cursor"><MousePointer2 size={23} fill="#687451" /></div><span className="art-spark">✧</span></div>
        <span className="eyebrow">UN LIENZO. INFINITAS POSIBILIDADES.</span>
        <h1>Dale espacio a tus ideas<span>.</span></h1>
        <p>Arrastra tus imágenes aquí y empieza a crear.<br />Muévelas, cambia su tamaño y encuentra su lugar.</p>
        <button className="primary-button empty-import" disabled={!ready || importing} onClick={() => fileInput.current?.click()}><ImagePlus size={17} />{importing ? 'Importando…' : 'Agregar mis primeras imágenes'}</button>
        <span className="formats">PNG, JPG, WEBP, SVG y más · Hasta 25 MB por imagen</span>
        <button className="sample-button" disabled={!ready || importing} onClick={() => void loadSample()}><Sparkles size={13} />O explora con un ejemplo<span>↗</span></button>
      </div>}
      {dragOver && <div className="drop-overlay"><ImagePlus size={34} /><h2>Suelta tus imágenes aquí</h2><p>Hay espacio para una idea más.</p></div>}
      <div className="floating-toolbar canvas-overlay">
        <IconButton label="Seleccionar (V)" active={tool === 'select' && !space} onClick={() => setTool('select')}><MousePointer2 size={19} /></IconButton>
        <IconButton label="Mover canvas (H)" active={panning} onClick={() => setTool('hand')}><Hand size={19} /></IconButton>
        <IconButton label="Añadir texto (T)" disabled={!ready} active={tool === 'text'} onClick={() => setTool('text')}><Type size={19} /></IconButton>
        <span className="toolbar-divider" />
        <IconButton label="Agregar imágenes" disabled={!ready || importing} onClick={() => fileInput.current?.click()}><ImagePlus size={19} /></IconButton>
      </div>
      <div className="zoom-toolbar canvas-overlay">
        <IconButton label="Alejar" disabled={view.scale <= .1} onClick={() => zoom(1 / 1.2)}><Minus size={15} /></IconButton>
        <button className="zoom-value" title="Restablecer zoom al 100 %" onClick={() => setView(current => zoomAt(current, { x: size.width / 2, y: size.height / 2 }, 1))}>{Math.round(view.scale * 100)}%</button>
        <IconButton label="Acercar" disabled={view.scale >= 4} onClick={() => zoom(1.2)}><Plus size={15} /></IconButton>
        <span className="toolbar-divider" />
        <IconButton label="Ajustar al contenido (F)" onClick={fit}><Maximize size={15} /></IconButton>
      </div>
      {error && <div className="toast canvas-overlay" role="alert"><span>{error}</span><IconButton label="Cerrar aviso" onClick={() => setError('')}><X size={16} /></IconButton></div>}
    </main>

    <aside className="properties-panel">
      <div className="panel-heading"><span>Propiedades</span><span className="panel-heading-dot" /></div>
      {selected ? <div className="selected-properties">
        <div className={`selected-preview ${selected.kind === 'text' ? 'text-preview' : ''}`}>{selected.kind === 'text' ? <span style={{ color: selected.color }}>{selected.text || 'Texto vacío'}</span> : <img src={selected.src} alt={selected.name} />}</div>
        <label className="name-field"><span className="small-label">NOMBRE DE LA CAPA</span><input aria-label="Nombre de la capa" key={selected.id + selected.name} disabled={selected.locked} defaultValue={selected.name} maxLength={160} onBlur={event => { const name = event.target.value.trim(); if (name && name !== selected.name) patchItem(selected.id, { name }); else event.target.value = selected.name; }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>
        {selected.locked && <div className="locked-note"><LockKeyhole size={13} />Capa bloqueada <button onClick={() => patchItem(selected.id, { locked: false })}>Desbloquear</button></div>}
        {selected.kind === 'text' && <section className="property-section text-properties"><h2>Texto</h2>
          <textarea aria-label="Contenido del texto" key={selected.id + selected.text} disabled={selected.locked} defaultValue={selected.text} onBlur={event => { if (event.target.value !== selected.text) patchItem(selected.id, { text: event.target.value, height: textHeight(event.target.value, selected.fontSize, selected.width) }); }} />
          <div className="text-style-fields"><NumericField label="Fuente (px)" value={selected.fontSize} disabled={selected.locked} onChange={value => { const fontSize = clamp(value, 1, 20000); patchItem(selected.id, { fontSize, height: textHeight(selected.text, fontSize, selected.width) }); }} /><label className="text-color"><span>Color</span><input type="color" aria-label="Color del texto" disabled={selected.locked} value={selected.color} onChange={event => patchItem(selected.id, { color: event.target.value })} /></label></div>
          <p className="field-hint">Doble clic para editar en el canvas.</p>
        </section>}
        <section className="property-section"><h2>Posición</h2><div className="field-grid"><NumericField label="X" value={selected.x} disabled={selected.locked} onChange={x => patchItem(selected.id, { x })} /><NumericField label="Y" value={selected.y} disabled={selected.locked} onChange={y => patchItem(selected.id, { y })} /></div></section>
        <section className="property-section"><div className="section-heading"><h2>Tamaño</h2><IconButton label="Mantener proporción" active={ratioLocked} aria-pressed={ratioLocked} disabled={selected.locked} onClick={() => setRatioLocked(!ratioLocked)}><Link size={14} /></IconButton></div><div className="field-grid"><NumericField label="Ancho" value={selected.width} disabled={selected.locked} onChange={value => updateDimension('width', value)} /><NumericField label="Alto" value={selected.height} disabled={selected.locked} onChange={value => updateDimension('height', value)} /></div><p className="field-hint">{ratioLocked ? 'Mantener la proporción actual' : 'Redimensionamiento libre'}</p></section>
        <section className="property-section"><h2>Orden de capas</h2><div className="order-buttons"><IconButton label="Traer al frente" disabled={selectedIndex === document.items.length - 1} onClick={() => moveLayer(document.items.length - 1)}><ArrowUpToLine size={17} /></IconButton><IconButton label="Subir una capa" disabled={selectedIndex === document.items.length - 1} onClick={() => moveLayer(selectedIndex + 1)}><ArrowUp size={17} /></IconButton><IconButton label="Bajar una capa" disabled={selectedIndex === 0} onClick={() => moveLayer(selectedIndex - 1)}><ArrowDown size={17} /></IconButton><IconButton label="Enviar al fondo" disabled={selectedIndex === 0} onClick={() => moveLayer(0)}><ArrowDownToLine size={17} /></IconButton></div><p className="field-hint">También puedes arrastrarlas en el panel.</p></section>
        <div className="selection-actions"><button onClick={duplicateSelected}><Copy size={15} />Duplicar</button><button className="delete-button" disabled={selected.locked} onClick={deleteSelected}><Trash2 size={15} />Eliminar</button></div>
        {selected.kind !== 'text' && <div className="image-info"><span className="small-label">IMAGEN ORIGINAL</span><span>{selected.naturalWidth} × {selected.naturalHeight} px</span></div>}
      </div> : selectedItems.length > 1 ? <div className="selected-properties multi-selection-properties">
        <div className="multi-selection-icon"><Layers size={28} /></div>
        <h2>{selectedItems.length} elementos seleccionados</h2>
        <p>Arrastra cualquiera de los seleccionados para moverlos juntos.</p>
        {groupBounds && <section className="property-section"><h2>Posición del conjunto</h2><div className="field-grid"><NumericField label="X del conjunto" value={groupBounds.x} disabled={!movableCount} onChange={x => translateItems(selectedIds, x - groupBounds.x, 0)} /><NumericField label="Y del conjunto" value={groupBounds.y} disabled={!movableCount} onChange={y => translateItems(selectedIds, 0, y - groupBounds.y)} /></div><p className="field-hint">{Math.round(groupBounds.width)} × {Math.round(groupBounds.height)} px</p></section>}
        {groupBounds && <section className="property-section"><div className="section-heading"><h2>Tamaño del conjunto</h2><IconButton label="Mantener proporción del conjunto" active={ratioLocked} aria-pressed={ratioLocked} disabled={!groupResizable} onClick={() => setRatioLocked(!ratioLocked)}><Link size={14} /></IconButton></div><div className="field-grid"><NumericField label="Ancho del conjunto" value={groupBounds.width} disabled={!groupResizable} onChange={value => updateGroupDimension('width', value)} /><NumericField label="Alto del conjunto" value={groupBounds.height} disabled={!groupResizable} onChange={value => updateGroupDimension('height', value)} /></div><p className="field-hint">{ratioLocked ? 'Escala proporcional de imágenes y textos.' : 'Escala libre del conjunto.'}</p></section>}
        {movableCount < selectedItems.length && <p className="locked-selection-note">Las capas bloqueadas u ocultas permanecen en su lugar.</p>}
        {!groupResizable && <p className="locked-selection-note">Desbloquea y muestra todas las capas seleccionadas para ajustar el tamaño del conjunto.</p>}
        <div className="selection-actions"><button onClick={duplicateSelected}><Copy size={15} />Duplicar</button><button className="delete-button" disabled={selectedItems.every(item => item.locked)} onClick={deleteSelected}><Trash2 size={15} />Eliminar</button></div>
        <div className="multi-selection-tips"><p><kbd>Shift + clic</kbd> Añadir o quitar un elemento.</p><p><kbd>Flechas</kbd> Mover la selección.</p><p><kbd>Alt</kbd> Mover sin ajuste a guías.</p><p><kbd>Esc</kbd> Quitar la selección.</p></div>
      </div> : <div className="no-selection"><div className="selection-illustration"><span /><MousePointer2 size={25} strokeWidth={1.4} /></div><h2>Cada detalle cuenta</h2><p>Selecciona una imagen o texto<br />para ajustar su posición y tamaño.</p><div className="selection-tip"><MousePointer2 size={15} /><span>Shift + clic o arrastra un marco<br />para seleccionar varios elementos.</span></div></div>}
      <div className="local-note"><div className="local-note-icon"><Check size={13} /></div><div><strong>Tu trabajo se queda contigo</strong><p>Guardado en este navegador.<br />Sin cuentas, sin complicaciones.</p></div></div>
    </aside>

    <footer className="statusbar"><span><span className="status-dot" />{textCount ? `${document.items.length} elementos · ${imageCount} imágenes · ${textCount} textos` : `${imageCount} ${imageCount === 1 ? 'imagen' : 'imágenes'} en el canvas`}</span><span className="canvas-instructions">Rueda: zoom<span>·</span>Espacio + arrastrar: mover</span><button aria-label="Atajos de teclado" onClick={() => setHelpOpen(true)}><span className="help-circle" aria-hidden="true">?</span>Atajos de teclado</button></footer>
    <input ref={fileInput} className="file-input" aria-label="Subir imágenes" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/avif,image/bmp" multiple onChange={event => { void importFiles(Array.from(event.target.files ?? [])); event.target.value = ''; }} />

    {helpOpen && <div className="modal-backdrop" onClick={() => setHelpOpen(false)}><div className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={event => event.stopPropagation()}><div className="modal-heading"><h2 id="help-title">Un poco más de fluidez.</h2><IconButton label="Cerrar atajos" onClick={() => setHelpOpen(false)}><X size={18} /></IconButton></div><p>Los atajos para moverte a tu ritmo.</p>{[['Seleccionar', 'V'], ['Añadir/quitar selección', 'Shift + clic'], ['Seleccionar todo', 'Ctrl / ⌘ + A'], ['Añadir texto', 'T + clic'], ['Mover canvas', 'H / Espacio + arrastrar'], ['Ajustar al contenido', 'F'], ['Duplicar imagen', 'Ctrl / ⌘ + D'], ['Deshacer', 'Ctrl / ⌘ + Z'], ['Rehacer', 'Ctrl / ⌘ + Shift + Z'], ['Mover elemento 1 / 10 px', 'Flechas / Shift + flechas'], ['Eliminar elemento', 'Supr / Retroceso'], ['Quitar selección / cerrar', 'Esc']].map(([label, shortcut]) => <div className="shortcut-row" key={label}><span>{label}</span><kbd>{shortcut}</kbd></div>)}<p className="help-bottom">La rueda del mouse controla el zoom. Arrastra las capas para cambiar su orden.</p></div></div>}
  </div>;
}




