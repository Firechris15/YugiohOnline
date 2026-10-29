// Inline SVG icons (original designs).
import type { CSSProperties } from 'react';

type P = { size?: number; className?: string; style?: CSSProperties; color?: string };

const svg = (size: number, children: React.ReactNode, p: P, viewBox = '0 0 24 24') => (
  <svg width={size} height={size} viewBox={viewBox} className={p.className} style={p.style} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

export const AttributeGlyph = ({ attr, size = 16 }: { attr: string; size?: number }) => {
  const s = size;
  switch (attr) {
    case 'FIRE':
      return svg(s, <path d="M12 3c2 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3-1-5 1-8z" fill="currentColor" stroke="none" />, {});
    case 'WATER':
      return svg(s, <path d="M12 3c3 5 6 8 6 12a6 6 0 0 1-12 0c0-4 3-7 6-12z" fill="currentColor" stroke="none" />, {});
    case 'EARTH':
      return svg(s, <path d="M2 20 9 7l4 6 3-4 6 11z" fill="currentColor" stroke="none" />, {});
    case 'WIND':
      return svg(
        s,
        <>
          <path d="M3 8h11a3 3 0 1 0-3-3" />
          <path d="M3 13h16a3 3 0 1 1-3 3" />
          <path d="M3 18h7" />
        </>,
        {},
      );
    case 'LIGHT':
      return svg(
        s,
        <>
          <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
        </>,
        {},
      );
    case 'DARK':
      return svg(s, <path d="M15 3a9 9 0 1 0 6 13A7 7 0 0 1 15 3z" fill="currentColor" stroke="none" />, {});
    case 'DIVINE':
      return svg(
        s,
        <>
          <path d="M12 3 22 20H2z" />
          <ellipse cx="12" cy="14" rx="4" ry="2.4" />
          <circle cx="12" cy="14" r="1.3" fill="currentColor" stroke="none" />
        </>,
        {},
      );
    case 'SPELL':
      return svg(
        s,
        <>
          <path d="M12 2l2.4 6.6L21 9l-5 4.3L17.6 20 12 16.3 6.4 20 8 13.3 3 9l6.6-.4z" fill="currentColor" stroke="none" />
        </>,
        {},
      );
    case 'TRAP':
      return svg(
        s,
        <>
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </>,
        {},
      );
    default:
      return null;
  }
};

export const SubtypeGlyph = ({ type, size = 12 }: { type?: string; size?: number }) => {
  switch (type) {
    case 'quickplay':
      return svg(size, <path d="M13 2 5 14h6l-1 8 8-12h-6z" fill="currentColor" stroke="none" />, {});
    case 'continuous':
      return svg(size, <path d="M12 12c-2-3-7-3-7 0s5 3 7 0 7-3 7 0-5 3-7 0z" />, {});
    case 'equip':
      return svg(size, <path d="M14 4 20 4 20 10 9 21 3 15z M5 19l-2 2" />, {});
    case 'field':
      return svg(size, <path d="M2 20 9 8l4 6 3-4 6 10z" fill="currentColor" stroke="none" />, {});
    case 'counter':
      return svg(size, <path d="M12 3 20 6v5c0 5-4 9-8 10-4-1-8-5-8-10V6z M9 9l6 6M15 9l-6 6" />, {});
    default:
      return null;
  }
};

export const Icon = {
  Sword: (p: P) => svg(p.size ?? 14, <path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2" />, p),
  Shield: (p: P) => svg(p.size ?? 14, <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />, p),
  Cards: (p: P) =>
    svg(
      p.size ?? 20,
      <>
        <rect x="3" y="5" width="12" height="16" rx="2" />
        <path d="M8 3h11a2 2 0 0 1 2 2v14" />
      </>,
      p,
    ),
  Hammer: (p: P) => svg(p.size ?? 20, <path d="m15 12-8.5 8.5a2.1 2.1 0 1 1-3-3L12 9M17.6 15 22 10.6 13.4 2 9 6.4z" />, p),
  Chart: (p: P) => svg(p.size ?? 20, <path d="M3 3v18h18M7 15l4-4 3 3 6-7" />, p),
  Swords: (p: P) => svg(p.size ?? 20, <path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M9.5 6.5 14 2h3v3l-4.5 4.5M5 14l-2 2 2 2 2-2" />, p),
  Robot: (p: P) =>
    svg(
      p.size ?? 20,
      <>
        <rect x="4" y="8" width="16" height="12" rx="3" />
        <path d="M12 8V4M9 13h.01M15 13h.01M9 17h6" />
      </>,
      p,
    ),
  Users: (p: P) =>
    svg(
      p.size ?? 20,
      <>
        <circle cx="9" cy="8" r="4" />
        <path d="M2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M22 21a7 7 0 0 0-4-6.3" />
      </>,
      p,
    ),
  Bolt: (p: P) => svg(p.size ?? 20, <path d="M13 2 4 14h7l-1 8 9-12h-7z" />, p),
  Book: (p: P) => svg(p.size ?? 20, <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14zM20 17v4H6.5a2.5 2.5 0 0 1 0-5" />, p),
  Search: (p: P) =>
    svg(
      p.size ?? 18,
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </>,
      p,
    ),
  Close: (p: P) => svg(p.size ?? 18, <path d="M18 6 6 18M6 6l12 12" />, p),
  Plus: (p: P) => svg(p.size ?? 18, <path d="M12 5v14M5 12h14" />, p),
  Copy: (p: P) =>
    svg(
      p.size ?? 16,
      <>
        <rect x="9" y="9" width="12" height="12" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </>,
      p,
    ),
  Trash: (p: P) => svg(p.size ?? 16, <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />, p),
  Edit: (p: P) => svg(p.size ?? 16, <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />, p),
  Volume: (p: P) => svg(p.size ?? 18, <path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />, p),
  Mute: (p: P) => svg(p.size ?? 18, <path d="M11 5 6 9H2v6h4l5 4zM23 9l-6 6M17 9l6 6" />, p),
  Flag: (p: P) => svg(p.size ?? 18, <path d="M4 22V4s1-1 4-1 5 2 8 2 4-1 4-1v12s-1 1-4 1-5-2-8-2-4 1-4 1" />, p),
  Chat: (p: P) => svg(p.size ?? 18, <path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z" />, p),
  Log: (p: P) => svg(p.size ?? 18, <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />, p),
  Globe: (p: P) =>
    svg(
      p.size ?? 18,
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
      </>,
      p,
    ),
  Crown: (p: P) => svg(p.size ?? 18, <path d="M2 18 4 7l5 5 3-8 3 8 5-5 2 11z" />, p),
  Shuffle: (p: P) => svg(p.size ?? 16, <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />, p),
  Link: (p: P) => svg(p.size ?? 16, <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />, p),
  Play: (p: P) => svg(p.size ?? 18, <path d="m6 4 14 8-14 8z" fill="currentColor" />, p),
  Settings: (p: P) =>
    svg(
      p.size ?? 18,
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </>,
      p,
    ),
  Menu: (p: P) => svg(p.size ?? 20, <path d="M3 6h18M3 12h18M3 18h18" />, p),
  Eye: (p: P) =>
    svg(
      p.size ?? 16,
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
        <circle cx="12" cy="12" r="3" />
      </>,
      p,
    ),
};
