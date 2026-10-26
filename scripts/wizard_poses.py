"""Wizard poses for the Add hardware wizard: one original Rhino Studio rhino, six poses.
Hand-drawn look: grainy pencil fill, ink lines that swell and thin along their length (pressure),
plus a lighter offset sketch pass. Only arms and props change between poses."""
import math, os, sys
OUT = sys.argv[1] if len(sys.argv) > 1 else 'src/assets/wizard'
LINE, BODY, LIMB, HEAD, SNOUT, EAR = '#34465a', '#a3b8cc', '#8fa6bd', '#b0c3d5', '#cfdbe6', '#94aac0'
HORN_C, HAT, BRIM = '#f4ead2', '#f5c542', '#f0b830'

def P(d, f='none'): return f'<path d="{d}" fill="{f}"/>'

def circ(cx, cy, r): return f'M{cx-r:.1f} {cy:.1f} a{r} {r} 0 1 0 {2*r} 0 a{r} {r} 0 1 0 {-2*r} 0 Z'

def tube(sx, sy, px, py, w=12, bend=0.0, tip=None):
    """Tapered tube from (sx,sy) to (px,py); bend pushes the middle sideways (an elbow)."""
    tip = w * .8 if tip is None else tip
    a = math.atan2(py - sy, px - sx); nx, ny = -math.sin(a), math.cos(a)
    mx, my = (sx + px) / 2 + nx * bend, (sy + py) / 2 + ny * bend
    return (f'M{sx+nx*w:.1f} {sy+ny*w:.1f} Q{mx+nx*w:.1f} {my+ny*w:.1f} {px+nx*tip:.1f} {py+ny*tip:.1f} '
            f'L{px-nx*tip:.1f} {py-ny*tip:.1f} Q{mx-nx*w:.1f} {my-ny*w:.1f} {sx-nx*w:.1f} {sy-ny*w:.1f} Z')

def arm(sx, sy, px, py, bend=0.0, paw=11):
    return [(tube(sx, sy, px, py, 12, bend), LIMB), (circ(px, py, paw), LIMB)]

BASE = [  # drawn behind the arms
 ('M64 206 a24 17 0 1 0 48 0 a24 17 0 1 0 -48 0 Z', LIMB), ('M128 206 a24 17 0 1 0 48 0 a24 17 0 1 0 -48 0 Z', LIMB),
 ('M54 194 C42 146 70 110 120 110 C170 110 198 146 186 194 C166 216 74 216 54 194 Z', BODY),
 ('M66 74 C46 58 56 44 74 58 Z', EAR), ('M174 74 C194 58 184 44 166 58 Z', EAR),
 ('M64 86 C60 52 90 40 120 40 C150 40 180 52 176 86 C174 110 150 130 120 130 C90 130 66 110 64 86 Z', HEAD),
 ('M80 106 a40 24 0 1 0 80 0 a40 24 0 1 0 -80 0 Z', SNOUT),
 ('M72 52 C72 14 168 14 168 52 Z', HAT), ('M54 54 C54 46 186 46 186 54 C186 60 54 60 54 54 Z', BRIM),
]
HORN = ('M104 104 C102 84 110 64 128 50 C124 70 132 88 136 104 Z', HORN_C)
MARKS = ['M74 213 q4 5 8 0 M86 215 q4 5 8 0 M138 215 q4 5 8 0 M150 213 q4 5 8 0', 'M120 20 L120 48', 'M114 84 q4 -3 8 0']
SMILE = 'M104 116 Q120 128 136 116'
REST_L = arm(78, 138, 70, 178, bend=-6)          # left arm resting at the side

