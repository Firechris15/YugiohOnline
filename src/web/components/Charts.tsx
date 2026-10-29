// Small, dependency-free chart components (validated dark palette:
// categorical slots blue/orange/aqua, diverging blue↔red with a gray midpoint).
import { useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import '../styles/charts.css';

export const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)'];

interface Tip {
  x: number;
  y: number;
  value: ReactNode;
  label: ReactNode;
}

function useTip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const show = (e: React.PointerEvent | React.FocusEvent, value: ReactNode, label: ReactNode) => {
    const host = (e.currentTarget as HTMLElement).closest('.chart') as HTMLElement | null;
    if (!host) return;
    const hr = host.getBoundingClientRect();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = 'clientX' in e ? e.clientX - hr.left : r.left + r.width / 2 - hr.left;
    const y = 'clientY' in e ? e.clientY - hr.top : r.top - hr.top;
    setTip({ x, y, value, label });
  };
  const hide = () => setTip(null);
  const node = tip ? (
    <div className="chart-tip" style={{ left: tip.x, top: tip.y }}>
      <strong>{tip.value}</strong>
      <span>{tip.label}</span>
    </div>
  ) : null;
  return { show, hide, node };
}

/** Single-series column chart (e.g. level curve, duel length histogram). */
export function ColumnChart({ data, height = 140, format = (v) => String(v), ariaLabel }: { data: { label: string; value: number; hint?: string }[]; height?: number; format?: (v: number) => string; ariaLabel: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const tip = useTip();
  return (
    <div className="chart" role="img" aria-label={ariaLabel}>
      <div className="col-chart" style={{ height }}>
        {data.map((d, i) => (
          <div
            key={d.label}
            className="col-slot"
            tabIndex={0}
            onPointerMove={(e) => tip.show(e, format(d.value), d.hint ?? d.label)}
            onPointerLeave={tip.hide}
            onFocus={(e) => tip.show(e, format(d.value), d.hint ?? d.label)}
            onBlur={tip.hide}
          >
            <span className="col-value">{d.value > 0 ? format(d.value) : ''}</span>
            <motion.div className="col-bar" initial={{ height: 0 }} animate={{ height: `${(d.value / max) * 100}%` }} transition={{ duration: 0.6, delay: i * 0.03, ease: [0.22, 1, 0.36, 1] }} />
          </div>
        ))}
      </div>
      <div className="col-axis">
        {data.map((d) => (
          <span key={d.label}>{d.label}</span>
        ))}
      </div>
      {tip.node}
    </div>
  );
}

/** Part-to-whole: one horizontal stacked bar with a legend. */
export function StackedBar({ parts, ariaLabel }: { parts: { label: string; value: number }[]; ariaLabel: string }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  const tip = useTip();
  return (
    <div className="chart" role="img" aria-label={ariaLabel}>
      <div className="stack-bar">
        {parts.map((p, i) =>
          p.value > 0 ? (
            <motion.div
              key={p.label}
              className="stack-seg"
              style={{ background: SERIES[i % SERIES.length] }}
              initial={{ flexGrow: 0 }}
              animate={{ flexGrow: p.value }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              tabIndex={0}
              onPointerMove={(e) => tip.show(e, `${p.value} · ${Math.round((p.value / total) * 100)}%`, p.label)}
              onPointerLeave={tip.hide}
              onFocus={(e) => tip.show(e, `${p.value} · ${Math.round((p.value / total) * 100)}%`, p.label)}
              onBlur={tip.hide}
            />
          ) : null,
        )}
      </div>
      <div className="legend">
        {parts.map((p, i) => (
          <span key={p.label} className="legend-item">
            <i style={{ background: SERIES[i % SERIES.length] }} />
            {p.label}
            <b>{p.value}</b>
          </span>
        ))}
      </div>
      {tip.node}
    </div>
  );
}

/** Horizontal single-series bars with leading icons (identity lives in the label). */
export function BarList({ rows, format = (v) => String(v), ariaLabel }: { rows: { key: string; label: ReactNode; value: number; hint?: string }[]; format?: (v: number) => string; ariaLabel: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const tip = useTip();
  return (
    <div className="chart bar-list" role="img" aria-label={ariaLabel}>
      {rows.map((r, i) => (
        <div
          key={r.key}
          className="bar-row"
          tabIndex={0}
          onPointerMove={(e) => tip.show(e, format(r.value), r.hint ?? r.key)}
          onPointerLeave={tip.hide}
          onFocus={(e) => tip.show(e, format(r.value), r.hint ?? r.key)}
          onBlur={tip.hide}
        >
          <span className="bar-label">{r.label}</span>
          <span className="bar-track">
            <motion.i initial={{ width: 0 }} animate={{ width: `${(r.value / max) * 100}%` }} transition={{ duration: 0.6, delay: i * 0.03 }} />
          </span>
          <span className="bar-value">{format(r.value)}</span>
        </div>
      ))}
      {tip.node}
    </div>
  );
}

/** Diverging bars around a baseline (win rate vs. 50%). */
export function DivergingBars({
  rows,
  baseline = 0.5,
  span = 0.25,
  ariaLabel,
}: {
  rows: { key: string; label: ReactNode; value: number; hint: string }[];
  baseline?: number;
  span?: number;
  ariaLabel: string;
}) {
  const tip = useTip();
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  return (
    <div className="chart div-bars" role="img" aria-label={ariaLabel}>
      <div className="div-scale">
        <span>{pct(baseline - span)}</span>
        <span>{pct(baseline)}</span>
        <span>{pct(baseline + span)}</span>
      </div>
      {rows.map((r, i) => {
        const delta = Math.max(-span, Math.min(span, r.value - baseline));
        const w = (Math.abs(delta) / span) * 50;
        const pos = delta >= 0;
        return (
          <div
            key={r.key}
            className="div-row"
            tabIndex={0}
            onPointerMove={(e) => tip.show(e, pct(r.value), r.hint)}
            onPointerLeave={tip.hide}
            onFocus={(e) => tip.show(e, pct(r.value), r.hint)}
            onBlur={tip.hide}
          >
            <span className="div-label">{r.label}</span>
            <span className="div-track">
              <span className="div-mid" />
              <motion.i
                className={pos ? 'pos' : 'neg'}
                style={pos ? { left: '50%' } : { right: '50%' }}
                initial={{ width: 0 }}
                animate={{ width: `${w}%` }}
                transition={{ duration: 0.7, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
              />
            </span>
            <span className="div-value">{pct(r.value)}</span>
          </div>
        );
      })}
      {tip.node}
    </div>
  );
}

/** Meter: fill on a lighter track of the same ramp. */
export function Meter({ value, label }: { value: number; label?: string }) {
  return (
    <span className="meter" aria-label={label} role="meter" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <motion.i initial={{ width: 0 }} animate={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} transition={{ duration: 0.6 }} />
    </span>
  );
}

/** Diverging cell colour for a win rate (blue = favourable, red = unfavourable, gray midpoint). */
export function divergingColor(v: number, span = 0.3): { bg: string; fg: string } {
  const t = Math.max(-1, Math.min(1, (v - 0.5) / span));
  const mid = [56, 56, 53];
  const pos = [57, 135, 229];
  const neg = [230, 103, 103];
  const to = t >= 0 ? pos : neg;
  const a = Math.abs(t);
  const c = mid.map((m, i) => Math.round(m + (to[i] - m) * a));
  const lum = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  return { bg: `rgb(${c.join(',')})`, fg: lum > 0.55 ? '#0b0b0b' : '#ffffff' };
}

export function StatTile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stat-tile panel">
      <span className="stat-tile-label">{label}</span>
      <span className="stat-tile-value">{value}</span>
      {sub ? <span className="stat-tile-sub">{sub}</span> : null}
    </div>
  );
}
