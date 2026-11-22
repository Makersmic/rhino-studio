import sys,json
from playwright.sync_api import sync_playwright
S=sys.argv[1]
stl=open(S+'/tee.stl').read()
JS="""async([stl,opts])=>{
  const k=await import('/kiri/kiri-studio.js');
  const e=k.createEngine({workURL:'/kiri/kiri-work.js',poolURL:'/kiri/kiri-pool.js'});
  let err=null; e.setListener(m=>{ if(m.slice&&m.slice.error) err=String(m.slice.error) });
  const buf=new TextEncoder().encode(stl).buffer;
  await e.parse(buf);
  e.widget.anno={...e.widget.anno, extruder: opts.partExt};
  const ex=[{extFilament:1.75,extNozzle:0.4,extOffsetX:0,extOffsetY:0},{extFilament:1.75,extNozzle:0.4,extOffsetX:0,extOffsetY:0}];
  e.setMode('FDM').setDevice({bedWidth:300,bedDepth:300,maxHeight:300,originCenter:false,gcodePre:[],gcodePost:[],gcodeFan:['M106 S{fan_speed}'],gcodeLayer:[';LAYER_CHANGE',';Z:{z}'],gcodeTrack:[],gcodeFeature:[],gcodeChange:['SWITCH_LANE LANE={tool}'],extruders:ex});
  e.setProcess({sliceHeight:0.2,firstSliceHeight:0.2,sliceShells:2,sliceTopLayers:3,sliceBottomLayers:3,sliceFillSparse:0.15,sliceFillType:'hex',sliceSupportType:'automatic',sliceSupportAngle:45,sliceSupportDensity:0.15,sliceSupportNozzle:opts.supNozzle,outputPurgeTower:opts.tower,outputFeedrate:50,outputTemp:0,outputBedTemp:0,firstLayerNozzleTemp:0,firstLayerBedTemp:0,outputRetractDist:1,outputRetractSpeed:40});
  e.setTopOffset(0);
  await e.slice(); if(err) return {err};
  await e.prepare(); if(err) return {err};
  const g=await k.exportAny(e);
  return {gcode:g};
}"""
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page()
    pg.goto('http://localhost:5173/',wait_until='domcontentloaded'); pg.wait_for_timeout(800)
    for name,opts in (('K1',{'partExt':0,'supNozzle':1,'tower':False}),('K2',{'partExt':0,'supNozzle':1,'tower':True}),('K0',{'partExt':0,'supNozzle':0,'tower':False})):
        r=pg.evaluate(JS,[stl,opts])
        if 'err' in r: print(name,'ERROR',r['err']); continue
        g=r['gcode']; open(f'{S}/{name}.gcode','w').write(g)
        L=g.splitlines()
        import re,collections
        print(name,opts,'lines',len(L),'| SWITCH_LANE',sum(1 for l in L if l.startswith('SWITCH_LANE')),'| bare T/M6',[l for l in L if re.match(r'^(T\d|M6)',l)][:3],'| M104',sum(1 for l in L if l.startswith('M104')))
        print('   features:',dict(collections.Counter(l for l in L if l.startswith(';; --- ') or l.startswith('; ')).most_common(8)))
    b.close()
