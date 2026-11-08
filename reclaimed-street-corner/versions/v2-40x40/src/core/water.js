// Stylized water + ceiling caustics. Water meshes need uv.x = shore factor (0 at the shore, 1 in the deep);
// use kit.waterDisc / kit.waterField, or supply your own.
import * as THREE from 'three';
import { shared, CANOPY_PLANE_Y, GOBO_SIZE } from './toon.js';
import { P } from './palette.js';

const c3 = (hex) => new THREE.Color(hex);

export function waterMaterial({ shallow = P.waterShallow, deep = P.waterDeep, hi = P.waterHi, opacity = 0.82, scale = 1, indoor = 0 } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      uTime: shared.uTime, uNoise: shared.uNoise, uGobo: shared.uGobo, uSunDir: shared.uSunDir, uRip: shared.uRip,
      cShallow: { value: c3(shallow) }, cDeep: { value: c3(deep) }, cHi: { value: c3(hi) },
      uOpacity: { value: opacity }, uScale: { value: scale }, uIndoor: { value: indoor },
    },
    vertexShader: /* glsl */`
      varying vec3 vW; varying float vShore;
      void main(){ vShore=uv.x; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */`
      uniform float uTime,uOpacity,uScale,uIndoor; uniform sampler2D uNoise,uGobo; uniform vec3 uSunDir,cShallow,cDeep,cHi; uniform vec3 uRip[10];
      varying vec3 vW; varying float vShore;
      float dapple(vec3 p){ float t=(${CANOPY_PLANE_Y.toFixed(1)}-p.y)/uSunDir.y; vec2 q=p.xz+uSunDir.xz*t;
        vec2 s=vec2(sin(uTime*.61+q.y*.22),cos(uTime*.47+q.x*.26))*.24/${GOBO_SIZE.toFixed(1)}; vec2 uv=q/${GOBO_SIZE.toFixed(1)}+.5;
        float c=texture2D(uGobo,uv).r; float f=.5*texture2D(uGobo,uv+s).g+.5*texture2D(uGobo,uv-s*1.35).b; return smoothstep(.56,.60,f+(1.-c)*.9); }
      void main(){
        vec2 p=vW.xz*uScale; float t=uTime;
        vec2 w1=vec2(texture2D(uNoise,p*.07+t*vec2(.012,.009)).r,texture2D(uNoise,p*.07-t*vec2(.008,.013)).g)-.5;
        float n=texture2D(uNoise,p*.19+w1*.28+t*vec2(.016,-.012)).g, n2=texture2D(uNoise,p*.33-w1*.4-t*vec2(.022,.015)).b;
        float shore=clamp(vShore,0.,1.);
        vec3 col=mix(cShallow,cDeep,smoothstep(.05,.95,shore));
        float caust=1.-abs(n-n2)*7.; caust=smoothstep(.72,.8,caust);        // soft ribbons of ripple light
        float rip=0.; for(int i=0;i<10;i++){ vec3 r=uRip[i]; float a=uTime-r.z; if(a>0.&&a<2.4){ float d=length(vW.xz-r.xy); float f=d-a*.62; rip+=smoothstep(.055,.0,abs(f))*(1.-a/2.4)*(1.-a/2.4)*1.1; f=d-a*.36; rip+=smoothstep(.04,.0,abs(f))*(1.-a/2.4)*.5; } }
        float lit=mix(dapple(vW),1.,uIndoor);
        col=mix(col,col*vec3(.72,.86,.92),1.-lit);                          // tree shade cools the water
        col+=cHi*caust*(.08+.14*lit);
        float sparkle=smoothstep(.86,.90,texture2D(uNoise,p*.11+vec2(t*.012,-t*.009)).b*texture2D(uNoise,p*.083-vec2(t*.008,t*.014)).a*2.5)*lit;
        col+=cHi*sparkle*.7;
        float rim=smoothstep(.0,.05,shore)*smoothstep(.17,.10,shore+sin(t*.8+vW.x*2.+vW.z*1.3)*.02);
        col=mix(col,cHi,rim*.55);
        col=mix(col,cHi,clamp(rip,0.,1.));
        float a=mix(.5,uOpacity,smoothstep(.0,.55,shore));
        gl_FragColor=vec4(col,a+rip*.3+sparkle*.3);
        #include <colorspace_fragment>
      }`,
  });
}

/** Shimmering reflected-water light for ceilings/walls. Additive, depthWrite off. Mesh it just below a ceiling. */
export function causticMaterial({ color = '#dffcf0', intensity = 0.55, scale = 1 } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: shared.uTime, uNoise: shared.uNoise, uC: { value: c3(color) }, uI: { value: intensity }, uS: { value: scale } },
    vertexShader: /* glsl */`varying vec3 vW; varying vec2 vUv; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */`
      uniform float uTime,uI,uS; uniform vec3 uC; uniform sampler2D uNoise; varying vec3 vW; varying vec2 vUv;
      void main(){ vec2 p=vW.xz*uS; float t=uTime;
        vec2 w=vec2(texture2D(uNoise,p*.05+t*vec2(.014,.01)).r,texture2D(uNoise,p*.05-t*vec2(.011,.016)).g)-.5;
        float a=texture2D(uNoise,p*.13+w*.35+t*vec2(.02,-.012)).g, b=texture2D(uNoise,p*.17-w*.42-t*vec2(.017,.021)).b;
        float c=smoothstep(.76,.86,1.-abs(a-b)*6.);
        vec2 e=min(vUv,1.-vUv); float f=smoothstep(.0,.22,min(e.x,e.y));
        gl_FragColor=vec4(uC*c*uI*f,1.);
        #include <colorspace_fragment>
      }`,
  });
}

let ri = 0;
/** Trigger a concentric ripple on any water at world (x,z). */
export function addRipple(x, z) { shared.uRip.value[ri].set(x, z, shared.uTime.value); ri = (ri + 1) % 10; }
