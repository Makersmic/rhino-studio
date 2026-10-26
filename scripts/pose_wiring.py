# Wizard pose "Wiring": original Rhino Studio rhino, hard hat + safety glasses, holding a two-wire lead.
LINE = '#34465a'
fills = [
 ('M64 206 a24 17 0 1 0 48 0 a24 17 0 1 0 -48 0 Z', '#8fa6bd'),
 ('M128 206 a24 17 0 1 0 48 0 a24 17 0 1 0 -48 0 Z', '#8fa6bd'),
 ('M54 194 C42 146 70 110 120 110 C170 110 198 146 186 194 C166 216 74 216 54 194 Z', '#a3b8cc'),
 ('M70 150 C58 160 60 180 74 182 C84 182 86 168 84 158', '#8fa6bd'),
 ('M66 74 C46 58 56 44 74 58 Z', '#94aac0'),          # ears at the sides, under the hat
 ('M174 74 C194 58 184 44 166 58 Z', '#94aac0'),
 ('M64 86 C60 52 90 40 120 40 C150 40 180 52 176 86 C174 110 150 130 120 130 C90 130 66 110 64 86 Z', '#b0c3d5'),
 ('M80 106 a40 24 0 1 0 80 0 a40 24 0 1 0 -80 0 Z', '#cfdbe6'),   # snout
]
hat = [
 ('M72 52 C72 14 168 14 168 52 Z', '#f5c542'),                # dome
 ('M54 54 C54 46 186 46 186 54 C186 60 54 60 54 54 Z', '#f0b830'),  # brim
]
hat_lines = ['M120 20 L120 48']
wire_fill = [('M196 70 h14 v14 h-14 Z', '#2e2f33'), ('M188 214 h14 v14 h-14 Z', '#2e2f33')]  # connector shells
paw = ('M168 148 C176 140 190 136 196 146 C200 156 186 162 176 160', '#8fa6bd')
details = ['M74 213 q4 5 8 0 M86 215 q4 5 8 0 M138 215 q4 5 8 0 M150 213 q4 5 8 0',
           'M104 116 Q120 128 136 116', 'M114 84 q4 -3 8 0']

HORN = 'M104 104 C102 84 110 64 128 50 C124 70 132 88 136 104 Z'
def P(d, f): return f'<path d="{d}" fill="{f}"/>'
body = fills + hat
fill_layer = '\n  '.join(P(d, f) for d, f in body)
line_layer = '\n  '.join(f'<path d="{d}"/>' for d, _ in body + wire_fill + [paw, (HORN, 0)]) + '\n  ' + \
             '\n  '.join(f'<path d="{d}"/>' for d in details + hat_lines)
wires = f'''<g fill="none" stroke-linecap="round" filter="url(#wobble1)">
    <path d="M183 150 C200 124 186 104 201 84" stroke="#c9463d" stroke-width="3.2"/>
    <path d="M188 152 C205 126 192 106 207 84" stroke="#2e2f33" stroke-width="3.2"/>
    <path d="M178 158 C196 176 206 194 193 214" stroke="#c9463d" stroke-width="3.2"/>
    <path d="M183 160 C201 178 211 196 198 214" stroke="#2e2f33" stroke-width="3.2"/>
  </g>
  <g filter="url(#wobble2)">{''.join(P(d, f) for d, f in wire_fill)}
    <path d="M199 70 v-6 M207 70 v-6 M191 228 v6 M199 228 v6" stroke="#b8b3a6" stroke-width="2.2" stroke-linecap="round"/>
  </g>'''
face = f'''<g filter="url(#wobble2)">
  <ellipse cx="108" cy="106" rx="4" ry="3" fill="{LINE}"/><ellipse cx="132" cy="106" rx="4" ry="3" fill="{LINE}"/>
  <ellipse cx="84" cy="80" rx="9.5" ry="12" fill="#22303d"/><ellipse cx="156" cy="80" rx="9.5" ry="12" fill="#22303d"/>
  <circle cx="88" cy="75" r="3.8" fill="#fff"/><circle cx="160" cy="75" r="3.8" fill="#fff"/>
  <circle cx="81" cy="85" r="1.7" fill="#fff"/><circle cx="153" cy="85" r="1.7" fill="#fff"/>
  <ellipse cx="72" cy="102" rx="10" ry="6.5" fill="#ee9aa6" opacity=".6"/><ellipse cx="168" cy="102" rx="10" ry="6.5" fill="#ee9aa6" opacity=".6"/>
  </g>
  <g filter="url(#wobble1)" stroke="{LINE}" stroke-width="2" stroke-linejoin="round">
    <rect x="66" y="64" width="36" height="30" rx="11" fill="#e8f4fb" fill-opacity=".12"/>
    <rect x="138" y="64" width="36" height="30" rx="11" fill="#e8f4fb" fill-opacity=".12"/>
    <path d="M102 74 Q120 66 138 74 M66 74 L60 70 M174 74 L180 70" fill="none"/>
    <path d="M72 70 l6 -3 M144 70 l6 -3" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".9"/>
  </g>'''
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" role="img" aria-labelledby="t">
<title id="t">Rhino holding a wire</title>
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
    <feDisplacementMap in="SourceGraphic" in2="w" scale="3.2"/></filter>
  <filter id="wobble2" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="9" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="2.6"/></filter>
</defs>
<g filter="url(#wobble2)" opacity=".94">
  {fill_layer}
</g>
<g filter="url(#grain)">
  {fill_layer}
</g>
{face}
<g filter="url(#wobble2)">{P(HORN,'#f4ead2')}</g>
<g filter="url(#grain)">{P(HORN,'#f4ead2')}</g>
{wires}
<g filter="url(#wobble2)">{P(*paw)}</g>
<g fill="none" stroke="{LINE}" stroke-linecap="round" stroke-linejoin="round">
  <g filter="url(#wobble1)" stroke-width="2.2" opacity=".9">
  {line_layer}
  </g>
  <g filter="url(#wobble2)" stroke-width="1" opacity=".55">
  {line_layer}
  </g>
</g>
</svg>
'''
open('src/assets/wizard/rhino-wiring.svg', 'w').write(svg)
