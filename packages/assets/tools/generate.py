#!/usr/bin/env python3
"""Rebuild Sparko's original vector collection. Requires Pillow for PNG/GIF exports.
All geometry is authored here; there are no network or third-party artwork inputs.
"""
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
BRAND = '#FACC15'
DARK = '#1C1917'
LIGHT = '#FAFAF5'
SOFT = '#FEF9C3'

def poly(points, fill=BRAND, stroke=True, closed=True):
    return {'type':'path', 'points':points, 'fill':fill, 'stroke':stroke, 'closed':closed}
def line(points):
    return poly(points, None, True, False)
def rect(x,y,w,h,r=7,fill=BRAND,stroke=True):
    return {'type':'rect','x':x,'y':y,'w':w,'h':h,'r':r,'fill':fill,'stroke':stroke}
def ellipse(x,y,w,h,fill=BRAND,stroke=True):
    return {'type':'ellipse','x':x,'y':y,'w':w,'h':h,'fill':fill,'stroke':stroke}

# A distinct four-point spark with asymmetrical tips, two eyes and a small smile.
spark = [poly([[48,8],[59,30],[82,37],[65,52],[65,77],[48,65],[26,83],[29,56],[11,41],[35,32]]),ellipse(38,40,5,8,DARK,False),ellipse(54,40,5,8,DARK,False),line([[41,55],[48,59],[55,55]])]
ICONS = {
 'spark':spark,
 'setup-success':[ellipse(17,17,62,62),line([[31,48],[43,60],[65,37]]),line([[75,12],[75,20]]),line([[71,16],[79,16]])],
 'coin':[ellipse(16,16,64,64),ellipse(25,25,46,46,SOFT),line([[48,31],[48,65]]),line([[60,35],[42,35],[36,41],[42,48],[54,48],[60,55],[54,61],[36,61]])],
 'trophy':[poly([[30,19],[66,19],[62,44],[56,53],[40,53],[34,44]]),line([[30,25],[18,25],[20,41],[35,44]]),line([[66,25],[78,25],[76,41],[61,44]]),line([[48,54],[48,69]]),rect(30,70,36,8,3)],
 'ticket':[poly([[17,24],[79,24],[79,39],[70,44],[79,52],[79,70],[17,70],[17,52],[26,44],[17,39]]),line([[57,30],[57,36]]),line([[57,44],[57,50]]),line([[57,58],[57,64]]),line([[31,37],[46,37]]),line([[31,49],[43,49]])],
 'shield':[poly([[48,13],[74,24],[73,51],[64,68],[48,80],[32,68],[23,51],[22,24]]),line([[34,46],[44,56],[63,36]])],
 'welcome':[rect(18,21,60,57,11),poly([[36,29],[63,43],[51,49],[44,64]],SOFT),line([[14,12],[14,20]]),line([[10,16],[18,16]]),line([[75,12],[82,16]])],
 'giveaway':[rect(23,40,50,37,5),rect(18,29,60,14,3),line([[48,31],[48,76]]),poly([[48,29],[31,28],[27,20],[33,13],[43,17],[48,29]],SOFT),poly([[48,29],[64,28],[69,20],[63,13],[54,17],[48,29]],SOFT)],
 'calendar':[rect(18,23,60,56,7),line([[19,40],[77,40]]),line([[32,15],[32,29]]),line([[64,15],[64,29]]),rect(30,50,10,10,2,SOFT),line([[52,56],[57,61],[66,50]])],
 'chart':[line([[20,18],[20,78],[79,78]]),rect(30,49,10,22,2),rect(48,36,10,35,2),rect(66,20,10,51,2),line([[31,34],[47,23],[57,26]])],
 'automation':[ellipse(12,36,23,23),ellipse(60,15,23,23),ellipse(60,59,23,23),line([[35,48],[48,48],[48,26],[60,26]]),line([[48,48],[48,70],[60,70]]),line([[20,48],[26,48]]),line([[71,21],[71,31]]),line([[66,26],[76,26]]),line([[66,70],[76,70]])],
 'settings':[poly([[40,13],[56,13],[59,25],[70,30],[80,28],[86,42],[76,50],[75,61],[80,69],[68,79],[57,71],[47,72],[39,83],[25,76],[27,63],[21,53],[11,49],[16,33],[29,34],[38,26]]),ellipse(34,35,27,27,SOFT)],
 'empty-inbox':[poly([[27,25],[69,25],[82,55],[82,76],[14,76],[14,55]]),poly([[14,55],[34,55],[38,64],[57,64],[62,55],[82,55]],SOFT),line([[39,16],[48,10],[57,16]])],
 'loading':[ellipse(19,19,58,58,SOFT),ellipse(24,24,15,15),ellipse(56,29,9,9),ellipse(61,51,7,7),ellipse(47,66,5,5)],
 'error-retry':[poly([[48,15],[82,74],[14,74]]),line([[48,35],[48,51]]),ellipse(46,59,4,4,DARK,False),line([[70,14],[79,18],[82,26]]),line([[76,26],[82,27],[87,22]])],
}
# Keep internal glyphs dark against yellow/soft fills in either website theme.
for name, indices in {'spark':[3], 'setup-success':[1], 'coin':[2,3], 'ticket':[1,2,3,4,5], 'shield':[1], 'giveaway':[2], 'calendar':[1,5], 'automation':[5,6,7,8], 'error-retry':[1]}.items():
    for index in indices: ICONS[name][index]['darkStroke'] = True

