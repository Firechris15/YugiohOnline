// Procedural, deterministic card art. Every card gets a unique original
// illustration built from its attribute (palette + environment), its type
// (creature silhouette) and a seed derived from its id. The result is an SVG
// string turned into a cached data URL so it renders fast as an <img>.
import type { CardDef } from '../../engine';
import { SILHOUETTES } from './silhouettes';
import { ARCHETYPE_BY_ID } from '../../engine';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Palette {
  sky: [string, string, string];
  accent: string;
  glow: string;
  ground: string;
}

export const PALETTES: Record<string, Palette> = {
  FIRE: { sky: ['#2a0608', '#8f1d0e', '#ff8a3d'], accent: '#ffb347', glow: '#ffd36b', ground: '#1a0405' },
  WATER: { sky: ['#020c26', '#0a3d7a', '#3fc1ff'], accent: '#7fe3ff', glow: '#b8f3ff', ground: '#021029' },
  EARTH: { sky: ['#140c04', '#5b3b16', '#d9a85b'], accent: '#ffd28a', glow: '#ffe6a8', ground: '#120a03' },
  WIND: { sky: ['#03160f', '#0f5c47', '#77f2c4'], accent: '#a8ffe0', glow: '#e0fff3', ground: '#02120c' },
  LIGHT: { sky: ['#1f1a3a', '#8a6fd1', '#fff1b8'], accent: '#fff3c4', glow: '#ffffff', ground: '#1b1530' },
  DARK: { sky: ['#05030f', '#2b0f4f', '#8b3dff'], accent: '#d29bff', glow: '#f0d6ff', ground: '#04020b' },
  SPELL: { sky: ['#031a17', '#0b5a50', '#3fe0bd'], accent: '#a6ffe9', glow: '#e6fff9', ground: '#021210' },
  TRAP: { sky: ['#1c0410', '#6e1238', '#ff5c93'], accent: '#ffb3cd', glow: '#ffe3ee', ground: '#14030b' },
};

