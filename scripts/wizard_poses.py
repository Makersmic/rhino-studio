"""Wizard poses for the Add hardware wizard: one original Rhino Studio rhino, six poses, two views.

Hand-drawn look: grainy pencil fill, ink lines that swell and thin along their length (pressure),
and a lighter offset sketch pass. Every part is filled and outlined together, back to front, so a
nearer part hides the lines behind it. Views: 'front' and 'q' (three-quarter, facing right; set
mirror=True to face left). Light comes from the upper left, so the right side gets a form shadow.
Usage: python3 scripts/wizard_poses.py [out_dir]"""
import math, os, sys

OUT = sys.argv[1] if len(sys.argv) > 1 else 'src/assets/wizard'
LINE, BODY, LIMB, FAR, HEAD, SNOUT, EAR = '#34465a', '#a3b8cc', '#8fa6bd', '#7f97ae', '#b0c3d5', '#cfdbe6', '#94aac0'
HORN_C, HAT, BRIM, SHADE = '#f4ead2', '#f5c542', '#f0b830', '#6f879f'


def circ(cx, cy, r): return f'M{cx-r:.1f} {cy:.1f} a{r} {r} 0 1 0 {2*r} 0 a{r} {r} 0 1 0 {-2*r} 0 Z'
def ell(cx, cy, rx, ry): return f'M{cx-rx:.1f} {cy:.1f} a{rx} {ry} 0 1 0 {2*rx} 0 a{rx} {ry} 0 1 0 {-2*rx} 0 Z'


def tube(sx, sy, px, py, w=12, bend=0.0, tip=None):
    """Tapered tube from (sx,sy) to (px,py). bend pushes the middle sideways (an elbow).
    Returned open at the shoulder, so its outline never cuts across the body it grows from."""
    tip = w * .8 if tip is None else tip
    a = math.atan2(py - sy, px - sx); nx, ny = -math.sin(a), math.cos(a)
    mx, my = (sx + px) / 2 + nx * bend, (sy + py) / 2 + ny * bend
    return (f'M{sx+nx*w:.1f} {sy+ny*w:.1f} Q{mx+nx*w:.1f} {my+ny*w:.1f} {px+nx*tip:.1f} {py+ny*tip:.1f} '
            f'L{px-nx*tip:.1f} {py-ny*tip:.1f} Q{mx-nx*w:.1f} {my-ny*w:.1f} {sx-nx*w:.1f} {sy-ny*w:.1f}')


def part(d, fill, line=True, closed_fill=True, w=1.5):
    return dict(d=d, fill=fill, line=line, w=w)


def arm(sx, sy, px, py, bend=0.0, paw=11, far=False):
    c = FAR if far else LIMB
    return [part(tube(sx, sy, px, py, 12, bend), c), part(circ(px, py, paw), c)]


def stroke(d, w=1.5):  # a drawn mark with no fill (smile, toes, hat seam)
    return part(d, 'none', True, w=w)


def blob(d, fill):  # filled shape with no outline (cheeks, highlights)
    return part(d, fill, False)


# ---------------------------------------------------------------- the two views (facing right for 'q')
def view_front():
    v = {}
    v['ears'] = [part('M66 74 C46 58 56 44 74 58 Z', EAR), part('M174 74 C194 58 184 44 166 58 Z', EAR)]
    v['back'] = []
    v['body'] = [part('M54 194 C42 146 70 110 120 110 C170 110 198 146 186 194 C166 216 74 216 54 194 Z', BODY)]
    v['shade'] = 'M150 112 C204 124 206 196 172 214 L232 216 L232 100 Z'
    v['legs'] = [part(ell(88, 206, 24, 17), LIMB), part(ell(152, 206, 24, 17), LIMB),
                 stroke('M74 213 q4 5 8 0 M86 215 q4 5 8 0 M138 215 q4 5 8 0 M150 213 q4 5 8 0', 1.2)]
    v['head'] = [part('M64 86 C60 52 90 40 120 40 C150 40 180 52 176 86 C174 110 150 130 120 130 C90 130 66 110 64 86 Z', HEAD),
                 part(ell(120, 106, 40, 24), SNOUT)]
    v['face'] = [blob(ell(108, 106, 4, 3), LINE), blob(ell(132, 106, 4, 3), LINE),
                 stroke('M104 116 Q120 128 136 116'),
                 blob(ell(72, 102, 10, 6.5), '#ee9aa6aa'), blob(ell(168, 102, 10, 6.5), '#ee9aa6aa')]
    v['eyes'] = [(84, 80, 9.5, 12), (156, 80, 9.5, 12)]
    v['lenses'] = [(66, 64, 36, 30), (138, 64, 36, 30)]
    v['bridge'] = 'M102 74 Q120 66 138 74 M66 74 L60 70 M174 74 L180 70'
    v['horn'] = [part('M104 104 C102 84 110 64 128 50 C124 70 132 88 136 104 Z', HORN_C), stroke('M114 86 q4 -3 8 0', 1.1)]
    v['hat'] = [part('M72 52 C72 14 168 14 168 52 Z', HAT), stroke('M120 20 L120 48', 1.2),
                part('M54 54 C54 46 186 46 186 54 C186 60 54 60 54 54 Z', BRIM)]
    v['ground'] = ell(120, 224, 74, 7)
    return v


