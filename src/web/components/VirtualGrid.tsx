// Windowed grid: only the rows in (or near) the viewport are rendered, so the
// full real card pool (~14,000 cards) scrolls smoothly.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

export interface VirtualGridProps<T> {
  items: T[];
  /** minimum column width in px */
  minItemWidth: number;
  /** row height for a given column width */
  rowHeight: (colWidth: number) => number;
  gap: number;
  renderItem: (item: T, index: number) => ReactNode;
  getKey: (item: T) => string;
  /** "window": the page scrolls · "self": the grid is its own scroll container */
  scroller?: 'window' | 'self';
  className?: string;
  style?: CSSProperties;
  overscan?: number;
}

export function VirtualGrid<T>({ items, minItemWidth, rowHeight, gap, renderItem, getKey, scroller = 'window', className = '', style, overscan = 3 }: VirtualGridProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [scroll, setScroll] = useState({ top: 0, height: typeof window === 'undefined' ? 800 : window.innerHeight });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      if (scroller === 'self') setScroll({ top: el.scrollTop, height: el.clientHeight });
      else setScroll({ top: Math.max(0, -el.getBoundingClientRect().top), height: window.innerHeight });
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    const target: HTMLElement | Window = scroller === 'self' ? el : window;
    target.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      target.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [scroller]);

  // Jump back to the top when the list changes (new filter).
  const first = items.length ? getKey(items[0]) : '';
  useEffect(() => {
    if (scroller === 'self' && ref.current) ref.current.scrollTop = 0;
  }, [first, items.length, scroller]);

  const cols = Math.max(1, Math.floor((width + gap) / (minItemWidth + gap)));
  const colWidth = width ? (width - gap * (cols - 1)) / cols : minItemWidth;
  const rowH = rowHeight(colWidth) + gap;
  const rows = Math.ceil(items.length / cols);
  const startRow = Math.max(0, Math.floor(scroll.top / rowH) - overscan);
  const endRow = Math.min(rows, Math.ceil((scroll.top + scroll.height) / rowH) + overscan);
  const slice = items.slice(startRow * cols, endRow * cols);

  return (
    <div ref={ref} className={`vgrid ${className}`} style={{ ...style, position: 'relative', overflowY: scroller === 'self' ? 'auto' : undefined }}>
      <div style={{ height: Math.max(0, rows * rowH - gap), position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            top: startRow * rowH,
            left: 0,
            right: 0,
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridAutoRows: rowH - gap,
            gap,
          }}
        >
          {slice.map((item, i) => (
            <div key={getKey(item)} className="vgrid-cell">
              {renderItem(item, startRow * cols + i)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