function shift(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  r = Math.max(0, Math.min(255, Math.round(r + amount)));
  g = Math.max(0, Math.min(255, Math.round(g + amount)));
  b = Math.max(0, Math.min(255, Math.round(b + amount)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// ------------------------------------------------------------ environments

function environment(kind: string, r: () => number, p: Palette): string {
  const out: string[] = [];
  switch (kind) {
    case 'FIRE': {
      out.push(`<path d="M0 200 L0 150 L30 120 L55 140 L85 96 L112 132 L140 104 L170 140 L200 118 L200 200 Z" fill="${p.ground}" opacity="0.9"/>`);
      out.push(`<path d="M85 96 L92 112 L80 120 Z" fill="${p.accent}" opacity="0.5"/>`);
      for (let i = 0; i < 22; i++) {
        const x = r() * 200;
        const y = 40 + r() * 150;
        out.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.6 + r() * 2).toFixed(1)}" fill="${r() > 0.5 ? p.glow : p.accent}" opacity="${(0.4 + r() * 0.6).toFixed(2)}"/>`);
      }
      break;
    }
    case 'WATER': {
      for (let i = 0; i < 4; i++) {
        const y = 140 + i * 16;
        const a = 6 + r() * 6;
        out.push(`<path d="M0 ${y} Q25 ${y - a} 50 ${y} T100 ${y} T150 ${y} T200 ${y} L200 200 L0 200 Z" fill="${shift(p.sky[1], -20 - i * 10)}" opacity="${0.55 + i * 0.1}"/>`);
      }
      for (let i = 0; i < 16; i++) {
        out.push(`<circle cx="${(r() * 200).toFixed(1)}" cy="${(r() * 180).toFixed(1)}" r="${(1 + r() * 3.5).toFixed(1)}" fill="none" stroke="${p.glow}" stroke-width="0.8" opacity="${(0.3 + r() * 0.5).toFixed(2)}"/>`);
      }
      out.push(`<path d="M20 0 L60 200 M80 0 L110 200 M150 0 L170 200" stroke="${p.glow}" stroke-width="10" opacity="0.05"/>`);
      break;
    }
    case 'EARTH': {
      out.push(`<path d="M0 200 L0 132 L40 110 L70 128 L104 92 L136 126 L170 104 L200 124 L200 200 Z" fill="${shift(p.ground, 20)}"/>`);
      out.push(`<path d="M0 200 L0 160 L50 146 L100 166 L150 148 L200 162 L200 200 Z" fill="${p.ground}"/>`);
      for (let i = 0; i < 5; i++) {
        const x = 15 + r() * 170;
        const h = 14 + r() * 22;
        out.push(`<path d="M${x} 186 L${x + 6} ${186 - h} L${x + 12} 186 Z" fill="${p.accent}" opacity="0.55"/>`);
      }
      break;
    }
    case 'WIND': {
      for (let i = 0; i < 6; i++) {
        const y = 20 + r() * 160;
        const x = r() * 60;
        out.push(`<path d="M${x} ${y} Q${x + 60} ${y - 26} ${x + 120} ${y} T${x + 220} ${y - 6}" stroke="${p.glow}" stroke-width="${(1 + r() * 2).toFixed(1)}" fill="none" opacity="${(0.15 + r() * 0.3).toFixed(2)}" stroke-linecap="round"/>`);
      }
      for (let i = 0; i < 9; i++) {
        const x = r() * 200;
        const y = r() * 200;
        out.push(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="4" ry="1.6" transform="rotate(${(r() * 180).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="${p.accent}" opacity="0.55"/>`);
      }
      out.push(`<path d="M0 200 L0 170 Q50 150 100 168 T200 160 L200 200 Z" fill="${p.ground}" opacity="0.9"/>`);
      break;
    }
    case 'LIGHT': {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + r() * 0.2;
        const x2 = 100 + Math.cos(a) * 160;
        const y2 = 80 + Math.sin(a) * 160;
        out.push(`<path d="M100 80 L${x2.toFixed(1)} ${y2.toFixed(1)} L${(x2 + 18).toFixed(1)} ${(y2 + 18).toFixed(1)} Z" fill="${p.glow}" opacity="0.07"/>`);
      }
      for (let i = 0; i < 18; i++) {
        const x = r() * 200;
        const y = r() * 200;
        const s = 1 + r() * 2.5;
        out.push(`<path d="M${x} ${y - s * 2} L${x + s * 0.5} ${y} L${x} ${y + s * 2} L${x - s * 0.5} ${y} Z" fill="#fff" opacity="${(0.4 + r() * 0.5).toFixed(2)}"/>`);
      }
      out.push(`<path d="M0 200 L0 172 Q100 150 200 172 L200 200 Z" fill="${p.ground}" opacity="0.6"/>`);
      break;
    }
    case 'DARK': {
      out.push(`<circle cx="${(140 + r() * 30).toFixed(0)}" cy="${(36 + r() * 20).toFixed(0)}" r="20" fill="${p.glow}" opacity="0.85"/>`);
      out.push(`<circle cx="${(148 + r() * 30).toFixed(0)}" cy="${(32 + r() * 20).toFixed(0)}" r="19" fill="${p.sky[1]}"/>`);
      for (let i = 0; i < 26; i++) out.push(`<circle cx="${(r() * 200).toFixed(1)}" cy="${(r() * 120).toFixed(1)}" r="${(0.4 + r() * 1.1).toFixed(1)}" fill="#fff" opacity="${(0.3 + r() * 0.6).toFixed(2)}"/>`);
      out.push(`<path d="M0 200 L0 150 L14 150 L14 120 L22 108 L30 120 L30 150 L160 150 L160 112 L170 96 L180 112 L180 150 L200 150 L200 200 Z" fill="${p.ground}"/>`);
      out.push(`<rect x="0" y="150" width="200" height="50" fill="${p.sky[2]}" opacity="0.08"/>`);
      break;
    }
  }
  return out.join('');
}

// --------------------------------------------------------- spells & traps

const SPELL_ICONS: Record<string, (c: string) => string> = {
  normal: (c) => `<path d="M100 72 L108 94 L131 94 L113 108 L120 130 L100 116 L80 130 L87 108 L69 94 L92 94 Z" fill="${c}" filter="url(#glow)"/>`,
  quickplay: (c) => `<path d="M108 64 L82 106 L98 106 L90 138 L120 92 L103 92 Z" fill="${c}" filter="url(#glow)"/>`,
  continuous: (c) => `<path d="M100 100 C 86 82, 64 86, 64 100 C 64 114, 86 118, 100 100 C 114 82, 136 86, 136 100 C 136 114, 114 118, 100 100 Z" stroke="${c}" stroke-width="6" fill="none" filter="url(#glow)"/>`,
  equip: (c) => `<path d="M97 60 L103 60 L104 118 L100 124 L96 118 Z" fill="${c}" filter="url(#glow)"/><rect x="84" y="118" width="32" height="5" rx="2" fill="${c}"/><rect x="97" y="123" width="6" height="16" fill="${c}"/>`,
  field: (c) => `<path d="M62 128 L84 92 L98 110 L114 84 L140 128 Z" fill="${c}" filter="url(#glow)"/>`,
  counter: (c) => `<path d="M100 66 L130 78 L126 110 Q120 128 100 138 Q80 128 74 110 L70 78 Z" fill="none" stroke="${c}" stroke-width="5" filter="url(#glow)"/><path d="M86 90 L114 118 M114 90 L86 118" stroke="${c}" stroke-width="5"/>`,
  trap: (c) => `<circle cx="100" cy="100" r="16" fill="none" stroke="${c}" stroke-width="4" filter="url(#glow)"/><circle cx="100" cy="100" r="6" fill="${c}"/><path d="M100 70 L100 80 M100 120 L100 130 M70 100 L80 100 M120 100 L130 100" stroke="${c}" stroke-width="4"/>`,
};

function magicCircle(r: () => number, p: Palette, icon: string): string {
  const out: string[] = [];
  const rot = (r() * 60).toFixed(0);
  out.push(`<g transform="rotate(${rot} 100 100)" opacity="0.9">`);
  out.push(`<circle cx="100" cy="100" r="74" fill="none" stroke="${p.accent}" stroke-width="2" opacity="0.8"/>`);
  out.push(`<circle cx="100" cy="100" r="64" fill="none" stroke="${p.accent}" stroke-width="1" opacity="0.6" stroke-dasharray="2 4"/>`);
  out.push(`<circle cx="100" cy="100" r="44" fill="none" stroke="${p.glow}" stroke-width="1.5" opacity="0.7"/>`);
  const n = 6 + Math.floor(r() * 3);
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(`${(100 + Math.cos(a) * 64).toFixed(1)},${(100 + Math.sin(a) * 64).toFixed(1)}`);
  }
  out.push(`<polygon points="${pts.join(' ')}" fill="none" stroke="${p.accent}" stroke-width="1.2" opacity="0.7"/>`);
  const skip = n % 2 === 0 ? 2 : 3;
  const star: string[] = [];
  for (let i = 0; i < n; i++) star.push(pts[(i * skip) % n]);
  out.push(`<polygon points="${star.join(' ')}" fill="none" stroke="${p.glow}" stroke-width="1" opacity="0.45"/>`);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const x = 100 + Math.cos(a) * 69;
    const y = 100 + Math.sin(a) * 69;
    const g = Math.floor(r() * 3);
    const glyph =
      g === 0
        ? `<path d="M${x - 2} ${y - 2} L${x + 2} ${y + 2} M${x + 2} ${y - 2} L${x - 2} ${y + 2}"/>`
        : g === 1
          ? `<circle cx="${x}" cy="${y}" r="1.8"/>`
          : `<path d="M${x} ${y - 2.5} L${x + 2.2} ${y + 1.5} L${x - 2.2} ${y + 1.5} Z"/>`;
    out.push(`<g stroke="${p.glow}" fill="none" stroke-width="0.9" opacity="0.8">${glyph}</g>`);
  }
  out.push('</g>');
  out.push(`<circle cx="100" cy="100" r="40" fill="url(#core)"/>`);
  out.push((SPELL_ICONS[icon] ?? SPELL_ICONS.normal)(p.glow));
  return out.join('');
}

