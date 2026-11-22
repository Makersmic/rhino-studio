import zipfile, sys
def box(x0,y0,z0,x1,y1,z1):
    v=[(x0,y0,z0),(x1,y0,z0),(x1,y1,z0),(x0,y1,z0),(x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1)]
    f=[(0,2,1),(0,3,2),(4,5,6),(4,6,7),(0,1,5),(0,5,4),(1,2,6),(1,6,5),(2,3,7),(2,7,6),(3,0,4),(3,4,7)]
    return v,f
def tee():
    # a T: stem 8x8x20 plus a wide top 40x14x6 overhanging both sides (needs support)
    a=box(-4,-4,0,4,4,20); b=box(-20,-7,20,20,7,26)
    return merge([a,b])
def merge(parts):
    v=[];f=[]
    for pv,pf in parts:
        o=len(v); v+=pv; f+=[(a+o,b+o,c+o) for a,b,c in pf]
    return v,f
def write(path, objs):
    """objs: list of (name, (v,f), extruder, (dx,dy))"""
    res=[];items=[];cfg=['<?xml version="1.0" encoding="UTF-8"?>\n<config>']
    for i,(name,(v,f),ext,(dx,dy)) in enumerate(objs,1):
        vs=''.join(f'<vertex x="{x+dx}" y="{y+dy}" z="{z}"/>\n' for x,y,z in v)
        ts=''.join(f'<triangle v1="{a}" v2="{b}" v3="{c}"/>\n' for a,b,c in f)
        res.append(f'<object id="{i}" type="model"><mesh><vertices>\n{vs}</vertices><triangles>\n{ts}</triangles></mesh></object>')
        items.append(f'<item objectid="{i}" printable="1"/>')
        cfg.append(f'<object id="{i}" instances_count="1"><metadata type="object" key="name" value="{name}"/><metadata type="object" key="extruder" value="{ext}"/><volume firstid="0" lastid="{len(f)-1}"><metadata type="volume" key="name" value="{name}"/><metadata type="volume" key="volume_type" value="ModelPart"/></volume></object>')
    cfg.append('</config>\n')
    model=('<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:slic3rpe="http://schemas.slic3r.org/3mf/2017/06">\n<metadata name="slic3rpe:Version3mf">1</metadata>\n<resources>'+''.join(res)+'</resources>\n<build>'+''.join(items)+'</build></model>\n')
    ct='<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'
    rels='<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'
    with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml',ct); z.writestr('_rels/.rels',rels); z.writestr('3D/3dmodel.model',model); z.writestr('Metadata/Slic3r_PE_model.config',''.join(cfg))
# A: two parts, one per lane
write('t/two_parts.3mf',[('base',box(-15,-15,0,15,15,8),1,(100,100)),('post',box(-5,-5,0,5,5,14),2,(140,100))])
# B: a T on lane 1, supports from lane 2
write('t/tee.3mf',[('tee',tee(),1,(120,100))])
