// Post stack: beauty (MSAA, HDR) → ToonEdgePass (screen-space ink) → bloom → FinalPass (grade, sRGB).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// Ink at distance, in world units from the camera. Every camera closer than INK_FADE_NEAR draws exactly the v2 lines.
const INK_FADE_NEAR = 100, INK_FADE_FAR = 220, INK_FAR_THRESHOLD = 1.0, INK_FAR_CREASE = 0.8, INK_FAR_LINE = 0.3;
// Cables and catenary at a distance are thinner than a pixel, and the ink would follow the aliased copy of them in the depth buffer: stepped chains. Past this range they draw no ink, only
// their own multisampled dark line in the beauty pass. They live in merged batches with everything else, so they are found per triangle in tagWires, by colour and shape.
const WIRE_FADE_NEAR = 90, WIRE_FADE_FAR = 125, WIRE_COLOURS = ['#2b3a42', '#1f2a30', '#46555a', '#3e4648'];
// The soft pass only has to stop ink showing through foliage. Past SOFT_FAR_FROM..SOFT_FAR_TO a layer that averages under SOFT_PX px² a triangle is drawn thinned, by a share that
// grows smoothly as it shrinks on screen, so a zoom walks pieces in and out instead of switching a layer. Only for layers big enough to matter; nothing nearer than SOFT_FAR_FROM changes.
const SOFT_PX = [0.9, 1.5], SOFT_FAR_FROM = 70, SOFT_FAR_TO = 110, SOFT_MIN_TRIS = 3000;

function tagWires(scene) {
  const wires = WIRE_COLOURS.map((c) => new THREE.Color(c)), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), rest = [];
  let maxVerts = 0;
  scene.traverse((m) => {
    if (!m.isMesh || !(m.layers.mask & 1) || !m.geometry.attributes.position) return;
    const g = m.geometry, P = g.attributes.position, C = g.attributes.color, I = g.index, n = (I ? I.count : P.count) / 3;
    let flags = null;
    if (C && !m.isInstancedMesh) for (let t = 0; t < n; t++) {
      const i0 = I ? I.getX(t * 3) : t * 3, i1 = I ? I.getX(t * 3 + 1) : t * 3 + 1, i2 = I ? I.getX(t * 3 + 2) : t * 3 + 2;
      if (!wires.some((w) => Math.abs(C.getX(i0) - w.r) < 1e-4 && Math.abs(C.getY(i0) - w.g) < 1e-4 && Math.abs(C.getZ(i0) - w.b) < 1e-4)) continue;
      a.fromBufferAttribute(P, i0); b.fromBufferAttribute(P, i1); c.fromBufferAttribute(P, i2);
      const ab = a.distanceTo(b), bc = b.distanceTo(c), ca = c.distanceTo(a), lo = Math.min(ab, bc, ca), hi = Math.max(ab, bc, ca);
      if (lo > 0.07 || hi < 0.1 || hi / lo < 3) continue; // a sliver off a thin tube, not a hood or a ring of the same paint
      flags ||= new Uint8Array(P.count); flags[i0] = flags[i1] = flags[i2] = 255;
    }
    if (flags) g.setAttribute('aWire', new THREE.BufferAttribute(flags, 1, true));
    else if (!g.attributes.aWire) { rest.push(g); maxVerts = Math.max(maxVerts, P.count); }
  });
  // Everything else shares one zero buffer: the shader must have a bound attribute to read (see the normal material), and one buffer costs one byte a vertex of the largest mesh.
  const zero = new THREE.BufferAttribute(new Uint8Array(maxVerts), 1, true);
  for (const g of rest) g.setAttribute('aWire', zero);
}