function trapScene(r: () => number, p: Palette, icon: string): string {
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const x = r() * 200;
    const y = r() * 200;
    const s = 10 + r() * 26;
    out.push(`<path d="M${x} ${y} L${x + s} ${y + s * 0.3} L${x + s * 0.4} ${y + s} Z" fill="${p.accent}" opacity="${(0.08 + r() * 0.18).toFixed(2)}" stroke="${p.glow}" stroke-width="0.6"/>`);
  }
  const chain = (x1: number, y1: number, x2: number, y2: number) => {
    const links = 9;
    const parts: string[] = [];
    const ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    for (let i = 0; i <= links; i++) {
      const t = i / links;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      parts.push(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="9" ry="4.5" transform="rotate(${(ang + (i % 2) * 90).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="none" stroke="${p.glow}" stroke-width="2.6" opacity="0.75"/>`);
    }
    return parts.join('');
  };
  out.push(chain(-10, 30 + r() * 20, 210, 150 + r() * 30));
  out.push(chain(-10, 170 - r() * 20, 210, 40 - r() * 20));
  out.push(`<circle cx="100" cy="100" r="42" fill="url(#core)"/>`);
  out.push(`<circle cx="100" cy="100" r="34" fill="none" stroke="${p.accent}" stroke-width="2"/>`);
  out.push((SPELL_ICONS[icon] ?? SPELL_ICONS.trap)(p.glow));
  return out.join('');
}

// ----------------------------------------------------------------- render

