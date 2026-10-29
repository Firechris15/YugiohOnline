import { useEffect, useRef } from 'react';

/** Lightweight animated star/ember field rendered on a canvas. */
export function Particles({ density = 70, color = '160, 200, 255', className = '' }: { density?: number; color?: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let w = 0;
    let h = 0;
    let raf = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const parts = Array.from({ length: density }, () => ({ x: Math.random(), y: Math.random(), r: 0.4 + Math.random() * 1.6, v: 0.00008 + Math.random() * 0.0003, a: Math.random() * Math.PI * 2, tw: 0.5 + Math.random() }));
    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let t = 0;
    const frame = () => {
      t += 1;
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        if (!reduce) {
          p.y -= p.v * 4;
          p.x += Math.sin(t * 0.004 + p.a) * 0.00012;
          if (p.y < -0.02) {
            p.y = 1.02;
            p.x = Math.random();
          }
        }
        const alpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * 0.02 * p.tw + p.a));
        ctx.beginPath();
        ctx.fillStyle = `rgba(${color}, ${alpha.toFixed(3)})`;
        ctx.arc(p.x * w, p.y * h, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };
    frame();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [density, color]);
  return <canvas ref={ref} className={className} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} aria-hidden="true" />;
}
