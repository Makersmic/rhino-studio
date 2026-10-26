"""Wizard poses for the Add hardware wizard: one original Rhino Studio rhino, six poses, two views.

Hand-drawn look: grainy pencil fill, ink lines that swell and thin along their length (pressure),
and a lighter offset sketch pass. Every part is filled and outlined together, back to front, so a
nearer part hides the lines behind it. Views: 'front' and 'q' (three-quarter, facing right; set
mirror=True to face left). Light comes from the upper left, so the right side gets a form shadow.
Usage: python3 scripts/wizard_poses.py [out_dir]"""
import math, os, sys

OUT = sys.argv[1] if len(sys.argv) > 1 else 'src/assets/wizard'
LINE, BODY, LIMB, FAR, HEAD, SNOUT, EAR = '#34465a', '#a3b8cc', '#8fa6bd', '#7f97ae', '#b0c3d5', '#cfdbe6', '#94aac0'
HORN_C, HAT, BRIM, SHADE = '#f4ead2', '#f5c542', '#f0b830', '#5d4428'
JACKET, JACKET_FAR, CUFF, COLLAR = '#b98a4e', '#a37741', '#8f6535', '#6b4a2e'   # tan canvas work jacket, no logo


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


def part(d, fill, line=True, closed_fill=True, w=1.5, tf=''):
    return dict(d=d, fill=fill, line=line, w=w, tf=tf)


def arm(sx, sy, px, py, bend=0.0, paw=11, far=False):
    sx = sx - 24 if sx < 120 else sx + 22   # broad chest: shoulders sit wider
    sleeve, hand = (JACKET_FAR, FAR) if far else (JACKET, LIMB)
    return [part(tube(sx, sy, px, py, 12, bend), sleeve), part(circ(px, py, paw + 2.5), CUFF, w=1.2), part(circ(px, py, paw), hand)]


def stroke(d, w=1.5):  # a drawn mark with no fill (smile, toes, hat seam)
    return part(d, 'none', True, w=w)


def blob(d, fill):  # filled shape with no outline (cheeks, highlights)
    return part(d, fill, False)


# ---------------------------------------------------------------- the two views (facing right for 'q')
def view_front():
    v = {}
    v['ears'] = [part('M66 74 C46 58 56 44 74 58 Z', EAR), part('M174 74 C194 58 184 44 166 58 Z', EAR)]
    v['back'] = []
    v['body'] = [part('M88 204 C82 192 82 178 86 168 C58 160 30 142 40 126 C56 108 90 106 120 106 C150 106 184 108 200 126 C210 142 182 160 154 168 C158 178 158 192 152 204 C140 214 100 214 88 204 Z', JACKET)]
    v['belt'] = []
    v['folds'] = [stroke('M120 136 L120 206', 1.4), part('M116 140 h8 v12 h-8 Z', '#c9cdd3', w=1),       # zip + pull
                  part('M130 148 h22 v20 h-22 Z', JACKET, w=1.2), stroke('M130 154 h22', 1),               # chest pocket
                  stroke('M86 198 q34 10 68 0', 1.2), stroke('M50 130 q10 -8 28 -12 M190 130 q-10 -8 -28 -12', 1)]
    v['collar'] = [part('M88 128 L116 138 L104 152 Z', COLLAR, w=1.3), part('M152 128 L124 138 L136 152 Z', COLLAR, w=1.3)]
    v['shade'] = 'M150 112 C204 124 206 196 172 214 L232 216 L232 100 Z'
    v['legs'] = [part(ell(104, 209, 19, 14), LIMB), part(ell(136, 209, 19, 14), LIMB),
                 stroke('M93 215 q4 5 8 0 M103 217 q4 5 8 0 M129 217 q4 5 8 0 M139 215 q4 5 8 0', 1.2)]
    v['head'] = [part('M64 86 C60 52 90 40 120 40 C150 40 180 52 176 86 C174 110 150 130 120 130 C90 130 66 110 64 86 Z', HEAD),
                 part(ell(120, 106, 40, 24), SNOUT)]
    v['face'] = [blob(ell(108, 106, 4, 3), LINE), blob(ell(132, 106, 4, 3), LINE),
                 part('M104 114 Q120 134 136 114 Q120 121 104 114 Z', '#8a3c4a', w=1.4),
                 blob(ell(72, 103, 10, 6), '#ee9aa666'), blob(ell(168, 103, 10, 6), '#ee9aa666')]
    v['bangs'] = [part('M92 60 l6 -10 l5 8 l6 -12 l5 11 l6 -9 l4 12 Z', HEAD, w=1.2)]
    v['eyes'] = [(84, 80, 9.5, 12), (156, 80, 9.5, 12)]
    v['lenses'] = [(66, 64, 36, 30), (138, 64, 36, 30)]
    v['bridge'] = 'M102 74 Q120 66 138 74 M66 74 L60 70 M174 74 L180 70'
    v['horn'] = [part('M104 104 C102 84 110 64 128 50 C124 70 132 88 136 104 Z', HORN_C), stroke('M114 86 q4 -3 8 0', 1.1)]
    v['hat'] = [part('M72 52 C72 14 168 14 168 52 Z', HAT), stroke('M120 20 L120 48', 1.2),
                part('M54 54 C54 46 186 46 186 54 C186 60 54 60 54 54 Z', BRIM)]
    v['ground'] = ell(120, 224, 54, 6)
    return v