def view_q():
    """Three-quarter view, facing right: near side on the left, far side foreshortened."""
    v = {}
    v['ears'] = [part('M74 76 C52 60 62 44 84 58 Z', EAR), part('M168 64 C180 48 172 40 160 52 Z', FAR)]
    v['back'] = [part(ell(150, 204, 22, 16), FAR)]                       # far leg, behind the body
    v['body'] = [part('M58 196 C46 150 72 112 122 112 C166 112 190 146 182 194 C164 214 80 216 58 196 Z', BODY)]
    v['shade'] = 'M146 114 C196 124 198 196 168 214 L232 216 L232 100 Z'
    v['legs'] = [part(ell(92, 208, 26, 17), LIMB), stroke('M76 215 q4 5 8 0 M88 217 q4 5 8 0 M100 216 q4 5 8 0', 1.2)]
    v['head'] = [part('M68 88 C64 52 96 40 126 40 C156 40 178 54 176 88 C174 112 154 130 126 130 C96 130 70 110 68 88 Z', HEAD),
                 part(ell(150, 106, 38, 23), SNOUT)]                       # snout pushes past the head outline
    v['face'] = [blob(ell(152, 110, 4, 3.2), LINE), blob(ell(176, 108, 3, 2.6), LINE),
                 stroke('M132 120 Q148 130 166 118'),
                 blob(ell(84, 102, 10, 6.5), '#ee9aa6aa'), blob(ell(170, 98, 6, 5), '#ee9aa688')]
    v['eyes'] = [(100, 80, 9.5, 12), (150, 78, 6.5, 11)]                  # far eye foreshortened
    v['lenses'] = [(82, 64, 36, 30), (138, 64, 24, 28)]
    v['bridge'] = 'M118 74 Q128 68 138 74 M82 74 L72 70'
    v['horn'] = [part('M150 102 C150 84 164 66 190 56 C182 74 184 90 182 100 Z', HORN_C), stroke('M162 86 q5 -3 9 0', 1.1)]
    v['hat'] = [part('M78 52 C80 14 170 12 172 50 Z', HAT), stroke('M128 18 C132 30 132 40 130 48', 1.2),
                part('M58 56 C58 46 190 42 190 50 C190 58 58 62 58 56 Z', BRIM)]
    v['ground'] = ell(124, 224, 72, 7)
    return v



# ---------------------------------------------------------------- speech bubbles full of odd tech glyphs
PAPER = '#fbf8f0'


def bubble(x, y, w, h, tx, ty, r=14):
    """Speech bubble with its tail pointing at (tx, ty) from the bottom edge."""
    bx = min(max(tx, x + r + 10), x + w - r - 10)
    return (f'M{x+r} {y} H{x+w-r} A{r} {r} 0 0 1 {x+w} {y+r} V{y+h-r} A{r} {r} 0 0 1 {x+w-r} {y+h} '
            f'H{bx+7} L{tx} {ty} L{bx-7} {y+h} H{x+r} A{r} {r} 0 0 1 {x} {y+h-r} V{y+r} A{r} {r} 0 0 1 {x+r} {y} Z')


def thought(x, y, w, h, tx, ty):
    """Thought bubble: a rounded cloud plus two shrinking dots toward (tx, ty)."""
    mx, my = x + w / 2, y + h
    return [part(ell(mx, y + h / 2, w / 2, h / 2), PAPER, w=1.4),
            part(circ(mx + (tx - mx) * .45, my + (ty - my) * .45, 5), PAPER, w=1.2),
            part(circ(mx + (tx - mx) * .8, my + (ty - my) * .8, 3), PAPER, w=1.1)]