function buildSvg(d: CardDef): string {
  const seed = hash(d.id);
  const r = rng(seed);
  const key = d.kind === 'spell' ? 'SPELL' : d.kind === 'trap' ? 'TRAP' : (d.attribute ?? 'LIGHT');
  const base = PALETTES[key];
  const tone = (r() - 0.5) * 30;
  const p: Palette = { ...base, sky: [shift(base.sky[0], tone * 0.3), shift(base.sky[1], tone), shift(base.sky[2], tone * 0.6)] };
  const archColor = d.archetype ? ARCHETYPE_BY_ID[d.archetype]?.color : undefined;
  const angle = Math.floor(r() * 360);
  const boss = d.art?.motif === 'boss' || d.frame === 'fusion';

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice">`);
  parts.push(`<defs>
    <linearGradient id="sky" gradientTransform="rotate(${angle % 40 + 70} 0.5 0.5)"><stop offset="0" stop-color="${p.sky[0]}"/><stop offset="0.55" stop-color="${p.sky[1]}"/><stop offset="1" stop-color="${p.sky[2]}"/></linearGradient>
    <radialGradient id="halo" cx="0.5" cy="0.48" r="0.5"><stop offset="0" stop-color="${p.glow}" stop-opacity="${boss ? 0.55 : 0.32}"/><stop offset="1" stop-color="${p.glow}" stop-opacity="0"/></radialGradient>
    <radialGradient id="core" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${p.glow}" stop-opacity="0.45"/><stop offset="1" stop-color="${p.glow}" stop-opacity="0"/></radialGradient>
    <linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shift(p.sky[0], 12)}"/><stop offset="1" stop-color="#020208"/></linearGradient>
    <radialGradient id="vig" cx="0.5" cy="0.5" r="0.75"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.6"/></radialGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>`);
  parts.push(`<rect width="200" height="200" fill="url(#sky)"/>`);

  if (d.kind === 'monster') {
    parts.push(environment(d.attribute ?? 'LIGHT', r, p));
    parts.push(`<circle cx="100" cy="104" r="${boss ? 96 : 80}" fill="url(#halo)"/>`);
    if (boss) {
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        parts.push(`<path d="M100 104 L${(100 + Math.cos(a) * 120).toFixed(1)} ${(104 + Math.sin(a) * 120).toFixed(1)} L${(100 + Math.cos(a + 0.12) * 120).toFixed(1)} ${(104 + Math.sin(a + 0.12) * 120).toFixed(1)} Z" fill="${archColor ?? p.glow}" opacity="0.12"/>`);
      }
    }
    const sil = SILHOUETTES[d.race ?? 'Warrior'] ?? SILHOUETTES.Warrior;
    const flip = r() > 0.5;
    const scale = (boss ? 1.02 : 0.9) + r() * 0.06;
    const dx = 100 - 100 * scale;
    const dy = 108 - 104 * scale;
    const transform = flip ? `translate(${200 - dx} ${dy}) scale(${-scale} ${scale})` : `translate(${dx} ${dy}) scale(${scale})`;
    const eye = archColor ?? p.glow;
    parts.push(`<g transform="${transform}">${sil({ fill: 'url(#body)', rim: p.accent, eye })}</g>`);
    if (d.frame === 'token') parts.push(`<rect width="200" height="200" fill="#9aa3b5" opacity="0.18"/>`);
  } else if (d.kind === 'spell') {
    if (d.spellType === 'field') {
      const attr = d.archetype ? (ARCHETYPE_BY_ID[d.archetype]?.attribute ?? 'EARTH') : 'EARTH';
      const fp = PALETTES[attr];
      parts.push(`<rect width="200" height="200" fill="${fp.sky[1]}" opacity="0.55"/>`);
      parts.push(environment(attr, r, fp));
      parts.push(`<g opacity="0.85">${magicCircle(r, p, 'field')}</g>`);
    } else {
      parts.push(magicCircle(r, p, d.spellType ?? 'normal'));
    }
  } else {
    parts.push(trapScene(r, p, d.trapType === 'counter' ? 'counter' : d.trapType === 'continuous' ? 'continuous' : 'trap'));
  }
  if (archColor && d.kind !== 'monster') parts.push(`<rect width="200" height="200" fill="${archColor}" opacity="0.08"/>`);
  parts.push(`<rect width="200" height="200" fill="url(#vig)"/>`);
  parts.push(`</svg>`);
  return parts.join('');
}

const cache = new Map<string, string>();

export function cardArtUrl(d: CardDef): string {
  let url = cache.get(d.id);
  if (!url) {
    url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildSvg(d))}`;
    cache.set(d.id, url);
  }
  return url;
}

export function cardArtSvg(d: CardDef): string {
  return buildSvg(d);
}
