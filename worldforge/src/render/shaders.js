// Custom shader materials (water, atmosphere, clouds, gas giants, rings, stars,
// storms, particles). All lighting uses a per-body world-space sun direction.
import * as THREE from 'three';

const NOISE = /* glsl */ `
float hash31(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash31(i+vec3(0,0,0)),hash31(i+vec3(1,0,0)),f.x),mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5; } return s; }
`;

const CLIP_V = '#include <clipping_planes_pars_vertex>';
const CLIP_F = '#include <clipping_planes_pars_fragment>';

export function makeWaterMaterial(scale) {
  return new THREE.ShaderMaterial({
    transparent: true,
    clipping: true,
    uniforms: {
      uTime: { value: 0 },
      uSun: { value: new THREE.Vector3(1, 0, 0) },
      uScale: { value: scale },
      uWave: { value: 0.5 },
      uShallow: { value: new THREE.Color(0.12, 0.62, 0.72) },
      uDeep: { value: new THREE.Color(0.02, 0.12, 0.34) },
      uMotion: { value: 1 },
      uOverlay: { value: 0 },
    },
    vertexShader: /* glsl */ `
      ${CLIP_V}
      attribute float aDepth; attribute float aRain;
      varying float vDepth; varying vec3 vWorldPos; varying vec3 vNormalW; varying vec3 vLocal; varying float vRain;
      void main(){
        vDepth = aDepth; vLocal = position; vRain = aRain;
        vec4 wp = modelMatrix * vec4(position,1.0);
        vWorldPos = wp.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normalize(position));
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${CLIP_F}
      uniform float uTime; uniform vec3 uSun; uniform float uScale; uniform float uWave; uniform vec3 uShallow; uniform vec3 uDeep; uniform float uMotion; uniform float uOverlay;
      varying float vDepth; varying vec3 vWorldPos; varying vec3 vNormalW; varying vec3 vLocal; varying float vRain;
      ${NOISE}
      void main(){
        #include <clipping_planes_fragment>
        float d = vDepth;
        if (d < 0.004*uScale) discard;
        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 N0 = normalize(vNormalW);
        float t = uTime * uMotion;
        vec3 p = vLocal * (6.0/uScale);
        float camDist0 = length(cameraPosition - vWorldPos);
        float amp = (0.05 + 0.25*uWave) * (1.0 - 0.75*smoothstep(3.0*uScale, 20.0*uScale, camDist0));
        vec3 pert = vec3(vnoise(p*3.0+vec3(t*0.6,0.0,t*0.3)), vnoise(p*3.0+vec3(5.0,t*0.5,1.0)), vnoise(p*3.0+vec3(1.0,2.0,t*0.7))) - 0.5;
        pert += 0.5*(vec3(vnoise(p*9.0+t*1.3), vnoise(p*9.0+3.0-t), vnoise(p*9.0+7.0+t)) - 0.5);
        vec3 N = normalize(N0 + pert*amp);
        float lit = dot(N0, uSun);
        float day = smoothstep(-0.15, 0.25, lit);
        float depthN = clamp(d/(0.22*uScale), 0.0, 1.0);
        vec3 col = mix(uShallow, uDeep, pow(depthN, 0.6));
        float diff = max(dot(N, uSun), 0.0)*0.75 + 0.25;
        vec3 H = normalize(uSun + V);
        float spec = pow(max(dot(N, H), 0.0), 140.0) * 0.9 * day;
        float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
        col = col*diff*(0.2+0.8*day) + vec3(1.0,0.95,0.85)*spec + vec3(0.5,0.7,0.9)*fres*0.35*day;
        // shore foam
        float shore = smoothstep(0.004*uScale, 0.007*uScale, d) * (1.0 - smoothstep(0.008*uScale, 0.016*uScale, d));
        float foam = shore * smoothstep(0.5, 0.8, vnoise(p*14.0 + vec3(0.0, t*1.5, 0.0)) + 0.3*sin(t*2.0 + d*400.0/uScale));
        float camD = length(cameraPosition - vWorldPos);
        foam *= 1.0 - smoothstep(4.0*uScale, 14.0*uScale, camD);
        col = mix(col, vec3(0.92)*(0.3+0.7*day), clamp(foam,0.0,1.0)*0.6);
        // rain impact rings
        if (vRain > 0.01) {
          vec3 q = p*22.0; vec3 cellp = floor(q); vec3 fp = fract(q)-0.5;
          float ph = fract(hash31(cellp)*7.0 + t*1.5);
          float ring = smoothstep(0.04, 0.0, abs(length(fp.xy+fp.z*0.3) - ph*0.5)) * (1.0-ph);
          col += vec3(0.6)*ring*min(1.0, vRain*3.0)*day;
        }
        float alpha = mix(0.5, 0.9, smoothstep(0.004*uScale, 0.12*uScale, d));
        alpha = max(alpha, foam*0.8);
        gl_FragColor = vec4(col, alpha);
      }`,
  });
}