# glyphs, each drawn from a point (x, y): small ink marks that read as "techy gibberish"
G = {
 'resistor': lambda x, y: f'M{x} {y} h4 l2 -5 l4 10 l4 -10 l4 10 l4 -10 l2 5 h4',
 'ground':   lambda x, y: f'M{x} {y-8} v8 M{x-7} {y} h14 M{x-4} {y+3} h8 M{x-1.5} {y+6} h3',
 'switch':   lambda x, y: f'M{x} {y} h6 M{x+6} {y} l11 -7 M{x+20} {y} h6 M{x+6} {y} m-1.5 0 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0',
 'gear':     lambda x, y: ''.join(f'M{x+7*__import__("math").cos(a*0.785):.1f} {y+7*__import__("math").sin(a*0.785):.1f} '
                                  f'L{x+10.5*__import__("math").cos(a*0.785):.1f} {y+10.5*__import__("math").sin(a*0.785):.1f} '
                                  for a in range(8)) + f'M{x-7} {y} a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0 M{x-2.5} {y} a2.5 2.5 0 1 0 5 0 a2.5 2.5 0 1 0 -5 0',
 'sine':     lambda x, y: f'M{x} {y} q4 -9 8 0 t8 0 t8 0 t8 0',
 'square':   lambda x, y: f'M{x} {y} v-7 h6 v14 h6 v-14 h6 v14 h6 v-7',
 'question': lambda x, y: f'M{x-5} {y-7} q0 -6 5 -6 q6 0 6 5 q0 4 -6 6 v3 M{x} {y+6} v.5',
 'bang':     lambda x, y: f'M{x} {y-9} v11 M{x} {y+7} v.5',
 'bolt':     lambda x, y: f'M{x+4} {y-10} l-6 10 h7 l-6 10',
 'arrow':    lambda x, y: f'M{x} {y} h14 m-5 -5 l5 5 l-5 5',
 'check':    lambda x, y: f'M{x} {y} l5 6 l11 -14',
 'spark':    lambda x, y: f'M{x} {y-7} v14 M{x-7} {y} h14 M{x-5} {y-5} l10 10 M{x+5} {y-5} l-10 10',
 'chip':     lambda x, y: f'M{x} {y-7} h14 v14 h-14 Z M{x+3.5} {y-7} v-4 M{x+7} {y-7} v-4 M{x+10.5} {y-7} v-4 '
                          f'M{x+3.5} {y+7} v4 M{x+7} {y+7} v4 M{x+10.5} {y+7} v4',
 'diamond':  lambda x, y: f'M{x} {y} l7 -7 l7 7 l-7 7 Z',
 'ring':     lambda x, y: f'M{x-5} {y} a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0',
 'box':      lambda x, y: f'M{x} {y-5} h10 v10 h-10 Z',
 'bars':     lambda x, y: f'M{x} {y+7} v-6 M{x+5} {y+7} v-12 M{x+10} {y+7} v-8 M{x+15} {y+7} v-15 M{x-2} {y+7} h20',
 'spiral':   lambda x, y: f'M{x} {y} a2 2 0 1 1 3 2 a4 4 0 1 1 -7 -4 a6 6 0 1 1 10 7',
 'dots':     lambda x, y: f'M{x} {y} v.5 M{x+5} {y} v.5 M{x+10} {y} v.5',
 'laser':    lambda x, y: f'M{x} {y-8} l3 6 l7 -2 l-5 5 l5 5 l-7 -2 l-3 6 l-3 -6 l-7 2 l5 -5 l-5 -5 l7 2 Z',
 'bit':      lambda x, y: f'M{x-4} {y-9} h8 v8 l-4 10 l-4 -10 Z M{x-4} {y-4} l8 3 M{x-4} {y+1} l6 2',
}


def glyphs(items, cx, cy, k=1.55):
    tf = f'translate({cx} {cy}) scale({k}) translate({-cx} {-cy})'
    return [dict(stroke(G[n](x, y), 1.1), tf=tf) for n, x, y in items]

# ---------------------------------------------------------------- the six poses
REST_FRONT = arm(78, 138, 70, 178, bend=-6)
REST_Q = arm(82, 140, 76, 180, bend=-6)