def face(mood='happy'):
    eyes = ('<ellipse cx="84" cy="80" rx="9.5" ry="12" fill="#22303d"/><ellipse cx="156" cy="80" rx="9.5" ry="12" fill="#22303d"/>'
            '<circle cx="88" cy="75" r="3.8" fill="#fff"/><circle cx="160" cy="75" r="3.8" fill="#fff"/>'
            '<circle cx="81" cy="85" r="1.7" fill="#fff"/><circle cx="153" cy="85" r="1.7" fill="#fff"/>')
    if mood == 'look-up':  # thinking: eyes glance up and to the side
        eyes = eyes.replace('cy="80"', 'cy="77"').replace('cx="88" cy="75"', 'cx="90" cy="71"').replace('cx="160" cy="75"', 'cx="162" cy="71"')
    return (f'<g filter="url(#wob2)"><ellipse cx="108" cy="106" rx="4" ry="3" fill="{LINE}"/><ellipse cx="132" cy="106" rx="4" ry="3" fill="{LINE}"/>{eyes}'
            '<ellipse cx="72" cy="102" rx="10" ry="6.5" fill="#ee9aa6" opacity=".6"/><ellipse cx="168" cy="102" rx="10" ry="6.5" fill="#ee9aa6" opacity=".6"/></g>'
            f'<g filter="url(#wob1)" stroke="{LINE}" stroke-width="2" stroke-linejoin="round">'
            '<rect x="66" y="64" width="36" height="30" rx="11" fill="#e8f4fb" fill-opacity=".12"/>'
            '<rect x="138" y="64" width="36" height="30" rx="11" fill="#e8f4fb" fill-opacity=".12"/>'
            '<path d="M102 74 Q120 66 138 74 M66 74 L60 70 M174 74 L180 70" fill="none"/>'
            '<path d="M72 70 l6 -3 M144 70 l6 -3" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".9"/></g>')

# ---- poses: arms (filled, outlined), props (own colours), extra marks, mood
POSES = {
 'what': dict(  # holding a part up to look at it (a small stepper motor)
   arms=REST_L + arm(164, 140, 196, 98, bend=10),
   props_back=[('M184 62 h30 v30 h-30 Z', '#7d8590'), ('M190 68 h18 v18 h-18 Z', '#9aa2ac')],
   front=[circ(196, 98, 11)],
   props_marks=['M199 62 v-10', 'M176 50 l-6 -6 M183 43 l-2 -8'], mood='happy'),
 'wiring': dict(  # one end of a lead in each paw, the lead hanging in front
   arms=arm(76, 140, 44, 158, bend=-8) + arm(164, 140, 196, 158, bend=8),
   wires=['M44 158 C40 214 80 236 120 236 C160 236 200 214 196 158'],
   props_back=[('M37 134 h14 v14 h-14 Z', '#2e2f33'), ('M189 134 h14 v14 h-14 Z', '#2e2f33')],
   props_marks=['M41 134 v-6 M47 134 v-6 M193 134 v-6 M199 134 v-6'], mood='happy'),
 'tools': dict(  # pointing out to the side, toward the tool rack in the panel
   arms=REST_L + arm(164, 140, 210, 126, bend=-6),
   props_back=[], front=[tube(212, 124, 230, 116, 4.5, 0, 3.5)],
   props_marks=['M228 100 l6 -6 M234 108 l8 -2'], mood='happy'),
 'follows': dict(  # thinking: paw under the chin, eyes up, a small "this follows that" bubble
   arms=REST_L + arm(166, 146, 150, 126, bend=-18),
   props_back=[('M174 26 a30 20 0 1 0 60 0 a30 20 0 1 0 -60 0 Z', '#f7f3ea'),
               ('M178 58 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0 Z', '#f7f3ea'), ('M184 70 a2.5 2.5 0 1 0 5 0 a2.5 2.5 0 1 0 -5 0 Z', '#f7f3ea')],
   props_marks=['M188 26 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0', 'M200 26 h12 m-4 -4 l4 4 l-4 4', 'M216 21 h9 v10 h-9 Z'], mood='look-up'),
 'shows': dict(  # waving at the screen
   arms=REST_L + arm(164, 138, 200, 80, bend=-12),
   props_back=[], props_marks=['M214 66 q8 6 6 16 M222 58 q11 9 8 24'], mood='happy'),
 'done': dict(  # thumbs up
   arms=REST_L + arm(164, 142, 194, 116, bend=8, paw=12),
   props_back=[], front=[tube(194, 108, 197, 90, 4.8, 0, 4)],
   props_marks=['M216 80 l4 -10 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 Z', 'M188 120 h10 M188 126 h9'], mood='happy'),
}

