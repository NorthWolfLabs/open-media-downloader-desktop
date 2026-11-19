import fs from 'node:fs/promises';
import path from 'node:path';

// Original vector reconstruction from the owner's selected OMD reference.
// No embedded rasters, fonts, external assets, generated texture or filters.
const out = process.argv[2];
if (!out) throw new Error('Pass a fresh output directory.');
try { await fs.access(path.join(out, 'sources', 'omd-master.svg')); throw new Error('Output already exists; use a fresh revision directory.'); }
catch (e) { if (e.code !== 'ENOENT') throw e; }
const mkdir = p => fs.mkdir(p, { recursive: true });
const write = async (p, s) => { await mkdir(path.dirname(p)); await fs.writeFile(p, s); };
const fmt = n => Number(n.toFixed(3));

function roundedPolygon(points, radius) {
  const corners = points.map((b, i) => {
    const a = points[(i + points.length - 1) % points.length];
    const c = points[(i + 1) % points.length];
    const ab = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const cb = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const d = Math.min(radius, ab / 4, cb / 4);
    return { b, enter: [b[0] + (a[0] - b[0]) * d / ab, b[1] + (a[1] - b[1]) * d / ab],
      exit: [b[0] + (c[0] - b[0]) * d / cb, b[1] + (c[1] - b[1]) * d / cb] };
  });
  return `M${corners[0].enter.map(fmt).join(' ')} ` + corners.map((c, i) =>
    `${i ? `L${c.enter.map(fmt).join(' ')} ` : ''}Q${c.b.join(' ')} ${c.exit.map(fmt).join(' ')}`).join(' ') + ' Z';
}