class ToonEdgePass extends Pass {
  constructor(scene, camera, w, h) {
    super();
    this.scene = scene; this.camera = camera;
    this.nrt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.nrt.depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
    this.nrt.depthTexture.minFilter = this.nrt.depthTexture.magFilter = THREE.NearestFilter;
    this.normalMat = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
    // Alpha is the "draws no ink" flag the soft pass already writes. A tagged wire fades into it with distance. Every mesh carries aWire (tagWires), because a shader reading an unbound attribute gets whatever ShaderMaterial last left in that slot.
    this.normalMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('void main() {', 'attribute float aWire; varying float vWire;\nvoid main() {').replace('#include <project_vertex>', `#include <project_vertex>\n  vWire = aWire * smoothstep(${WIRE_FADE_NEAR.toFixed(1)}, ${WIRE_FADE_FAR.toFixed(1)}, gl_Position.w);`);
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'varying float vWire;\nvoid main() {').replace(/}\s*$/, '  gl_FragColor.a *= 1. - vWire;\n}');
    };
    this.size = new THREE.Vector2();
    this.softMat = new THREE.MeshBasicMaterial({ color: 0x8080ff, side: THREE.DoubleSide, transparent: true, opacity: 0, blending: THREE.NoBlending, forceSinglePass: true });
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tColor: { value: null }, tN: { value: null }, tD: { value: null }, uPx: { value: new THREE.Vector2(1 / w, 1 / h) }, uNear: { value: 1 }, uFar: { value: 400 }, uWidth: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader: /* glsl */`
        #include <packing>
        uniform sampler2D tColor,tN,tD; uniform vec2 uPx; uniform float uNear,uFar,uWidth; varying vec2 vUv;
        float z(vec2 uv){ return -perspectiveDepthToViewZ(texture2D(tD,uv).x,uNear,uFar); }
        void main(){
          vec4 c=texture2D(tColor,vUv);
          // One NaN/inf pixel would be smeared across the whole frame by the bloom blur.
          if(any(isnan(c.rgb))||any(isinf(c.rgb))) c=vec4(0.,0.,0.,1.);
          c.rgb=clamp(c.rgb,0.,8.);
          vec2 o=uPx*uWidth;
          vec2 u0=vUv+vec2(-o.x,-o.y),u1=vUv+vec2(o.x,-o.y),u2=vUv+vec2(-o.x,o.y),u3=vUv+vec2(o.x,o.y);
          vec4 nc=texture2D(tN,vUv),n0=texture2D(tN,u0),n1=texture2D(tN,u1),n2=texture2D(tN,u2),n3=texture2D(tN,u3);
          float soft=min(nc.a,min(n0.a,min(n1.a,min(n2.a,n3.a))));
          float dc=z(vUv),d0=z(u0),d1=z(u1),d2=z(u2),d3=z(u3);
          float de=length(vec2(d0-d3,d1-d2))/dc;
          vec3 N=normalize(nc.xyz*2.-1.);
          float graze=pow(1.-clamp(abs(N.z),0.,1.),2.);
          // Ink is a fixed number of pixels wide, so past INK_FADE_NEAR the fine interior lines thin out and the silhouettes stay; nearer than that nothing changes.
          float far=smoothstep(${INK_FADE_NEAR.toFixed(1)},${INK_FADE_FAR.toFixed(1)},min(dc,min(d0,min(d1,min(d2,d3)))));
          float t=(.0055+graze*.05)*(1.+far*${INK_FAR_THRESHOLD.toFixed(2)});
          float e=smoothstep(t,t*2.2,de);
          float ne=length(n0.xyz-n3.xyz)+length(n1.xyz-n2.xyz);
          e=max(e,smoothstep(.55,1.15,ne)*.62*(1.-far*${INK_FAR_CREASE.toFixed(2)}));
          e*=1.-far*${INK_FAR_LINE.toFixed(2)};
          e*=smoothstep(.2,.8,soft);
          vec3 ink=c.rgb*vec3(.20,.24,.30)+vec3(.01,.012,.018);
          gl_FragColor=vec4(mix(c.rgb,ink,e*.88),c.a);
        }`,
      depthTest: false, depthWrite: false,
    }));
  }
  setSize(w, h) { this.nrt.setSize(w, h); this.quad.material.uniforms.uPx.value.set(1 / w, 1 / h); }
  /** Every soft layer big enough to thin, with the numbers that say how big its triangles are on screen. Built once, after the modules. */
  softLayers() {
    if (this.soft) return this.soft;
    this.soft = [];
    const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), mat = new THREE.Matrix4(), box = new THREE.Vector3();
    this.scene.updateMatrixWorld(true);
    this.scene.traverse((m) => {
      if (!m.isMesh || m.layers.mask !== 4) return;
      const g = m.geometry, P = g.attributes.position, I = g.index, n = (I ? I.count : P.count) / 3, count = m.isInstancedMesh ? m.count : 1;
      if (n * count < SOFT_MIN_TRIS) return;
      let area = 0; const step = Math.max(1, Math.floor(n / 240));
      for (let t = 0; t < n; t += step) { const i = (q) => (I ? I.getX(t * 3 + q) : t * 3 + q); v0.fromBufferAttribute(P, i(0)); v1.fromBufferAttribute(P, i(1)); v2.fromBufferAttribute(P, i(2)); area += v1.sub(v0).cross(v2.sub(v0)).length() / 2; }
      area /= Math.ceil(n / step);
      let scale2 = 0, sampled = 0;
      for (let k = 0; k < count; k += Math.max(1, Math.floor(count / 32))) { if (m.isInstancedMesh) m.getMatrixAt(k, mat); else mat.identity(); mat.premultiply(m.matrixWorld); const d = Math.abs(mat.determinant()); if (d > 1e-9) { scale2 += Math.cbrt(d * d); sampled++; } }
      if (!sampled) return;
      if (m.isInstancedMesh) m.computeBoundingSphere(); else if (!g.boundingSphere) g.computeBoundingSphere();
      const sphere = (m.isInstancedMesh ? m.boundingSphere : g.boundingSphere).clone().applyMatrix4(m.matrixWorld);
      this.soft.push({ m, tris: n, area: area * scale2 / sampled, centre: sphere.center, radius: sphere.radius });
    });
    return this.soft;
  }
  /** Thins the far soft layers for one pass. Returns what to put back. */
  thinSoft(renderer) {
    const { camera } = this, H = renderer.getDrawingBufferSize(this.size).y, k = H / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))), undo = [];
    for (const s of this.softLayers()) {
      const d = Math.max(1, camera.position.distanceTo(s.centre) - s.radius * 0.5), far = THREE.MathUtils.smoothstep(d, SOFT_FAR_FROM, SOFT_FAR_TO);
      if (far === 0) continue;
      const px = s.area * 0.5 * (k / d) * (k / d), keep = 1 - far * (1 - THREE.MathUtils.smoothstep(px, SOFT_PX[0], SOFT_PX[1]));
      if (keep >= 1) continue;
      const { m } = s, g = m.geometry;
      if (m.isInstancedMesh) { const count = m.count; m.count = Math.ceil(count * keep); undo.push(() => { m.count = count; }); if (!m.count) { m.visible = false; undo.push(() => { m.visible = true; }); } }
      else { const dc = g.drawRange.count; g.drawRange.count = Math.ceil(s.tris * keep) * 3; undo.push(() => { g.drawRange.count = dc; }); if (!g.drawRange.count) { m.visible = false; undo.push(() => { m.visible = true; }); } }
    }
    return undo;
  }
  render(renderer, writeBuffer, readBuffer) {
    const { scene, camera, nrt } = this, bg = scene.background, fog = scene.fog, cm = camera.layers.mask, ca = renderer.getClearAlpha();
    const cc = renderer.getClearColor(new THREE.Color());
    scene.background = null; scene.fog = null;
    renderer.setRenderTarget(nrt); renderer.setClearColor(0x8080ff, 1); renderer.clear();
    const auto = renderer.autoClear; renderer.autoClear = false;
    const sa = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
    scene.overrideMaterial = this.normalMat; camera.layers.set(0); renderer.render(scene, camera);
    const undo = this.thinSoft(renderer);
    scene.overrideMaterial = this.softMat; camera.layers.set(2); renderer.render(scene, camera);
    for (const f of undo) f();
    scene.overrideMaterial = null; camera.layers.mask = cm;
    renderer.shadowMap.autoUpdate = sa; renderer.autoClear = auto;
    scene.background = bg; scene.fog = fog; renderer.setClearColor(cc, ca);
    const u = this.quad.material.uniforms;
    u.tColor.value = readBuffer.texture; u.tN.value = nrt.texture; u.tD.value = nrt.depthTexture;
    u.uNear.value = camera.near; u.uFar.value = camera.far;
    u.uWidth.value = Math.max(1, renderer.getPixelRatio()) * 0.75;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}

