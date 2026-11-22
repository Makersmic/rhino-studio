import re,collections,sys
g=open(sys.argv[1]).read().splitlines()
print('lines',len(g))
print('bare T cmds:',[l for l in g if re.match(r'^T\d',l)][:5])
sw=[l for l in g if l.startswith('SWITCH_LANE')]
print('lane changes:',len(sw), sw[:4])
print('temp cmds:',collections.Counter(re.match(r'^(M\d+)',l).group(1) for l in g if re.match(r'^M(104|109|140|190)\b',l)))
print('types:',dict(collections.Counter(l for l in g if l.startswith(';TYPE:'))))
print('comment markers:',[l for l in g if 'RHINO_LANE' in l][:3])
# which lane prints each type: track the last SWITCH_LANE before each ;TYPE line
cur=None;by=collections.defaultdict(set)
for l in g:
    if l.startswith('SWITCH_LANE'): cur=l.split('=')[1]
    if l.startswith(';TYPE:'): by[l[6:]].add(cur)
print('lane per type (None = before any change):',{k:sorted(map(str,v)) for k,v in by.items()})
m=re.search(r'; filament used \[mm\] = (.*)',"\n".join(g)); print('filament mm per lane:',m.group(1) if m else None)
print('wipe tower layers:',sum(1 for l in g if l==';TYPE:Wipe tower'))