// One physical object, fanned with rigid rotations only: no shear or rescaling.
const commonCard = { vertices:[[-170,0],[170,0],[130,520],[-130,520]], radius:27, symbolAnchor:[0,225] };
const cards = {
  book: { center:[330,136], rotation:-12, color:'#9258e8', dark:'#6027ac', light:'#aa7aef' },
  image: { center:[512,96], rotation:0, color:'#06bca9', dark:'#008b80', light:'#18cdb9' },
  video: { center:[694,136], rotation:12, color:'#fb604f', dark:'#c83d33', light:'#ff7a64' },
};
const world=(c,[x,y])=>{const a=c.rotation*Math.PI/180;return [c.center[0]+x*Math.cos(a)-(y-520)*Math.sin(a),c.center[1]+520+x*Math.sin(a)+(y-520)*Math.cos(a)];};
const placement=c=>`translate(${c.center.join(' ')}) rotate(${c.rotation} 0 520)`;
const commonPath = roundedPolygon(commonCard.vertices,commonCard.radius);
for (const c of Object.values(cards)) {
  c.points = commonCard.vertices.map(p=>world(c,p));
  c.d = commonPath;
}
const back = 'M54 430 C54 385 138 372 236 372 H788 C886 372 970 385 970 430 L938 846 Q931 917 850 928 H174 Q93 917 86 846 Z';
const front = 'M64 444 C126 473 216 479 278 500 L498 598 Q512 611 526 598 L746 500 C808 479 898 473 960 444 L930 851 Q924 921 845 930 H179 Q100 921 94 851 Z';
const frontSide = 'M64 444 L94 859 Q100 940 179 948 H845 Q924 940 930 859 L960 444 L946 453 L916 851 Q910 912 839 916 H185 Q114 912 108 851 L78 453 Z';
const rim = 'M58 430 C130 460 218 470 280 492 L498 590 Q512 603 526 590 L744 492 C806 470 894 460 966 430';
const symbolShapes = {
 book:'<path d="M-88 -58 Q-48 -76 -8 -54 V66 Q-48 46 -88 60 Z M8 -54 Q48 -76 88 -58 V60 Q48 46 8 66 Z"/>',
 image:'<circle cx="47" cy="-48" r="20"/><path d="M-88 54 L-39 -21 Q-33 -30 -27 -21 L11 28 L32 0 Q38 -9 44 0 L89 54 Q96 65 81 65 H-80 Q-96 65 -88 54 Z"/>',
 video:`<path d="${roundedPolygon([[-50,-75],[100,0],[-50,75]],16)}"/>`,
};
const glyphs=Object.fromEntries(Object.entries(cards).map(([key,c])=>[key,`<g transform="${placement(c)} translate(0 ${commonCard.symbolAnchor[1]})">${symbolShapes[key]}</g>`]));
const title = '<title>OMD — capture and keep</title><desc>Three identical compact trapezoidal content cards in a blue V-cut receiver.</desc>';
function defs(style) {
  const a = Object.entries(cards).map(([key,c]) => `<linearGradient id="${key}" x1="0" y1="0" x2="0.4" y2="1"><stop stop-color="${c.light}"/><stop offset="1" stop-color="${c.color}"/></linearGradient>`).join('');
  return `<defs>${a}<linearGradient id="receiver" x1="0" y1="0" x2="0.45" y2="1"><stop stop-color="#087cfa"/><stop offset="1" stop-color="#064fd0"/></linearGradient><linearGradient id="back" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#1176e3"/><stop offset="1" stop-color="#0645a8"/></linearGradient></defs>`;
}
function svg(body, style='master', extra='') {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" ${extra}>${title}${defs(style)}<g transform="translate(30.72 30.72) scale(.94)">${body}</g></svg>\n`;
}
function face(key, style) {
  const c = cards[key];
  return `<path id="${key}-face" d="${c.d}" transform="${placement(c)}" fill="${style==='linux'?c.color:`url(#${key})`}"/>`;
}
function card(key, style) {
  const c = cards[key];
  const depth = style==='linux' ? [0,16] : [12,10];
  return `<g id="card-${key}"><path d="${c.d}" transform="translate(${depth.join(' ')}) ${placement(c)}" fill="${c.dark}"/>${face(key,style)}<g id="symbol-${key}" fill="#fff">${glyphs[key]}</g></g>`;
}
function artwork(style) {
  const flat = style==='linux';
  return `<g id="receiver-back"><path d="${back}" fill="${flat?'#1c5bb5':'url(#back)'}"/></g>` +
    ['image','book','video'].map(k=>card(k,style)).join('') +
    `<g id="receiver-front"><path d="${frontSide}" fill="#0645ad"/><path d="${front}" fill="${flat?'#3584e4':'url(#receiver)'}"/>`+
    (flat?'':`<path d="${rim}" fill="none" stroke="#79c9ff" stroke-width="8" opacity=".78"/>`)+`</g>`;
}

await write(path.join(out,'sources','omd-master.svg'),svg(artwork('master')));
await write(path.join(out,'sources','omd-windows.svg'),svg(`<g transform="translate(10 2) scale(.98)">${artwork('windows')}</g>`,'windows'));
await write(path.join(out,'sources','omd-linux.svg'),svg(`<g transform="translate(30 -4) scale(.94)">${artwork('linux')}</g>`,'linux'));
// Small symbolic mark uses the same tapered leaves and receiving V, without
// content glyphs or a different metaphor. Solid fill is theme-controlled.
const symbolic = ['image','book','video'].map(k=>`<path d="${cards[k].d}" transform="${placement(cards[k])}"/>`).join('')+`<path d="${front}"/>`;
await write(path.join(out,'sources','omd-symbolic.svg'),svg(`<g fill="currentColor" transform="translate(30 -4) scale(.94)">${symbolic}</g>`,'symbolic'));

const icon = path.join(out,'macos','OMD.icon');
const layers = [
  { file:'01-receiver-back.svg', name:'Receiver back', body:`<path d="${back}" fill="#0868d1"/>`, glass:true },
  ...['image','book','video'].map((k,i)=>({file:`0${i+2}-${k}.svg`,name:`${k} wedge`,body:face(k,'macos'),glass:true})),
  { file:'05-side-symbols.svg', name:'Book and video symbols', body:`<g fill="#fff">${glyphs.book}${glyphs.video}</g>`, glass:false },
  { file:'06-image-symbol.svg', name:'Image symbol', body:`<g fill="#fff">${glyphs.image}</g>`, glass:false },
  { file:'07-receiver-front.svg', name:'Receiver front', body:`<path d="${front}" fill="url(#receiver)"/>`, glass:true },
];
for (const layer of layers) await write(path.join(icon,'Assets',layer.file),svg(layer.body,'macos'));
// Icon Composer paints front-to-back; SVG paints back-to-front. The native
// compiler also permits at most FOUR visible groups. Keep symbols above their
// card faces within each depth group, without making them separate groups.
const nativeLayer = l => ({'image-name':l.file,name:l.name,glass:l.glass,position:{scale:1,'translation-in-points':[0,0]}});
const nativeGroup = list => ({layers:list.map(i=>nativeLayer(layers[i])),shadow:{kind:'neutral',opacity:0.18},translucency:{enabled:true,value:0.08}});
const groups = [nativeGroup([6]), nativeGroup([4,3,2]), nativeGroup([5,1]), nativeGroup([0])];
const config = {fill:{solid:'extended-srgb:0.966,0.975,0.993,1.000'},groups,'supported-platforms':{squares:['macOS']}};
await write(path.join(icon,'icon.json'),JSON.stringify(config,null,2)+'\n');
const control = structuredClone(config);
for (const group of control.groups) for (const layer of group.layers) layer.glass=false;
const controlIcon = path.join(out,'qa','GlassOff.icon');
for (const layer of layers) await write(path.join(controlIcon,'Assets',layer.file),svg(layer.body,'macos'));
await write(path.join(controlIcon,'icon.json'),JSON.stringify(control,null,2)+'\n');
await write(path.join(out,'sources','geometry.json'),JSON.stringify({viewBox:[0,0,1024,1024],commonCard,cards:Object.fromEntries(Object.entries(cards).map(([k,c])=>[k,{vertices:c.points,translation:c.center,rotation:c.rotation,localTopEdgeSlope:0,cornerRadius:commonCard.radius,symbolAnchor:world(c,commonCard.symbolAnchor)}])),receiver:{front,back},margins:'Foreground occupies about 90% of canvas width and 83% of height; platform masks retain their external margin.',symbolLayerContainsText:false,embeddedRaster:false},null,2)+'\n');
console.log(JSON.stringify({out,sources:['omd-master.svg','omd-windows.svg','omd-linux.svg','omd-symbolic.svg'],iconDocument:icon,layers:layers.length}));
