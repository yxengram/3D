#!/usr/bin/env node
// What the sun's shadow box must hold: every caster's and receiver's real vertices, in the sun's own axes, against the box main.js fitted from SHADOW_BOUNDS.
//   node tools/shadow-fit.mjs [--only a,b]
// Run it when the ring is finished. If `slack` goes negative or stays large, change SHADOW_BOUNDS in src/main.js and nothing else.
import { execFileSync } from 'node:child_process'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const tool = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shot.mjs');
const expr = `(()=>{
  const d=window.__diorama, T=d.THREE, cam=d.sun.shadow.camera; d.step(0); cam.updateMatrixWorld(); const inv=new T.Matrix4().copy(cam.matrixWorld).invert();
  const v=new T.Vector3(), m=new T.Matrix4(), box=()=>({x:[1e9,-1e9],y:[1e9,-1e9],z:[1e9,-1e9],n:0,w:[1e9,-1e9,1e9,-1e9,1e9,-1e9]}), cast=box(), recv=box();
  const add=(b,w)=>{ v.copy(w).applyMatrix4(inv); for(const k of 'xyz'){ b[k][0]=Math.min(b[k][0],v[k]); b[k][1]=Math.max(b[k][1],v[k]); } b.n++; b.w[0]=Math.min(b.w[0],w.x);b.w[1]=Math.max(b.w[1],w.x);b.w[2]=Math.min(b.w[2],w.y);b.w[3]=Math.max(b.w[3],w.y);b.w[4]=Math.min(b.w[4],w.z);b.w[5]=Math.max(b.w[5],w.z); };
  d.scene.updateMatrixWorld(true);
  d.scene.traverse((o)=>{ if(!o.isMesh||!(o.castShadow||o.receiveShadow)||!o.visible) return; const p=o.geometry.attributes.position; if(!p) return;
    const inst=o.isInstancedMesh?o.count:1, step=Math.max(1,Math.floor(p.count*inst/40000)); const w=new T.Vector3();
    for(let k=0;k<inst;k++){ if(o.isInstancedMesh) o.getMatrixAt(k,m); else m.identity(); for(let i=0;i<p.count;i+=step){ w.fromBufferAttribute(p,i).applyMatrix4(m).applyMatrix4(o.matrixWorld); if(o.castShadow) add(cast,w); if(o.receiveShadow) add(recv,w); } } });
  const need=(b)=>({halfX:+Math.max(Math.abs(b.x[0]),Math.abs(b.x[1])).toFixed(2),halfY:+Math.max(Math.abs(b.y[0]),Math.abs(b.y[1])).toFixed(2),depth:[+(-b.z[1]).toFixed(2),+(-b.z[0]).toFixed(2)],world:b.w.map((n)=>+n.toFixed(2)),vertsSampled:b.n});
  const c=need(cast),r=need(recv),h=d.shadow.half; return JSON.stringify({box:{half:+h.toFixed(2),near:d.shadow.near,far:+d.shadow.far.toFixed(2),texel:+(2*h/d.sun.shadow.mapSize.x).toFixed(4)},casters:c,receivers:r,slack:{xy:+(h-Math.max(c.halfX,c.halfY,r.halfX,r.halfY)).toFixed(2),near:+(Math.min(c.depth[0],r.depth[0])-d.shadow.near).toFixed(2),far:+(d.shadow.far-Math.max(c.depth[1],r.depth[1])).toFixed(2)}});
})()`;
const i = process.argv.indexOf('--only'), out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.shots', 'v3', 'engine', 'shadow-fit');
const res = execFileSync('node', [tool, '--out', out, '--cams', 'hero', '--w', '320', '--h', '200', ...(i > 0 ? ['--only', process.argv[i + 1]] : []), '--js', expr], { encoding: 'utf8', maxBuffer: 64e6 }).trim().split('\n').pop();
console.log(JSON.stringify(JSON.parse(JSON.parse(res).extra), null, 1));