FALLBACK = {'spark':'✨','setup-success':'✅','coin':'🪙','trophy':'🏆','ticket':'🎫','shield':'🛡️','welcome':'👋','giveaway':'🎁','calendar':'📅','chart':'📊','automation':'⚙️','settings':'⚙️','empty-inbox':'📭','loading':'⏳','error-retry':'⚠️'}

def stroke_color(theme): return DARK if theme == 'light' else LIGHT

def svg_shape(s,theme):
    color = DARK if s.get('darkStroke') else stroke_color(theme)
    fill = s['fill'] or 'none'
    attr = f'fill="{fill}" stroke="{color if s["stroke"] else "none"}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"'
    if s['type'] == 'path':
        points = s['points']
        d = 'M'+' L'.join(f'{p[0]} {p[1]}' for p in points)+(' Z' if s['closed'] else '')
        return f'<path d="{d}" {attr}/>'
    if s['type'] == 'rect':
        return f'<rect x="{s["x"]}" y="{s["y"]}" width="{s["w"]}" height="{s["h"]}" rx="{s["r"]}" {attr}/>'
    return f'<ellipse cx="{s["x"]+s["w"]/2}" cy="{s["y"]+s["h"]/2}" rx="{s["w"]/2}" ry="{s["h"]/2}" {attr}/>'

def rgb(hexcolor): return [int(hexcolor[i:i+2],16)/255 for i in (1,3,5)]+[1]
def prop(value): return {'a':0,'k':value}
def frames(values):
    result=[]
    for t,v in values:
        result.append({'t':t,'s':v,'i':{'x':[.67],'y':[1]},'o':{'x':[.33],'y':[0]}})
    return {'a':1,'k':result}
def lottie_shape(s,theme,index):
    if s['type'] == 'path':
        vertices=s['points']; n=len(vertices)
        item={'ty':'sh','ks':prop({'i':[[0,0]]*n,'o':[[0,0]]*n,'v':vertices,'c':s['closed']}),'nm':'Owned path'}
    else:
        item={'ty':'rc' if s['type']=='rect' else 'el','p':prop([s['x']+s['w']/2,s['y']+s['h']/2]),'s':prop([s['w'],s['h']]),'nm':'Owned geometry'}
        if s['type']=='rect': item['r']=prop(s['r'])
    items=[item]
    if s['fill']:
        color=s['fill']
        items.append({'ty':'fl','c':prop(rgb(color)),'o':prop(100),'r':1,'nm':'Fill'})
    if s['stroke']:
        items.append({'ty':'st','c':prop(rgb(DARK if s.get('darkStroke') else stroke_color(theme))),'o':prop(100),'w':prop(3.5),'lc':2,'lj':2,'ml':4,'nm':'Outline'})
    items.append({'ty':'tr','p':prop([0,0]),'a':prop([0,0]),'s':prop([100,100]),'r':prop(0),'o':prop(100),'sk':prop(0),'sa':prop(0)})
    return {'ty':'gr','it':items,'nm':f'Shape {index}'}

def animation(name,shapes,theme):
    return {'v':'5.12.2','fr':30,'ip':0,'op':45,'w':96,'h':96,'nm':f'Sparko {name} {theme}','ddd':0,'assets':[],
    'layers':[{'ddd':0,'ind':1,'ty':4,'nm':name,'sr':1,'ks':{'o':prop(100),'r':frames([(0,[0]),(12,[-3]),(27,[3]),(44,[0])]),'p':frames([(0,[48,48,0]),(12,[48,44,0]),(27,[48,46,0]),(44,[48,48,0])]),'a':prop([48,48,0]),'s':frames([(0,[100,100,100]),(12,[105,105,100]),(27,[100,100,100]),(44,[100,100,100])])},'ao':0,'shapes':[lottie_shape(s,theme,i) for i,s in enumerate(reversed(shapes))],'ip':0,'op':45,'st':0,'bm':0}],
    'markers':[{'tm':0,'cm':'idle','dr':1},{'tm':1,'cm':'interaction','dr':43}]}