DEFS = '''<defs>
  <filter id="grain" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="3" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.1" result="a"/>
    <feComposite in="SourceGraphic" in2="a" operator="in" result="g"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.04" seed="7" result="w"/>
    <feDisplacementMap in="g" in2="w" scale="2" result="d"/>
    <feColorMatrix in="d" type="matrix" values=".82 0 0 0 0  0 .82 0 0 0  0 0 .86 0 0  0 0 0 .8 0"/>
  </filter>
  <!-- ink: the line swells where a slow noise is high and thins where it is low, then wobbles -->
  <filter id="ink" x="-6%" y="-6%" width="112%" height="112%">
    <feMorphology in="SourceGraphic" operator="dilate" radius=".65" result="thick"/>
    <feMorphology in="SourceGraphic" operator="erode" radius=".15" result="thin"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves="1" seed="4" result="p"/>
    <feColorMatrix in="p" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 6 -2.6" result="pm"/>
    <feComposite in="thick" in2="pm" operator="in" result="heavy"/>
    <feMerge result="m"><feMergeNode in="thin"/><feMergeNode in="heavy"/></feMerge>
    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="1" result="w"/>
    <feDisplacementMap in="m" in2="w" scale="3.2"/>
  </filter>
  <filter id="wob1" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="1" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="3.2"/></filter>
  <filter id="wob2" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="9" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="2.6"/></filter>
</defs>'''

TITLES = {'what': 'Rhino holding up a part', 'wiring': 'Rhino holding a wire', 'tools': 'Rhino pointing',
          'follows': 'Rhino thinking', 'shows': 'Rhino waving', 'done': 'Rhino giving a thumbs up'}

def seamless(d):
    """Outline a limb without the line across the shoulder where it joins the body."""
    return d[:-2] if d.endswith(' Z') and ' L' in d and ' Q' in d else d

def build(name, p):
    fills = BASE + (p['arms'] + p['props_back'] if name == 'what' else p['props_back'] + p['arms']) + [(d, LIMB) for d in p.get('front', [])]
    wires = ''.join(f'<path d="{d}" stroke="#c9463d" stroke-width="3.2"/><path d="{d}" transform="translate(0 4)" stroke="#2e2f33" stroke-width="3.2"/>'
                    for d in p.get('wires', []))
    lines = ''.join(f'<path d="{seamless(d)}"/>' for d, _ in fills + [HORN]) + ''.join(f'<path d="{d}"/>' for d in MARKS + [SMILE] + p['props_marks'])
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" role="img" aria-labelledby="t">
<title id="t">{TITLES[name]}</title>
<!-- Original Rhino Studio wizard mascot, generated by scripts/wizard_poses.py. -->
{DEFS}
<g filter="url(#wob2)" opacity=".94">{''.join(P(d, f) for d, f in BASE)}</g>
<g filter="url(#grain)">{''.join(P(d, f) for d, f in BASE)}</g>
{face(p['mood'])}
<g filter="url(#wob2)">{P(*HORN)}</g><g filter="url(#grain)">{P(*HORN)}</g>
<g fill="none" stroke-linecap="round" filter="url(#wob1)">{wires}</g>
<g filter="url(#wob2)" opacity=".96">{''.join(P(d, f) for d, f in fills[len(BASE):])}</g>
<g filter="url(#grain)">{''.join(P(d, f) for d, f in fills[len(BASE):])}</g>
<g fill="none" stroke="{LINE}" stroke-linecap="round" stroke-linejoin="round">
  <g filter="url(#ink)" stroke-width="1.5" opacity=".92">{lines}</g>
  <g filter="url(#wob2)" stroke-width=".8" opacity=".45" transform="translate(.8 .6)">{lines}</g>
</g>
</svg>
'''

os.makedirs(OUT, exist_ok=True)
for n, p in POSES.items():
    open(os.path.join(OUT, f'rhino-{n}.svg'), 'w').write(build(n, p))
print('wrote', len(POSES), 'poses to', OUT)