export function makeAtmosphereMaterial(color, strength) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    clipping: true,
    uniforms: { uSun: { value: new THREE.Vector3(1, 0, 0) }, uColor: { value: new THREE.Color(...color) }, uStrength: { value: strength } },
    vertexShader: /* glsl */ `
      ${CLIP_V}
      varying vec3 vN; varying vec3 vW;
      void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vW = wp.xyz; vN = normalize(mat3(modelMatrix)*normal);
        vec4 mvPosition = viewMatrix*wp; gl_Position = projectionMatrix*mvPosition;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${CLIP_F}
      uniform vec3 uSun; uniform vec3 uColor; uniform float uStrength; varying vec3 vN; varying vec3 vW;
      void main(){
        #include <clipping_planes_fragment>
        vec3 V = normalize(cameraPosition - vW);
        float rim = pow(1.0 - abs(dot(-vN, V)), 2.2);
        float inner = smoothstep(0.0, 0.6, 1.0 - abs(dot(-vN, V)));
        float lit = smoothstep(-0.35, 0.45, dot(-vN, uSun));
        float sunset = smoothstep(0.35, 0.0, abs(dot(-vN, uSun))) * 0.6;
        vec3 c = mix(uColor, vec3(1.0,0.55,0.3), sunset*0.6);
        gl_FragColor = vec4(c * rim * inner * lit * uStrength, 1.0);
      }`,
  });
}

export function makeCloudMaterial(scale, deck) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    clipping: true,
    uniforms: { uTime: { value: 0 }, uSun: { value: new THREE.Vector3(1, 0, 0) }, uScale: { value: scale }, uDeck: { value: deck ? 1 : 0 }, uDeckColor: { value: new THREE.Color(0.95, 0.85, 0.6) }, uMotion: { value: 1 }, uFade: { value: 1 } },
    vertexShader: /* glsl */ `
      ${CLIP_V}
      attribute float aCloud; attribute float aStorm;
      varying float vCloud; varying float vStorm; varying vec3 vLocal; varying vec3 vN; varying vec3 vW;
      void main(){ vCloud = aCloud; vStorm = aStorm; vLocal = position; vec4 wp = modelMatrix*vec4(position,1.0); vW = wp.xyz;
        vN = normalize(mat3(modelMatrix)*normalize(position)); vec4 mvPosition = viewMatrix*wp; gl_Position = projectionMatrix*mvPosition;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${CLIP_F}
      uniform float uTime; uniform vec3 uSun; uniform float uScale; uniform float uDeck; uniform vec3 uDeckColor; uniform float uMotion; uniform float uFade;
      varying float vCloud; varying float vStorm; varying vec3 vLocal; varying vec3 vN; varying vec3 vW;
      ${NOISE}
      void main(){
        #include <clipping_planes_fragment>
        vec3 p = vLocal*(2.2/uScale);
        float t = uTime*0.02*uMotion;
        float n = fbm(p*2.0 + vec3(t, 0.0, -t*0.7)) ;
        float n2 = fbm(p*6.0 + vec3(-t*2.0, t, 0.0));
        float cov = vCloud + uDeck*0.85;
        float a = smoothstep(0.35, 0.85, cov*0.85 + (n-0.5)*1.1 + (n2-0.5)*0.45);
        a *= clamp(cov*1.6, 0.0, 1.0) * (0.55 + 0.45*n2);
        float lit = dot(normalize(vN), uSun);
        float day = smoothstep(-0.2, 0.3, lit);
        vec3 base = mix(vec3(1.0), uDeckColor, uDeck);
        base *= mix(1.0, 0.45, clamp(vStorm,0.0,1.0));
        vec3 col = base*(0.12 + 0.88*day) * (0.8 + 0.2*n2);
        gl_FragColor = vec4(col, a*0.92*uFade);
      }`,
  });
}