def view_q():
    """Three-quarter view, facing right: near side on the left, far side foreshortened."""
    v = {}
    v['ears'] = [part('M74 76 C52 60 62 44 84 58 Z', EAR), part('M168 64 C180 48 172 40 160 52 Z', FAR)]
    v['back'] = [part(ell(140, 206, 18, 13), FAR)]                       # far leg, behind the body
    v['body'] = [part('M92 204 C86 192 86 178 90 168 C62 160 34 142 44 126 C60 108 94 106 124 106 C152 106 184 108 196 126 C204 142 182 160 158 168 C162 178 162 192 156 204 C144 214 104 214 92 204 Z', JACKET)]
    v['belt'] = []
    v['folds'] = [stroke('M132 136 C134 160 134 184 130 206', 1.4), part('M128 140 h8 v12 h-8 Z', '#c9cdd3', w=1),
                  part('M92 148 h22 v20 h-22 Z', JACKET, w=1.2), stroke('M92 154 h22', 1),
                  stroke('M92 198 q32 10 62 0', 1.2), stroke('M54 130 q10 -8 28 -12', 1)]
    v['collar'] = [part('M100 128 L128 138 L116 152 Z', COLLAR, w=1.3), part('M160 126 L136 138 L146 150 Z', COLLAR, w=1.3)]
    v['shade'] = 'M146 114 C196 124 198 196 168 214 L232 216 L232 100 Z'
    v['legs'] = [part(ell(108, 210, 21, 14), LIMB), stroke('M95 216 q4 5 8 0 M105 218 q4 5 8 0 M115 217 q4 5 8 0', 1.2)]
    v['head'] = [part('M68 88 C64 52 96 40 126 40 C156 40 178 54 176 88 C174 112 154 130 126 130 C96 130 70 110 68 88 Z', HEAD),
                 part(ell(150, 106, 38, 23), SNOUT)]                       # snout pushes past the head outline
    v['face'] = [blob(ell(152, 110, 4, 3.2), LINE), blob(ell(176, 108, 3, 2.6), LINE),
                 part('M136 118 Q152 136 168 116 Q152 124 136 118 Z', '#8a3c4a', w=1.4),
                 blob(ell(84, 103, 10, 6), '#ee9aa666'), blob(ell(170, 99, 6, 5), '#ee9aa655')]
    v['bangs'] = [part('M100 60 l6 -10 l5 8 l6 -12 l5 11 l6 -9 l4 12 Z', HEAD, w=1.2)]
    v['eyes'] = [(100, 80, 9.5, 12), (150, 78, 6.5, 11)]                  # far eye foreshortened
    v['lenses'] = [(82, 64, 36, 30), (138, 64, 24, 28)]
    v['bridge'] = 'M118 74 Q128 68 138 74 M82 74 L72 70'
    v['horn'] = [part('M150 102 C150 84 164 66 190 56 C182 74 184 90 182 100 Z', HORN_C), stroke('M162 86 q5 -3 9 0', 1.1)]
    v['hat'] = [part('M78 52 C80 14 170 12 172 50 Z', HAT), stroke('M128 18 C132 30 132 40 130 48', 1.2),
                part('M58 56 C58 46 190 42 190 50 C190 58 58 62 58 56 Z', BRIM)]
    v['ground'] = ell(124, 224, 52, 6)
    return v