def raster(shapes,size=256,offset=0,theme='light'):
    scale=size/96*3
    img=Image.new('RGBA',(size*3,size*3),(0,0,0,0)); draw=ImageDraw.Draw(img)
    color=stroke_color(theme)
    def xy(v): return (v[0]*scale,(v[1]+offset)*scale)
    for s in shapes:
        fill=s['fill']
        outline=(DARK if s.get('darkStroke') else color) if s['stroke'] else None; width=round(3.5*scale)
        if s['type']=='path':
            points=[xy(p) for p in s['points']]
            if s['closed']:
                draw.polygon(points,fill=fill)
                if outline: draw.line(points+[points[0]],fill=outline,width=width,joint='curve')
            elif outline: draw.line(points,fill=outline,width=width,joint='curve')
            if outline:
                for x,y in points: draw.ellipse([x-width/2,y-width/2,x+width/2,y+width/2],fill=outline)
        else:
            bounds=[s['x']*scale,(s['y']+offset)*scale,(s['x']+s['w'])*scale,(s['y']+s['h']+offset)*scale]
            if s['type']=='ellipse': draw.ellipse(bounds,fill=fill,outline=outline,width=width)
            else: draw.rounded_rectangle(bounds,radius=s['r']*scale,fill=fill,outline=outline,width=width)
    return img.resize((size,size),Image.Resampling.LANCZOS)

registry=[]
for name,shapes in ICONS.items():
    variants=[]
    for theme in ['light','dark']:
        animation_path=f'media/lottie/{name}.{theme}.json'
        (ROOT/animation_path).write_text(json.dumps(animation(name,shapes,theme),separators=(',',':'))+'\n')
        svg_path=f'media/svg/{name}.{theme}.svg'
        svg='<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" fill="none">'+''.join(svg_shape(s,theme) for s in shapes)+'</svg>\n'
        (ROOT/svg_path).write_text(svg)
        variants += [{'kind':'lottie','theme':theme,'path':animation_path,'mimeType':'application/json','byteSize':(ROOT/animation_path).stat().st_size,'width':96,'height':96}, {'kind':'svg','theme':theme,'path':svg_path,'mimeType':'image/svg+xml','byteSize':(ROOT/svg_path).stat().st_size,'width':96,'height':96}]
    png_path=f'media/discord/{name}.png'
    raster(shapes).save(ROOT/png_path,optimize=True)
    variants.append({'kind':'discord-static','theme':'light','path':png_path,'mimeType':'image/png','byteSize':(ROOT/png_path).stat().st_size,'width':256,'height':256})
    if name in ['spark','setup-success']:
        gif_path=f'media/discord/{name}.gif'; frames_out=[]
        for i in range(18):
            frame=raster(shapes,128,offset=-3*math.sin(math.pi*i/17))
            # GIF transparency index 255; 255-colour quantization leaves that index reserved.
            background=Image.new('RGB',frame.size,(255,252,243)); background.paste(frame,mask=frame.getchannel('A'))
            pal=background.quantize(colors=255,method=Image.Quantize.MEDIANCUT)
            palette=pal.getpalette(); palette[765:768]=[255,252,243]; pal.putpalette(palette)
            alpha=frame.getchannel('A'); transparency=alpha.point(lambda a:255 if a<128 else 0)
            pal.paste(255,mask=transparency); frames_out.append(pal)
        frames_out[0].save(ROOT/gif_path,save_all=True,append_images=frames_out[1:],duration=70,loop=0,transparency=255,disposal=2,optimize=False)
        variants.append({'kind':'discord-animated','theme':'light','path':gif_path,'mimeType':'image/gif','byteSize':(ROOT/gif_path).stat().st_size,'width':128,'height':128})
    registry.append({'id':name,'version':'1.0.0','license':'CC0-1.0','author':'Sparko contributors','source':'Original geometry in packages/assets/tools/generate.py','dimensions':{'width':96,'height':96},'byteSize':variants[0]['byteSize'],'unicodeFallback':FALLBACK[name],'states':{'idle':[0,0],'hover':[0,44],'focus':[0,44],'active':[0,44],'success':[0,44],'error':[0,44],'disabled':[0,0]},'exportVariants':variants})
(ROOT/'src/metadata.json').write_text(json.dumps(registry,indent=2)+'\n')
# Explicit imports let both bundlers and Node know exactly which assets can be loaded.
imports=[]
for name in ICONS:
    imports.append(f'  "{name}": {{ light: () => import("../media/lottie/{name}.light.json"), dark: () => import("../media/lottie/{name}.dark.json") }}')
(ROOT/'src/loaders.ts').write_text('export const animationLoaders = {\n'+',\n'.join(imports)+'\n} as const;\n')
urls=[]
for entry in registry:
    for variant in entry['exportVariants']:
        urls.append(f'  "{variant["path"]}": new URL("../{variant["path"]}", import.meta.url).href')
(ROOT/'src/urls.ts').write_text('export const assetUrls: Record<string, string> = {\n'+',\n'.join(urls)+'\n};\n')
print(f'Generated {len(ICONS)} original icons, 30 animations and {sum(len(r["exportVariants"]) for r in registry)} total variants.')