export function makeGasMaterial(bands, spots) {
  const MAXS = 6;
  const spotArr = [], spotCol = [];
  for (let i = 0; i < MAXS; i++) { spotArr.push(new THREE.Vector4(0, 0, 0, 0)); spotCol.push(new THREE.Color(0, 0, 0)); }
  return new THREE.ShaderMaterial({
    clipping: true,
    uniforms: {
      uTime: { value: 0 }, uSun: { value: new THREE.Vector3(1, 0, 0) },
      uC1: { value: new THREE.Color(...bands.c1) }, uC2: { value: new THREE.Color(...bands.c2) }, uC3: { value: new THREE.Color(...bands.c3) },
      uContrast: { value: bands.contrast }, uSpeed: { value: bands.speed }, uCount: { value: bands.count },
      uSpots: { value: spotArr }, uSpotCol: { value: spotCol }, uMotion: { value: 1 },
    },
    vertexShader: /* glsl */ `
      ${CLIP_V}
      varying vec3 vLocal; varying vec3 vN; varying vec3 vW;
      void main(){ vLocal = normalize(position); vec4 wp = modelMatrix*vec4(position,1.0); vW = wp.xyz; vN = normalize(mat3(modelMatrix)*normal);
        vec4 mvPosition = viewMatrix*wp; gl_Position = projectionMatrix*mvPosition;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${CLIP_F}
      uniform float uTime; uniform vec3 uSun; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform float uContrast; uniform float uSpeed; uniform float uCount; uniform float uMotion;
      uniform vec4 uSpots[6]; uniform vec3 uSpotCol[6];
      varying vec3 vLocal; varying vec3 vN; varying vec3 vW;
      ${NOISE}
      void main(){
        #include <clipping_planes_fragment>
        float lat = asin(clamp(vLocal.y, -1.0, 1.0));
        float lon = atan(vLocal.x, vLocal.z);
        float t = uTime*uMotion;
        // differential rotation per latitude band
        float shear = sin(lat*uCount*0.5)*0.08*uSpeed;
        float lonS = lon + t*shear;
        vec3 q = vec3(cos(lat)*sin(lonS), sin(lat), cos(lat)*cos(lonS));
        float warp = fbm(q*4.0 + vec3(0.0, 0.0, t*0.01*uSpeed));
        float b = sin(lat*uCount + warp*2.5*uContrast + fbm(q*12.0)*0.6);
        vec3 col = mix(uC2, uC1, smoothstep(-0.6, 0.6, b));
        col = mix(col, uC3, smoothstep(0.55, 0.95, b) * 0.7);
        col *= 0.88 + 0.24*fbm(q*20.0 + t*0.02);
        for (int i=0;i<6;i++){
          vec4 s = uSpots[i];
          if (s.z <= 0.0) continue;
          float dl = lon - s.y; dl = atan(sin(dl), cos(dl));
          vec2 d = vec2(dl*cos(lat)/1.6, lat - s.x);
          float r = length(d)/s.z;
          float ang = atan(d.y, d.x) + r*4.0 - t*0.6;
          float swirl = 0.5+0.5*sin(ang*2.0 + r*8.0);
          float m = smoothstep(1.0, 0.0, r) * s.w;
          col = mix(col, uSpotCol[i]*(0.8+0.4*swirl), m*0.85);
          col = mix(col, uC3, smoothstep(1.25, 1.0, r)*smoothstep(0.9,1.0,r)*0.5*s.w);
        }
        float lit = max(dot(normalize(vN), uSun), 0.0);
        float limb = pow(max(dot(normalize(vN), normalize(cameraPosition - vW)), 0.0), 0.35);
        gl_FragColor = vec4(col*(0.06 + 0.94*lit)*mix(0.6,1.0,limb), 1.0);
      }`,
  });
}