class FinalPass extends Pass {
  constructor() {
    super();
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse; varying vec2 vUv;
        vec3 soft(vec3 c){ return mix(c,1.-exp(-(c-.8)/.2*1.)*.2,step(.8,c)); } // keep mids faithful, shoulder highlights
        void main(){
          vec3 c=texture2D(tDiffuse,vUv).rgb;
          c=soft(max(c,0.));
          float l=dot(c,vec3(.2126,.7152,.0722));
          c+= (1.-smoothstep(.0,.35,l))*vec3(-.004,.012,.018);   // teal lift in the shadows
          c*= mix(vec3(1.),vec3(1.03,1.0,.95),smoothstep(.5,1.,l)); // warm highlights
          c=mix(vec3(l),c,1.07);
          vec2 d=vUv-.5; c*=1.-dot(d,d)*.3;
          gl_FragColor=vec4(c,1.);
          #include <colorspace_fragment>
        }`,
      depthTest: false, depthWrite: false,
    }));
  }
  render(renderer, writeBuffer, readBuffer) {
    this.quad.material.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}

export function createPost(renderer, scene, camera) {
  tagWires(scene);
  const s = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(s.x, s.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  // RenderPass draws into renderTarget2 every frame (ToonEdge and Final are the only swaps, so it never alternates);
  // renderTarget1 only ever takes fullscreen quads, so it needs neither multisampling nor depth.
  composer.renderTarget1.samples = 0; composer.renderTarget1.depthBuffer = false;
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new ToonEdgePass(scene, camera, s.x, s.y));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(s.x / 2, s.y / 2), 0.2, 0.5, 1.12));
  composer.addPass(new FinalPass());
  // The composer read its size from the drawing-buffer-sized target, so re-derive it in CSS pixels + pixel ratio.
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(innerWidth, innerHeight);
  return composer;
}
