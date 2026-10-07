// Run: node src/lib/garmentRecolor/selfTestPrintTouchesEdge.mjs  (NOMASK=1 for the on-the-fly detector path)
// Real-world case: a photo of a BLACK tee with a big teal cape print that drapes over the shoulders (touches the outline),
// while the product's first swatch is a different colour. The colour switch must recolour the fabric, never the print.
// Repro: photo has its OWN saved mask; admin's swatch #1 (hint) is not this photo's shirt colour.
import { prepareGarment, renderRecolor } from './core.js'
const W=700,H=760; let seed=7; const rnd=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296)
function scene(printKind){
  const data=new Uint8ClampedArray(W*H*4), truth=new Uint8Array(W*H), mask=new Uint8Array(W*H)
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const p=y*W+x,i=p*4; let rgb=[225,215,198],t=0
    const body=x>190&&x<510&&y>170&&y<640, sl=x>100&&x<=190&&y>170&&y<330, sr=x>=510&&x<600&&y>170&&y<330
    if(body||sl||sr){
      const s=0.55+0.45*Math.abs(Math.sin(x*0.05+Math.sin(y*0.03)*2))*Math.cos(y*0.01)
      const v=Math.max(8,30*s+(rnd()-0.5)*3); rgb=[v,v,v+1]; t=1; mask[p]=255
      const d=Math.hypot(x-350,(y-390)*0.9)
      if(printKind==='cape'&&(d<150||(y<300&&y>=170&&x>140&&x<560))){ rgb=[70+(rnd()*30),150+(rnd()*30),190+(rnd()*20)]; t=2 }   // big blue/teal samurai cape
      if(printKind==='red'&&d<150){ rgb=[170+(rnd()*20),30,35]; t=2 }
    }
    data[i]=rgb[0];data[i+1]=rgb[1];data[i+2]=rgb[2];data[i+3]=255;truth[p]=t
  }
  return {data,truth,mask}
}
let bad=0
for(const [kind,hint] of [['cape','#e8e2d3'],['cape','#ffffff'],['cape','#2a8c9a'],['cape','#4aa0c4'],['cape',null]]){
  seed=7; const {data,truth,mask}=scene(kind)
  const prep=prepareGarment({width:W,height:H,data},{fabricHint:hint,mask:process.env.NOMASK?null:mask})
  if(!prep.ok){console.log(kind,hint,'prepare failed',prep.reason);bad++;continue}
  const out=renderRecolor(prep,'#0a5560'); const n=[0,0,0],c=[0,0,0]
  for(let p=0;p<W*H;p++){n[truth[p]]++; if(out[p*4]!==data[p*4]||out[p*4+1]!==data[p*4+1]||out[p*4+2]!==data[p*4+2])c[truth[p]]++}
  const pc=k=>(100*c[k]/n[k]).toFixed(1)
  const ok=pc(1)>90&&pc(2)<1; if(!ok)bad++
  console.log(`${ok?'OK  ':'FAIL'} print=${kind} hint=${hint} -> fabric ${pc(1)}% recolored, print ${pc(2)}% recolored (detected ${prep.fabricHex})`)
}
process.exit(bad?1:0)
