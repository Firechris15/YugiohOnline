// Original stylized creature silhouettes (200x200 space) used by the
// procedural card art generator. Each returns SVG markup; `eye` is the glow
// colour for eyes/gems and `fill` the silhouette fill reference.

export interface SilhouetteParams {
  fill: string; // usually a url(#…) gradient
  rim: string; // rim light colour
  eye: string;
}

const eyes = (pts: [number, number][], r: number, c: string) =>
  pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" filter="url(#glow)"/>`).join('');

export const SILHOUETTES: Record<string, (p: SilhouetteParams) => string> = {
  Dragon: ({ fill, rim, eye }) => `
    <path d="M96 96 L44 28 L60 70 L20 56 L52 92 L14 98 L72 116 Z" fill="${fill}" stroke="${rim}" stroke-width="1.6" opacity="0.92"/>
    <path d="M110 92 L152 20 L146 62 L184 44 L160 86 L194 90 L132 110 Z" fill="${fill}" stroke="${rim}" stroke-width="1.6" opacity="0.92"/>
    <path d="M66 176 Q56 132 84 106 Q100 92 112 80 Q118 70 130 66 L150 58 L164 64 L152 72 L166 80 L148 84 Q136 88 130 98 Q122 114 128 134 Q134 158 118 176 Z" fill="${fill}" stroke="${rim}" stroke-width="2"/>
    <path d="M66 176 Q36 182 24 162 Q44 168 60 158 Z" fill="${fill}" stroke="${rim}" stroke-width="1.5"/>
    <path d="M138 62 L150 40 L146 64 Z M128 68 L132 46 L136 66 Z" fill="${fill}" stroke="${rim}" stroke-width="1.2"/>
    <path d="M86 120 Q96 128 92 142 M98 112 Q110 122 106 138" stroke="${rim}" stroke-width="1.2" fill="none" opacity="0.6"/>
    ${eyes([[146, 71]], 3, eye)}`,

  Spellcaster: ({ fill, rim, eye }) => `
    <path d="M100 60 Q80 102 64 180 L136 180 Q120 102 100 60 Z" fill="${fill}" stroke="${rim}" stroke-width="2"/>
    <path d="M100 14 Q96 34 80 62 L120 62 Q106 40 108 22 Z" fill="${fill}" stroke="${rim}" stroke-width="2"/>
    <ellipse cx="100" cy="62" rx="30" ry="6" fill="${fill}" stroke="${rim}" stroke-width="1.6"/>
    <ellipse cx="100" cy="76" rx="11" ry="12" fill="#05060f"/>
    ${eyes([[95, 75], [105, 75]], 2, eye)}
    <path d="M118 104 Q138 96 142 58 L148 60 Q144 106 124 122 Z" fill="${fill}" stroke="${rim}" stroke-width="1.5"/>
    <path d="M147 40 L134 182" stroke="${rim}" stroke-width="4" stroke-linecap="round"/>
    <circle cx="148" cy="36" r="9" fill="${eye}" filter="url(#glow)" opacity="0.95"/>
    <circle cx="148" cy="36" r="15" fill="none" stroke="${eye}" stroke-width="1" opacity="0.5"/>
    <path d="M82 110 Q100 120 118 110 M78 140 Q100 152 122 140" stroke="${rim}" stroke-width="1.2" fill="none" opacity="0.5"/>`,

  Warrior: ({ fill, rim, eye }) => `
    <path d="M76 92 L124 92 L130 152 L114 182 L86 182 L70 152 Z" fill="${fill}" stroke="${rim}" stroke-width="2"/>
    <path d="M84 54 Q100 36 116 54 L117 84 L83 84 Z" fill="${fill}" stroke="${rim}" stroke-width="2"/>
    <path d="M88 66 L112 66" stroke="${eye}" stroke-width="3" filter="url(#glow)"/>
    <path d="M100 40 Q122 16 136 28 Q116 28 106 46 Z" fill="${eye}" opacity="0.75"/>
    <path d="M46 96 L80 96 L80 134 Q63 156 46 134 Z" fill="${fill}" stroke="${rim}" stroke-width="2"/>
    <path d="M63 106 L63 140 M52 118 L74 118" stroke="${eye}" stroke-width="2" opacity="0.7"/>
    <path d="M137 20 L145 20 L145 124 L141 132 L137 124 Z" fill="${rim}" opacity="0.9"/>
    <rect x="126" y="124" width="30" height="5" rx="2" fill="${fill}" stroke="${rim}" stroke-width="1.5"/>
    <rect x="138" y="129" width="6" height="16" fill="${fill}" stroke="${rim}" stroke-width="1"/>`,

  Beast: ({ fill, rim, eye }) => `
    <path d="M100 166 L70 124 L54 66 L80 92 L90 56 L100 84 L110 56 L120 92 L146 66 L130 124 Z" fill="${fill}" stroke="${rim}" stroke-width="2"/>
    <path d="M86 122 L100 156 L114 122 Q100 128 86 122 Z" fill="#05060f" opacity="0.6"/>
    <path d="M80 96 L94 104 L82 108 Z M120 96 L106 104 L118 108 Z" fill="${eye}" filter="url(#glow)"/>
    <path d="M70 130 L50 140 M72 138 L54 152 M130 130 L150 140 M128 138 L146 152" stroke="${rim}" stroke-width="1.4" opacity="0.6"/>`,

  'Beast-Warrior': ({ fill, rim, eye }) => `
    <path d="M78 92 L122 92 L128 150 L114 182 L86 182 L72 150 Z" fill="${fill}" stroke="${rim}" stroke-width="2"/>
    <path d="M82 84 L76 44 L92 60 Q100 54 108 60 L124 44 L118 84 Q100 96 82 84 Z" fill="${fill}" stroke="${rim}" stroke-width="2"/>
    <path d="M88 70 L96 74 L88 76 Z M112 70 L104 74 L112 76 Z" fill="${eye}" filter="url(#glow)"/>
    <path d="M40 182 L150 24" stroke="${rim}" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M150 24 L160 14 L156 30 Z" fill="${eye}" filter="url(#glow)"/>
    <path d="M60 104 Q74 98 82 106" stroke="${rim}" stroke-width="5" fill="none" stroke-linecap="round"/>`,

  'Winged Beast': ({ fill, rim, eye }) => `
    <path d="M90 102 Q50 58 12 70 Q44 84 38 100 Q60 98 70 118 Z" fill="${fill}" stroke="${rim}" stroke-width="1.8"/>
    <path d="M110 102 Q150 58 188 70 Q156 84 162 100 Q140 98 130 118 Z" fill="${fill}" stroke="${rim}" stroke-width="1.8"/>
    <ellipse cx="100" cy="112" rx="18" ry="32" fill="${fill}" stroke="${rim}" stroke-width="2"/>
    <circle cx="100" cy="72" r="13" fill="${fill}" stroke="${rim}" stroke-width="2"/>
    <path d="M102 74 L114 82 L100 82 Z" fill="${eye}" opacity="0.9"/>
    <path d="M90 140 L100 178 L110 140 Z" fill="${fill}" stroke="${rim}" stroke-width="1.6"/>
    <path d="M30 76 Q50 80 58 94 M170 76 Q150 80 142 94" stroke="${rim}" stroke-width="1" fill="none" opacity="0.6"/>
    ${eyes([[96, 69]], 2.4, eye)}`,

  Machine: ({ fill, rim, eye }) => `
    <circle cx="100" cy="112" r="62" fill="none" stroke="${rim}" stroke-width="7" stroke-dasharray="9 7" opacity="0.35"/>
    <rect x="68" y="86" width="64" height="58" rx="8" fill="${fill}" stroke="${rim}" stroke-width="2"/>
    <rect x="80" y="52" width="40" height="30" rx="6" fill="${fill}" stroke="${rim}" stroke-width="2"/>
    <rect x="86" y="62" width="28" height="7" rx="3" fill="${eye}" filter="url(#glow)"/>
    <rect x="44" y="90" width="20" height="46" rx="6" fill="${fill}" stroke="${rim}" stroke-width="1.8"/>
    <rect x="136" y="90" width="20" height="46" rx="6" fill="${fill}" stroke="${rim}" stroke-width="1.8"/>
    <rect x="76" y="146" width="18" height="34" rx="5" fill="${fill}" stroke="${rim}" stroke-width="1.8"/>
    <rect x="106" y="146" width="18" height="34" rx="5" fill="${fill}" stroke="${rim}" stroke-width="1.8"/>
    <circle cx="100" cy="114" r="11" fill="none" stroke="${eye}" stroke-width="3" filter="url(#glow)"/>
    <path d="M100 52 L100 38" stroke="${rim}" stroke-width="2"/><circle cx="100" cy="36" r="3" fill="${eye}"/>`,

  Fiend: ({ fill, rim, eye }) => `
    <path d="M100 168 Q64 152 60 112 Q58 82 80 66 L66 26 L94 60 Q100 56 106 60 L134 26 L120 66 Q142 82 140 112 Q136 152 100 168 Z" fill="${fill}" stroke="${rim}" stroke-width="2"/>
    <path d="M76 100 L94 108 L78 112 Z M124 100 L106 108 L122 112 Z" fill="${eye}" filter="url(#glow)"/>
    <path d="M82 136 L88 142 L94 134 L100 142 L106 134 L112 142 L118 136" stroke="${eye}" stroke-width="2" fill="none" opacity="0.85"/>
    <path d="M40 150 Q60 120 62 100 M160 150 Q140 120 138 100" stroke="${rim}" stroke-width="1.4" fill="none" opacity="0.5"/>`,

  Zombie: ({ fill, rim, eye }) => `
    <path d="M100 26 Q154 36 152 112 L142 182 L58 182 L48 112 Q46 36 100 26 Z" fill="${fill}" stroke="${rim}" stroke-width="2"/>
    <ellipse cx="100" cy="102" rx="25" ry="29" fill="#d9d4c7" opacity="0.18"/>
    <ellipse cx="90" cy="96" rx="7" ry="8" fill="#05060f"/><ellipse cx="110" cy="96" rx="7" ry="8" fill="#05060f"/>
    ${eyes([[90, 97], [110, 97]], 2.6, eye)}
    <path d="M100 106 L96 114 L104 114 Z" fill="#05060f"/>
    <path d="M86 122 L114 122 M90 118 L90 126 M96 118 L96 126 M102 118 L102 126 M108 118 L108 126" stroke="${rim}" stroke-width="1.4" opacity="0.8"/>
    <path d="M62 150 Q80 160 100 150 Q120 160 138 150" stroke="${rim}" stroke-width="1.2" fill="none" opacity="0.5"/>`,

  Fairy: ({ fill, rim, eye }) => `
    <path d="M96 92 Q38 38 26 112 Q54 96 60 132 Q76 110 94 114 Z" fill="${fill}" stroke="${rim}" stroke-width="1.6" opacity="0.9"/>
    <path d="M104 92 Q162 38 174 112 Q146 96 140 132 Q124 110 106 114 Z" fill="${fill}" stroke="${rim}" stroke-width="1.6" opacity="0.9"/>
    <ellipse cx="100" cy="40" rx="20" ry="5.5" fill="none" stroke="${eye}" stroke-width="3" filter="url(#glow)"/>
    <circle cx="100" cy="62" r="12" fill="${fill}" stroke="${rim}" stroke-width="2"/>
    <path d="M100 74 Q86 112 72 176 L128 176 Q114 112 100 74 Z" fill="${fill}" stroke="${rim}" stroke-width="2"/>
    <path d="M40 70 Q60 80 70 100 M160 70 Q140 80 130 100" stroke="${rim}" stroke-width="1" fill="none" opacity="0.6"/>
    ${eyes([[96, 61], [104, 61]], 1.8, eye)}`,

  Aqua: ({ fill, rim, eye }) => `
    <path d="M56 104 Q56 46 100 44 Q144 46 144 104 Q122 94 100 104 Q78 94 56 104 Z" fill="${fill}" stroke="${rim}" stroke-width="2"/>
    <path d="M66 104 Q60 130 72 150 Q80 166 70 182 M84 102 Q80 136 92 156 Q98 170 92 184 M100 104 Q104 140 98 184 M116 102 Q120 136 108 156 Q102 170 108 184 M134 104 Q140 130 128 150 Q120 166 130 182" stroke="${rim}" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.85"/>
    ${eyes([[86, 80], [114, 80]], 4, eye)}
    <path d="M70 62 Q100 50 130 62" stroke="${eye}" stroke-width="1.4" fill="none" opacity="0.5"/>`,

  'Sea Serpent': ({ fill, rim, eye }) => `
    <path d="M36 170 C 60 120, 142 156, 152 112 S 76 62, 116 40" stroke="${rim}" stroke-width="26" fill="none" stroke-linecap="round" opacity="0.35"/>
    <path d="M36 170 C 60 120, 142 156, 152 112 S 76 62, 116 40" stroke="${fill}" stroke-width="20" fill="none" stroke-linecap="round"/>
    <path d="M60 140 L52 124 L68 132 Z M110 138 L106 120 L120 132 Z M140 96 L150 80 L150 100 Z M98 84 L90 68 L104 76 Z" fill="${rim}" opacity="0.8"/>
    <ellipse cx="124" cy="36" rx="18" ry="11" transform="rotate(-25 124 36)" fill="${fill}" stroke="${rim}" stroke-width="2"/>
    ${eyes([[130, 31]], 2.8, eye)}`,

  Plant: ({ fill, rim, eye }) => `
    <path d="M90 180 L95 112 Q78 96 66 70 L76 72 Q88 92 100 100 Q112 92 124 72 L134 70 Q122 96 105 112 L110 180 Z" fill="${fill}" stroke="${rim}" stroke-width="2"/>
    <circle cx="100" cy="56" r="30" fill="${fill}" stroke="${rim}" stroke-width="2"/>
    <circle cx="68" cy="70" r="22" fill="${fill}" stroke="${rim}" stroke-width="2"/>
    <circle cx="132" cy="70" r="22" fill="${fill}" stroke="${rim}" stroke-width="2"/>
    <circle cx="100" cy="34" r="18" fill="${fill}" stroke="${rim}" stroke-width="2"/>
    ${eyes([[94, 136], [106, 136]], 2.6, eye)}
    <circle cx="80" cy="50" r="3" fill="${eye}" opacity="0.7"/><circle cx="122" cy="58" r="2.5" fill="${eye}" opacity="0.7"/><circle cx="104" cy="28" r="2.5" fill="${eye}" opacity="0.7"/>
    <path d="M90 180 Q70 184 56 178 M110 180 Q130 184 144 178" stroke="${rim}" stroke-width="2" fill="none"/>`,

  Rock: ({ fill, rim, eye }) => `
    <path d="M70 84 L88 64 L114 62 L132 82 L136 136 L116 160 L86 160 L66 136 Z" fill="${fill}" stroke="${rim}" stroke-width="2"/>
    <path d="M86 40 L114 38 L120 60 L82 62 Z" fill="${fill}" stroke="${rim}" stroke-width="2"/>
    <path d="M40 92 L66 86 L64 140 L44 150 Z M160 92 L134 86 L136 140 L156 150 Z" fill="${fill}" stroke="${rim}" stroke-width="2"/>
    <path d="M82 160 L76 184 L98 184 L98 160 Z M118 160 L124 184 L102 184 L102 160 Z" fill="${fill}" stroke="${rim}" stroke-width="2"/>
    <path d="M90 50 L98 52 M104 52 L112 50" stroke="${eye}" stroke-width="3" filter="url(#glow)"/>
    <path d="M96 96 L104 112 L94 124 L106 140" stroke="${eye}" stroke-width="2" fill="none" filter="url(#glow)" opacity="0.8"/>`,

  Pyro: ({ fill, rim, eye }) => `
    <path d="M100 18 Q128 60 140 92 Q154 134 128 164 Q110 182 100 182 Q90 182 72 164 Q46 134 60 92 Q72 60 100 18 Z" fill="${fill}" stroke="${rim}" stroke-width="2"/>
    <path d="M100 70 Q116 98 118 126 Q118 154 100 162 Q82 154 82 126 Q84 98 100 70 Z" fill="${eye}" opacity="0.35"/>
    ${eyes([[90, 120], [110, 120]], 3.4, eye)}`,

  Insect: ({ fill, rim, eye }) => `
    <ellipse cx="100" cy="124" rx="34" ry="46" fill="${fill}" stroke="${rim}" stroke-width="2"/>
    <path d="M100 80 L100 170" stroke="${rim}" stroke-width="1.6" opacity="0.7"/>
    <circle cx="100" cy="70" r="18" fill="${fill}" stroke="${rim}" stroke-width="2"/>
    <path d="M88 56 Q70 30 60 34 M112 56 Q130 30 140 34" stroke="${rim}" stroke-width="2" fill="none"/>
    <path d="M68 104 L40 92 M66 124 L36 128 M68 144 L42 164 M132 104 L160 92 M134 124 L164 128 M132 144 L158 164" stroke="${rim}" stroke-width="3" stroke-linecap="round"/>
    ${eyes([[92, 68], [108, 68]], 3.2, eye)}`,
};