def wrench(x, y, ang, length=200, scale=1.0):
    """A big open-end wrench: handle from (x,y) at angle ang (deg), jaw at the far end."""
    tf = f'translate({x} {y}) rotate({ang}) scale({scale})'
    handle = f'M0 -9 L{length} -9 L{length} 9 L0 9 Z'
    jaw = (f'M{length-6} -24 a30 30 0 1 1 0.1 48 a30 30 0 0 1 -0.1 -48 Z '
           f'M{length+8} -10 L{length+40} -10 L{length+40} 10 L{length+8} 10 Z')
    return [part(handle, '#c9cdd3', tf=tf, w=1.6), part(jaw, '#c9cdd3', tf=tf, w=1.6),
            part(f'M10 0 L{length-30} 0', 'none', tf=tf, w=.9),
            part(f'M{length-8} -14 a16 16 0 0 1 10 -6', 'none', tf=tf, w=.9)]


# ---------------------------------------------------------------- the six poses
REST_FRONT = arm(78, 138, 70, 178, bend=-6)
REST_Q = arm(82, 140, 76, 180, bend=-6)

POSES = {
 'what': dict(view='q',  # three-quarter, holding a small stepper motor up to look at it
   far_arms=arm(160, 136, 206, 74, bend=10, far=True),
   props=[part('M192 34 h30 v30 h-30 Z', '#7d8590'), part('M198 40 h18 v18 h-18 Z', '#9aa2ac'),
          stroke('M207 34 v-10', 1.4), stroke('M184 24 l-6 -6 M191 17 l-2 -8', 1.2)],
   near_arms=REST_Q),
 'wiring': dict(view='front',  # one connector in each paw, the lead hanging in front
   near_arms=arm(76, 140, 44, 158, bend=-8) + arm(164, 140, 196, 158, bend=8),
   wires=['M44 158 C40 214 80 236 120 236 C160 236 200 214 196 158'],
   props=[part('M37 134 h14 v14 h-14 Z', '#2e2f33'), part('M189 134 h14 v14 h-14 Z', '#2e2f33'),
          stroke('M41 134 v-6 M47 134 v-6 M193 134 v-6 M199 134 v-6', 1.4)]),
 'tools': dict(view='q',  # three-quarter, the far arm points out toward the tool rack
   far_arms=arm(158, 138, 208, 124, bend=-6, far=True) + [part(tube(210, 122, 230, 114, 4.5, 0, 3.5), FAR)],
   props=[stroke('M228 98 l6 -6 M234 106 l8 -2', 1.2)],
   near_arms=REST_Q),
 'follows': dict(view='q', mirror=True,  # three-quarter facing left, paw under the chin, thinking
   near_arms=REST_Q + arm(96, 150, 140, 132, bend=14),
   overlay=[part(ell(52, 28, 34, 20), '#f7f3ea'), part(circ(84, 56, 4.5), '#f7f3ea'), part(circ(92, 66, 2.6), '#f7f3ea'),
            stroke(circ(36, 28, 4), 1.3), stroke('M46 28 h14 m-4 -4 l4 4 l-4 4', 1.3), stroke('M64 23 h10 v10 h-10 Z', 1.3)],
   mood='look-up'),
 'shows': dict(view='q',  # three-quarter, the far arm waves up behind the head
   far_arms=arm(160, 136, 196, 70, bend=-12, far=True),
   props=[stroke('M212 56 q8 6 6 16 M220 48 q11 9 8 24', 1.3)],
   tool=wrench(40, 232, -90, 170, 1.0),
   near_arms=arm(84, 140, 40, 150, bend=6)),
 'done': dict(view='front',  # front, thumbs up
   back_tool=wrench(222, 232, -145, 205, 1.0),
   near_arms=arm(80, 140, 64, 122, bend=-6) + arm(164, 142, 194, 116, bend=8, paw=12) + [part(tube(194, 108, 197, 90, 4.8, 0, 4), LIMB)],
   props=[stroke('M216 80 l4 -10 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 Z', 1.3), stroke('M188 120 h10 M188 126 h9', 1.1)]),
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
  <radialGradient id="iris" cx="50%" cy="65%" r="60%"><stop offset="0" stop-color="#7fb4d8"/><stop offset="1" stop-color="#2f5d86"/></radialGradient>
  <filter id="soft"><feGaussianBlur stdDeviation="2.5"/></filter>
</defs>'''


def draw(p):
    """One part: fill (base + grain), then its own outline (pressure ink + sketch pass)."""
    out = []
    if p['fill'] != 'none':
        out.append(f'<path d="{p["d"]}" fill="{p["fill"]}" fill-rule="evenodd" filter="url(#wob)" opacity=".95"/>')
        if p['line']:  # grain only on outlined shapes; small blobs stay clean
            out.append(f'<path d="{p["d"]}" fill="{p["fill"]}" fill-rule="evenodd" filter="url(#grain)"/>')
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
        k = rx / 9.5; rx, ry = rx * 1.12, ry * 1.12; cy += up
        s.append(f'<ellipse cx="{cx}" cy="{cy}" rx="{rx:.1f}" ry="{ry:.1f}" fill="#fbfbf8" filter="url(#wob)"/>')
        s.append(f'<ellipse cx="{cx+1*k:.1f}" cy="{cy+1:.1f}" rx="{rx*.8:.1f}" ry="{ry*.86:.1f}" fill="url(#iris)"/>')
        s.append(f'<ellipse cx="{cx+1*k:.1f}" cy="{cy+2:.1f}" rx="{rx*.42:.1f}" ry="{ry*.5:.1f}" fill="#141c26"/>')
        s.append(f'<ellipse cx="{cx+4*k:.1f}" cy="{cy-5:.1f}" rx="{3.6*k:.1f}" ry="{4.4*k:.1f}" fill="#fff"/>')
        s.append(f'<circle cx="{cx-3*k:.1f}" cy="{cy+6:.1f}" r="{1.8*k:.1f}" fill="#fff" opacity=".9"/>')
        s.append(draw(stroke(f'M{cx-rx-2:.1f} {cy-ry*.35:.1f} Q{cx:.1f} {cy-ry-4:.1f} {cx+rx+2:.1f} {cy-ry*.45:.1f}', 2.6)))
        s.append(draw(stroke(f'M{cx+rx:.1f} {cy-ry*.5:.1f} l4 -3', 1.4)))
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
    layers += [draw(x) for x in p.get('back_tool', []) + v['ears'] + v['back'] + p.get('far_arms', [])]
    layers += [draw(x) for x in v['body']]
    body_d = v['body'][0]['d']
    layers.append(f'<clipPath id="bc-{name}"><path d="{body_d}"/></clipPath>'
                  f'<g clip-path="url(#bc-{name})"><path d="{v["shade"]}" fill="{SHADE}" opacity=".38" filter="url(#soft)"/></g>')
    layers.append(f'<g clip-path="url(#bc-{name})">' + ''.join(draw(x) for x in v['folds'] + v['belt']) + '</g>')
    layers += [draw(x) for x in v['legs'] + v['head'] + v['face']]
    layers.append(eyes_and_glasses(v, mood))
    layers += [draw(x) for x in v['collar'] + v['horn'] + v['bangs'] + v['hat']]
    for d in p.get('wires', []):
        layers.append(f'<g fill="none" stroke-linecap="round" filter="url(#wob)"><path d="{d}" stroke="#c9463d" stroke-width="3.2"/>'
                      f'<path d="{d}" transform="translate(0 4)" stroke="#2e2f33" stroke-width="3.2"/></g>')
    layers += [draw(x) for x in p.get('tool', []) + p.get('near_arms', []) + p.get('props', [])]
    figure = ''.join(layers)
    ground = f'<path d="{v["ground"]}" fill="#000" opacity=".13" filter="url(#soft)"/>'
    if p.get('mirror'):
        figure = f'<g transform="translate(240 0) scale(-1 1)">{figure}</g>'
        ground = f'<g transform="translate(240 0) scale(-1 1)">{ground}</g>'
    overlay = ''.join(draw(x) for x in p.get('overlay', []))  # drawn unmirrored (text-like marks read the right way)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" role="img" aria-labelledby="t">\n'
            f'<title id="t">{TITLES[name]}</title>\n<!-- Original Rhino Studio wizard mascot, generated by scripts/wizard_poses.py. -->\n'
            f'{DEFS}\n{ground}\n{figure}\n{overlay}\n</svg>\n')


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for n, p in POSES.items():
        open(os.path.join(OUT, f'rhino-{n}.svg'), 'w').write(build(n, p))
    print('wrote', len(POSES), 'poses to', OUT)