POSES = {
 'what': dict(view='q',  # three-quarter, holding a small stepper motor up to look at it
   far_arms=arm(160, 136, 206, 74, bend=10, far=True),
   say=([part(bubble(-22, -38, 104, 48, 70, 34), PAPER, w=1.4)] +
        glyphs([('question', 4, -13), ('resistor', 16, -14), ('gear', 56, -14)], 30, -14, 1.35)),
   props=[part('M192 34 h30 v30 h-30 Z', '#7d8590'), part('M198 40 h18 v18 h-18 Z', '#9aa2ac'),
          stroke('M207 34 v-10', 1.4), stroke('M184 24 l-6 -6 M191 17 l-2 -8', 1.2)],
   near_arms=REST_Q),
 'wiring': dict(view='front',  # one connector in each paw, the lead hanging in front
   near_arms=arm(76, 140, 44, 158, bend=-8) + arm(164, 140, 196, 158, bend=8),
   wires=['M44 158 C40 214 80 236 120 236 C160 236 200 214 196 158'],
   say=([part(bubble(-22, -38, 104, 48, 66, 30), PAPER, w=1.4)] +
        glyphs([('switch', -9, -12), ('bolt', 29, -14), ('ground', 56, -13)], 30, -14, 1.35)),
   props=[part('M37 134 h14 v14 h-14 Z', '#2e2f33'), part('M189 134 h14 v14 h-14 Z', '#2e2f33'),
          stroke('M41 134 v-6 M47 134 v-6 M193 134 v-6 M199 134 v-6', 1.4)]),
 'tools': dict(view='q',  # three-quarter, the far arm points out toward the tool rack
   far_arms=arm(158, 138, 208, 124, bend=-6, far=True) + [part(tube(210, 122, 230, 114, 4.5, 0, 3.5), FAR)],
   props=[stroke('M228 98 l6 -6 M234 106 l8 -2', 1.2)],
   say=([part(bubble(-22, -38, 104, 48, 70, 34), PAPER, w=1.4)] +
        glyphs([('bit', 4, -14), ('laser', 28, -14), ('chip', 49, -14)], 30, -14, 1.35)),
   near_arms=REST_Q),
 'follows': dict(view='q', mirror=True,  # three-quarter facing left, paw under the chin, thinking
   near_arms=REST_Q + arm(96, 150, 140, 132, bend=14),
   say=(thought(-22, -40, 112, 52, 96, 46) +
        glyphs([('ring', 10, -14), ('arrow', 27, -14), ('box', 53, -14)], 34, -14, 1.35)),
   mood='look-up'),
 'shows': dict(view='q',  # three-quarter, the far arm waves up behind the head
   far_arms=arm(160, 136, 196, 70, bend=-12, far=True),
   props=[stroke('M212 56 q8 6 6 16 M220 48 q11 9 8 24', 1.3)],
   say=([part(bubble(-22, -38, 104, 48, 70, 34), PAPER, w=1.4)] +
        glyphs([('bars', -4, -14), ('sine', 14, -10), ('spiral', 56, -14)], 30, -14, 1.35)),
   near_arms=REST_Q),
 'done': dict(view='front',  # front, thumbs up
   near_arms=REST_FRONT + arm(164, 142, 194, 116, bend=8, paw=12) + [part(tube(194, 108, 197, 90, 4.8, 0, 4), LIMB)],
   props=[stroke('M216 80 l4 -10 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 Z', 1.3), stroke('M188 120 h10 M188 126 h9', 1.1)],
   say=([part(bubble(-22, -38, 104, 48, 66, 30), PAPER, w=1.4)] +
        glyphs([('check', -4, -13), ('spark', 30, -14), ('gear', 56, -14)], 30, -14, 1.35))),
}
TITLES = {'what': 'Rhino holding up a part', 'wiring': 'Rhino holding a wire', 'tools': 'Rhino pointing',
          'follows': 'Rhino thinking', 'shows': 'Rhino waving', 'done': 'Rhino giving a thumbs up'}

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
  <filter id="wob" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="9" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="2.6"/></filter>
  <filter id="soft"><feGaussianBlur stdDeviation="2.5"/></filter>
