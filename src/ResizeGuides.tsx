import type { Geometry } from './model';
import type { ResizePreview } from './references';

export default function ResizeGuides({ preview, scale }: { preview: ResizePreview | null; scale: number }) {
  if (!preview?.guides.length) return null;
  const active = preview.geometry;
  const offset = 18 / scale;
  const tick = 4 / scale;
  const label = (x: number, y: number, text: string, key: string) => <g key={key} transform={`translate(${x}, ${y}) scale(${1 / scale})`}><rect x={-43} y={-9} width={86} height={18} rx={4} fill="#b65090" stroke="none" /><text textAnchor="middle" dominantBaseline="central" fill="white" stroke="none" fontSize={9} fontFamily="Segoe UI, sans-serif">{text}</text></g>;
  const dimension = (image: Geometry, axis: 'x' | 'y', value: number, key: string) => {
    if (axis === 'x') {
      const y = image.y - offset;
      return <g key={key}><path d={`M${image.x},${y - tick} V${y + tick} M${image.x},${y} H${image.x + image.width} M${image.x + image.width},${y - tick} V${y + tick}`} />{label(image.x + image.width / 2, y, `↔ ${Math.round(value * 10) / 10} px`, key + '-label')}</g>;
    }
    const x = image.x + image.width + offset;
    return <g key={key}><path d={`M${x - tick},${image.y} H${x + tick} M${x},${image.y} V${image.y + image.height} M${x - tick},${image.y + image.height} H${x + tick}`} />{label(x, image.y + image.height / 2, `↕ ${Math.round(value * 10) / 10} px`, key + '-label')}</g>;
  };
  return <svg className="resize-guides" width="1" height="1" aria-label={preview.mode === 'move' ? 'Guías de referencia de posición' : 'Guías de referencia de tamaño'} role="img" style={{ overflow: 'visible' }}>
    <g stroke="#b65090" strokeWidth={1 / scale} fill="none">
      {preview.guides.map((guide, index) => {
        const reference = guide.reference;
        if (guide.kind === 'alignment') return <path key={index} data-guide="alignment" data-axis={guide.axis} strokeDasharray={`${4 / scale} ${3 / scale}`} d={guide.axis === 'x'
          ? `M${guide.value},${Math.min(active.y, reference.y) - offset} V${Math.max(active.y + active.height, reference.y + reference.height) + offset}`
          : `M${Math.min(active.x, reference.x) - offset},${guide.value} H${Math.max(active.x + active.width, reference.x + reference.width) + offset}`} />;
        return <g key={index} data-guide={`equal-${guide.axis === 'x' ? 'width' : 'height'}`}>
          <rect x={reference.x} y={reference.y} width={reference.width} height={reference.height} strokeDasharray={`${4 / scale} ${3 / scale}`} />
          {dimension(active, guide.axis, guide.value, `active-${index}`)}
          {dimension(reference, guide.axis, guide.value, `reference-${index}`)}
          {guide.axis === 'x'
            ? <path opacity=".6" strokeDasharray={`${3 / scale} ${3 / scale}`} d={`M${active.x + active.width / 2},${active.y - offset} L${reference.x + reference.width / 2},${reference.y - offset}`} />
            : <path opacity=".6" strokeDasharray={`${3 / scale} ${3 / scale}`} d={`M${active.x + active.width + offset},${active.y + active.height / 2} L${reference.x + reference.width + offset},${reference.y + reference.height / 2}`} />}
        </g>;
      })}
    </g>
  </svg>;
}
