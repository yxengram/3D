// Post stack: beauty (MSAA, HDR) → ToonEdgePass (screen-space ink) → bloom → FinalPass (grade, sRGB).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

class ToonEdgePass extends Pass {
  constructor(scene, camera, w, h) {
    super();
    this.scene = scene; this.camera = camera;
    this.nrt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.nrt.depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
    this.nrt.depthTexture.minFilter = this.nrt.depthTexture.magFilter = THREE.NearestFilter;
    this.normalMat = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
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
          float t=.0055+graze*.05;
          float e=smoothstep(t,t*2.2,de);
          float ne=length(n0.xyz-n3.xyz)+length(n1.xyz-n2.xyz);
          e=max(e,smoothstep(.55,1.15,ne)*.62);
          e*=smoothstep(.2,.8,soft);
          vec3 ink=c.rgb*vec3(.20,.24,.30)+vec3(.01,.012,.018);
          gl_FragColor=vec4(mix(c.rgb,ink,e*.88),c.a);
        }`,
      depthTest: false, depthWrite: false,
    }));
  }
  setSize(w, h) { this.nrt.setSize(w, h); this.quad.material.uniforms.uPx.value.set(1 / w, 1 / h); }
  render(renderer, writeBuffer, readBuffer) {
    const { scene, camera, nrt } = this, bg = scene.background, fog = scene.fog, cm = camera.layers.mask, ca = renderer.getClearAlpha();
    const cc = renderer.getClearColor(new THREE.Color());
    scene.background = null; scene.fog = null;
    renderer.setRenderTarget(nrt); renderer.setClearColor(0x8080ff, 1); renderer.clear();
    const auto = renderer.autoClear; renderer.autoClear = false;
    const sa = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
    scene.overrideMaterial = this.normalMat; camera.layers.set(0); renderer.render(scene, camera);
    scene.overrideMaterial = this.softMat; camera.layers.set(2); renderer.render(scene, camera);
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
