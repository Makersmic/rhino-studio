# Builds the hand-drawn wizard mascot: grainy pencil fills + doubled, wobbly, uneven lines.
shapes = [  # (d, fill)
 ('M64 206 a24 17 0 1 0 48 0 a24 17 0 1 0 -48 0 Z', '#b3a6dc'),
 ('M128 206 a24 17 0 1 0 48 0 a24 17 0 1 0 -48 0 Z', '#b3a6dc'),
 ('M58 196 C46 150 70 112 120 112 C170 112 194 150 182 196 C164 214 76 214 58 196 Z', '#c3b7e6'),
 ('M70 150 C58 160 60 180 74 182 C84 182 86 168 84 158', '#b3a6dc'),
 ('M70 52 C56 30 74 22 86 44 Z', '#b9addf'),
 ('M170 52 C184 30 166 22 154 44 Z', '#b9addf'),
 ('M64 86 C60 50 90 38 120 38 C150 38 180 50 176 86 C174 110 150 130 120 130 C90 130 66 110 64 86 Z', '#cfc4ec'),
 ('M82 104 a38 24 0 1 0 76 0 a38 24 0 1 0 -76 0 Z', '#e4dcf5'),
 ('M114 46 C116 40 124 40 126 46 L124 56 L116 56 Z', '#f6ead0'),
 ('M106 92 C106 74 114 60 120 52 C126 60 134 74 134 92 Z', '#f6ead0'),
]
details = [  # strokes only
 'M74 213 q4 5 8 0 M86 215 q4 5 8 0 M138 215 q4 5 8 0 M150 213 q4 5 8 0',
 'M106 114 Q120 126 134 114',
 'M70 62 q12 -6 22 0 M148 62 q12 -6 22 0',
 'M112 72 q4 -3 8 0',  # horn shading line
]
solid = '''
  <path d="M73 46 C68 36 75 33 80 42" fill="#f1b3cb"/>
  <path d="M167 46 C172 36 165 33 160 42" fill="#f1b3cb"/>
  <ellipse cx="108" cy="104" rx="4" ry="3" fill="#4a3d78"/>
  <ellipse cx="132" cy="104" rx="4" ry="3" fill="#4a3d78"/>
  <ellipse cx="82" cy="78" rx="10" ry="12.5" fill="#33285a"/>
  <ellipse cx="158" cy="78" rx="10" ry="12.5" fill="#33285a"/>
  <circle cx="86" cy="73" r="4" fill="#fff"/><circle cx="162" cy="73" r="4" fill="#fff"/>
  <circle cx="79" cy="83" r="1.8" fill="#fff"/><circle cx="155" cy="83" r="1.8" fill="#fff"/>
  <ellipse cx="72" cy="100" rx="10" ry="6.5" fill="#f2a1c0" opacity=".7"/>
  <ellipse cx="168" cy="100" rx="10" ry="6.5" fill="#f2a1c0" opacity=".7"/>'''
wrench = '''<g transform="rotate(22 186 150)">
    <rect x="180" y="118" width="12" height="54" rx="5" fill="#f7c96a"/>
    <path d="M186 92 a16 16 0 1 0 0.1 0 Z M180 92 L180 106 L192 106 L192 92 Z" fill="#f7c96a" fill-rule="evenodd"/></g>
  <path d="M168 148 C176 140 190 136 196 146 C200 156 186 162 176 160" fill="#b3a6dc"/>'''
wrench_lines = wrench.replace('fill="#f7c96a"', 'fill="none"').replace('fill="#b3a6dc"', 'fill="none"')
spark = ('M30 70 l4 -10 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 Z', '#ffdd85'), ('M206 40 l3 -7 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 Z', '#a5e0d1')

fills = '\n  '.join(f'<path d="{d}" fill="{c}"/>' for d, c in shapes + list(spark))
lines = '\n  '.join(f'<path d="{d}"/>' for d, _ in shapes + list(spark)) + '\n  ' + '\n  '.join(f'<path d="{d}"/>' for d in details)

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" role="img" aria-labelledby="t">
<title id="t">Rhino mascot</title>
<!-- Original Rhino Studio mascot. Hand-drawn look: grainy pencil fills, two wobbly passes of uneven line. -->
<defs>
  <filter id="grain" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="3" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.1" result="a"/>
    <feComposite in="SourceGraphic" in2="a" operator="in" result="g"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.04" seed="7" result="w"/>
    <feDisplacementMap in="g" in2="w" scale="2" result="d"/>
    <feColorMatrix in="d" type="matrix" values=".82 0 0 0 0  0 .82 0 0 0  0 0 .86 0 0  0 0 0 .8 0"/>
  </filter>
  <filter id="wobble1" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="1" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="3.2"/>
  </filter>
  <filter id="wobble2" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="9" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="2.6"/>
  </filter>
</defs>
<g filter="url(#wobble2)" opacity=".92">
  {fills}
  {wrench}
</g>
<g filter="url(#grain)">
  {fills}
  {wrench}
</g>
<g filter="url(#wobble2)">{solid}
</g>
<g fill="none" stroke="#4a3d78" stroke-linecap="round" stroke-linejoin="round">
  <g filter="url(#wobble1)" stroke-width="2.4" opacity=".9">
  {lines}
  {wrench_lines}
  </g>
  <g filter="url(#wobble2)" stroke-width="1.1" opacity=".55">
  {lines}
  {wrench_lines}
  </g>
</g>
</svg>
'''
open('src/assets/wizard/rhino-mascot.svg', 'w').write(svg)