export function makeRingMaterial(inner, outer, color, opacity) {
  return new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    uniforms: { uInner: { value: inner }, uOuter: { value: outer }, uColor: { value: new THREE.Color(...color) }, uOpacity: { value: opacity }, uSun: { value: new THREE.Vector3(1, 0, 0) }, uCenter: { value: new THREE.Vector3() }, uPlanetR: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec3 vLocal; varying vec3 vW;
      void main(){ vLocal = position; vec4 wp = modelMatrix*vec4(position,1.0); vW = wp.xyz; gl_Position = projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: /* glsl */ `
      uniform float uInner; uniform float uOuter; uniform vec3 uColor; uniform float uOpacity; uniform vec3 uSun; uniform vec3 uCenter; uniform float uPlanetR;
      varying vec3 vLocal; varying vec3 vW;
      ${NOISE}
      void main(){
        float r = length(vLocal.xy);
        float x = (r - uInner)/(uOuter - uInner);
        if (x < 0.0 || x > 1.0) discard;
        float bands = 0.6 + 0.25*sin(x*31.0) + 0.15*sin(x*67.0+1.3) + 0.1*(vnoise(vec3(x*120.0,0.0,0.0))-0.5);
        bands *= smoothstep(0.0,0.04,x)*smoothstep(1.0,0.93,x);
        float gap = 1.0 - smoothstep(0.012, 0.0, abs(x-0.62))*0.92; // Cassini-like division
        float a = clamp(bands*gap, 0.0, 1.0) * uOpacity;
        // planet shadow: is the point behind the planet relative to the sun?
        vec3 toP = vW - uCenter;
        float along = dot(toP, -uSun);
        float perp = length(toP + uSun*along);
        float shadow = (along > 0.0 && perp < uPlanetR) ? 0.25 : 1.0;
        vec3 col = uColor*(0.75+0.35*vnoise(vec3(x*200.0,0.0,0.0)))*shadow;
        gl_FragColor = vec4(col, a);
      }`,
  });
}

export function makeStarMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(...color) }, uMotion: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec3 vLocal; varying vec3 vN; varying vec3 vW;
      void main(){ vLocal = normalize(position); vec4 wp = modelMatrix*vec4(position,1.0); vW = wp.xyz; vN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uColor; uniform float uMotion; varying vec3 vLocal; varying vec3 vN; varying vec3 vW;
      ${NOISE}
      void main(){
        float t = uTime*0.05*uMotion;
        float g = fbm(vLocal*8.0 + vec3(t, -t, t*0.5));
        float g2 = fbm(vLocal*24.0 - vec3(t*2.0));
        float limb = pow(max(dot(normalize(vN), normalize(cameraPosition - vW)), 0.0), 0.45);
        vec3 hot = mix(uColor, vec3(1.0), 0.55);
        vec3 col = mix(uColor*0.85, hot, g*0.8 + g2*0.3) * (0.55 + 0.6*limb);
        gl_FragColor = vec4(col*1.25, 1.0);
      }`,
  });
}

export function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.2, 'rgba(255,240,200,0.55)');
  grd.addColorStop(0.5, 'rgba(255,200,120,0.12)');
  grd.addColorStop(1, 'rgba(255,180,90,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeSpiralMaterial() {
  // hurricane / dust storm disc on the local tangent plane
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uSpin: { value: 1 }, uIntensity: { value: 1 }, uSun: { value: new THREE.Vector3(1, 0, 0) }, uKind: { value: 0 }, uMotion: { value: 1 }, uTint: { value: new THREE.Color(0.72, 0.52, 0.32) } },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vN;
      void main(){ vUv = uv; vN = normalize(mat3(modelMatrix)*vec3(0.0,0.0,1.0)); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uSpin; uniform float uIntensity; uniform vec3 uSun; uniform float uKind; uniform float uMotion; uniform vec3 uTint;
      varying vec2 vUv; varying vec3 vN;
      ${NOISE}
      void main(){
        vec2 p = vUv*2.0 - 1.0;
        float r = length(p);
        if (r > 1.0) discard;
        float ang = atan(p.y, p.x);
        float t = uTime*uMotion;
        float a;
        vec3 col;
        float lit = smoothstep(-0.2, 0.3, dot(vN, uSun));
        if (uKind < 0.5) {
          // hurricane spiral bands with eye
          float sp = ang*uSpin + log(r+0.03)*3.2 + t*0.8*uSpin;
          float bands = 0.5 + 0.5*sin(sp*3.0);
          float n = fbm(vec3(p*5.0, t*0.05));
          float body = smoothstep(1.0, 0.25, r);
          float eye = smoothstep(0.05, 0.12, r);
          float wall = smoothstep(0.28, 0.12, abs(r-0.16));
          a = clamp(body*(0.35 + 0.65*bands)*(0.6+0.6*n) + wall*0.6, 0.0, 1.0) * eye * uIntensity;
          col = vec3(0.97)*(0.85+0.15*n);
        } else {
          // dust / sandstorm
          float n = fbm(vec3(p*3.0 + vec2(t*0.08, 0.0), t*0.03));
          a = smoothstep(1.0, 0.2, r)*smoothstep(0.25, 0.75, n)*0.8*uIntensity;
          col = uTint*(0.8+0.3*n);
        }
        gl_FragColor = vec4(col*(0.15+0.85*lit), a);
      }`,
  });
}

