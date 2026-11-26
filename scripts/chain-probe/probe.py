import sys, json, re
from playwright.sync_api import sync_playwright
def box(x0,y0,z0,x1,y1,z1):
    v=[(x0,y0,z0),(x1,y0,z0),(x1,y1,z0),(x0,y1,z0),(x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1)]
    f=[(0,2,1),(0,3,2),(4,5,6),(4,6,7),(0,1,5),(0,5,4),(1,2,6),(1,6,5),(2,3,7),(2,7,6),(3,0,4),(3,4,7)]
    s=''
    for a,b,c in f: s+='facet normal 0 0 0\nouter loop\n'+''.join('vertex %g %g %g\n'%v[i] for i in (a,b,c))+'endloop\nendfacet\n'
    return s
stl='solid t\n'+box(-10,-10,0,10,10,4)+'endsolid t\n'
JS="""async([stl,mv])=>{
  const k=await import('/kiri/kiri-studio.js');
  const e=k.createEngine({workURL:'/kiri/kiri-work.js',poolURL:'/kiri/kiri-pool.js'});
  let err=null; e.setListener(m=>{ if(m.slice&&m.slice.error) err=String(m.slice.error) });
  await e.parse(new TextEncoder().encode(stl).buffer);
  const ex=[{extFilament:1.75,extNozzle:0.4,extOffsetX:0,extOffsetY:0}];
  e.setMode('FDM').setDevice({bedWidth:550,bedDepth:400,maxHeight:300,originCenter:false,gcodePre:[],gcodePost:[],gcodeFan:['M106 S{fan_speed}'],gcodeLayer:[';LAYER_CHANGE',';Z:{z}'],gcodeTrack:[],gcodeFeature:[],extruders:ex});
  e.setProcess({sliceHeight:0.2,firstSliceHeight:0.2,sliceShells:2,sliceTopLayers:3,sliceBottomLayers:3,sliceFillSparse:0.15,sliceFillType:'hex',sliceSupportType:'none',outputFeedrate:50,outputTemp:0,outputBedTemp:0,firstLayerNozzleTemp:0,firstLayerBedTemp:0,outputRetractDist:1,outputRetractSpeed:40});
  e.setTopOffset(0);
  if(mv) e.move(...mv);
  await e.slice(); if(err) return {err};
  await e.prepare(); if(err) return {err};
  return {gcode: await k.exportAny(e)};
}"""
def stats(g):
    xs=[];ys=[];zs=[]
    for l in g.splitlines():
        if l.startswith('G1') and ' E' in l:
            for a,lst in (('X',xs),('Y',ys),('Z',zs)):
                m=re.search(a+r'(-?[\d.]+)',l)
                if m: lst.append(float(m.group(1)))
    r=lambda l:(min(l),max(l)) if l else None
    return dict(lines=len(g.splitlines()),X=r(xs),Y=r(ys),Z=r(zs))
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page()
    pg.goto('http://localhost:5173/kiri/VERSION'); 
    for name,mv in (('plain',None),('xy 100,50',[100,50,0]),('lift z 3.1',[0,0,3.1]),('xy+lift',[100,50,3.1])):
        r=pg.evaluate(JS,[stl,mv])
        if 'err' in r: print(name,'ERROR',r['err']); continue
        print(name,stats(r['gcode']))
        open(name.replace(' ','_').replace(',','_')+'.gcode','w').write(r['gcode'])
    b.close()