</defs>'''


def draw(p):
    """One part: fill (base + grain), then its own outline (pressure ink + sketch pass)."""
    out = []
    if p['fill'] != 'none':
        out.append(f'<path d="{p["d"]}" fill="{p["fill"]}" filter="url(#wob)" opacity=".95"/>')
        if p['line']:  # grain only on outlined shapes; small blobs stay clean
            out.append(f'<path d="{p["d"]}" fill="{p["fill"]}" filter="url(#grain)"/>')
    if p['line']:
        out.append(f'<path d="{p["d"]}" fill="none" stroke="{LINE}" stroke-width="{p["w"]}" stroke-linecap="round" '
                   f'stroke-linejoin="round" filter="url(#ink)" opacity=".92"/>')
        out.append(f'<path d="{p["d"]}" fill="none" stroke="{LINE}" stroke-width=".8" stroke-linecap="round" '
                   f'filter="url(#wob)" opacity=".42" transform="translate(.8 .6)"/>')
    body = ''.join(out)
    return f'<g transform="{p["tf"]}">{body}</g>' if p.get('tf') else body


def eyes_and_glasses(v, mood):
    s = []
    for i, (cx, cy, rx, ry) in enumerate(v['eyes']):
        up = -3 if mood == 'look-up' else 0
        k = rx / 9.5
        s.append(f'<ellipse cx="{cx}" cy="{cy+up}" rx="{rx}" ry="{ry}" fill="#22303d" filter="url(#wob)"/>')
        s.append(f'<circle cx="{cx+4*k:.1f}" cy="{cy-5+up*1.3:.1f}" r="{3.8*k:.1f}" fill="#fff"/>')
        s.append(f'<circle cx="{cx-3*k:.1f}" cy="{cy+5+up:.1f}" r="{1.7*k:.1f}" fill="#fff"/>')
    for x, y, w, h in v['lenses']:
        s.append(draw(part(f'M{x+11} {y} h{w-22} a11 11 0 0 1 11 11 v{h-22} a11 11 0 0 1 -11 11 h{-(w-22)} '
                           f'a11 11 0 0 1 -11 -11 v{-(h-22)} a11 11 0 0 1 11 -11 Z', '#e8f4fb1f', True, w=1.4)))
        s.append(f'<path d="M{x+6} {y+6} l6 -3" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".85"/>')
    s.append(draw(stroke(v['bridge'], 1.4)))
    return ''.join(s)


def build(name, p):
    v = view_front() if p['view'] == 'front' else view_q()
    mood = p.get('mood', 'happy')
    layers = []
    layers += [draw(x) for x in v['ears'] + v['back'] + p.get('far_arms', [])]
    layers += [draw(x) for x in v['body']]
    body_d = v['body'][0]['d']
    layers.append(f'<clipPath id="bc-{name}"><path d="{body_d}"/></clipPath>'
                  f'<g clip-path="url(#bc-{name})"><path d="{v["shade"]}" fill="{SHADE}" opacity=".38" filter="url(#soft)"/></g>')
    layers += [draw(x) for x in v['legs'] + v['head'] + v['face']]
    layers.append(eyes_and_glasses(v, mood))
    layers += [draw(x) for x in v['horn'] + v['hat']]
    for d in p.get('wires', []):
        layers.append(f'<g fill="none" stroke-linecap="round" filter="url(#wob)"><path d="{d}" stroke="#c9463d" stroke-width="3.2"/>'
                      f'<path d="{d}" transform="translate(0 4)" stroke="#2e2f33" stroke-width="3.2"/></g>')
    layers += [draw(x) for x in p.get('near_arms', []) + p.get('props', [])]
    figure = ''.join(layers)
    ground = f'<path d="{v["ground"]}" fill="#000" opacity=".13" filter="url(#soft)"/>'
    if p.get('mirror'):
        figure = f'<g transform="translate(240 0) scale(-1 1)">{figure}</g>'
        ground = f'<g transform="translate(240 0) scale(-1 1)">{ground}</g>'
    overlay = ''.join(draw(x) for x in p.get('overlay', []) + p.get('say', []))  # unmirrored, so glyphs read the right way
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-28 -44 284 284" role="img" aria-labelledby="t">\n'
            f'<title id="t">{TITLES[name]}</title>\n<!-- Original Rhino Studio wizard mascot, generated by scripts/wizard_poses.py. -->\n'
            f'{DEFS}\n{ground}\n{figure}\n{overlay}\n</svg>\n')


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for n, p in POSES.items():
        open(os.path.join(OUT, f'rhino-{n}.svg'), 'w').write(build(n, p))
    print('wrote', len(POSES), 'poses to', OUT)