export function makeFunnelMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0.55, 0.52, 0.5) }, uIntensity: { value: 1 }, uMotion: { value: 1 } },
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uMotion; varying vec2 vUv;
      void main(){ vUv = uv; vec3 p = position;
        float h = uv.y; float w = sin(h*6.0 + uTime*3.0*uMotion)*0.12*(1.0-h)*h*4.0;
        p.x += w; p.z += cos(h*5.0 + uTime*2.5*uMotion)*0.08*h;
        gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uColor; uniform float uIntensity; uniform float uMotion; varying vec2 vUv;
      ${NOISE}
      void main(){
        float stripes = 0.5+0.5*sin(vUv.x*40.0 + vUv.y*18.0 - uTime*14.0*uMotion);
        float n = vnoise(vec3(vUv.x*12.0, vUv.y*8.0 - uTime*2.0, 0.0));
        float a = (0.35 + 0.45*stripes*n) * smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.75, vUv.y) * uIntensity;
        gl_FragColor = vec4(uColor*(0.7+0.4*n), a);
      }`,
  });
}

export function makePointsMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uScale: { value: 300 } },
    vertexShader: /* glsl */ `
      attribute float aSize; attribute vec4 aColor; varying vec4 vColor; uniform float uScale;
      void main(){ vColor = aColor; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*mv;
        gl_PointSize = clamp(aSize*uScale/max(-mv.z, 0.01), 1.0, 48.0); }`,
    fragmentShader: /* glsl */ `
      varying vec4 vColor;
      void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard;
        gl_FragColor = vec4(vColor.rgb, vColor.a * smoothstep(0.5, 0.15, r)); }`,
  });
}

export function makeSkyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {},
    vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      ${NOISE}
      void main(){
        float band = exp(-pow(dot(vDir, normalize(vec3(0.3,0.9,0.2))), 2.0)*10.0);
        float n = fbm(vDir*3.0);
        vec3 col = vec3(0.012,0.016,0.035) + vec3(0.06,0.05,0.10)*band*n + vec3(0.03,0.02,0.05)*smoothstep(0.55,0.9,fbm(vDir*2.0+4.0));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// Patch a Lambert material to add a per-vertex emissive glow (lava/fire) attribute.
export function patchGlow(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.33, 0.06) * vGlow * 1.6;');
  };
  material.customProgramCacheKey = () => 'glow';
  return material;
}
