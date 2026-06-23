import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPixelatedPass } from 'three/addons/postprocessing/RenderPixelatedPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const BG = 0x07090F;
const canvas = document.getElementById('canvas');
const loaderEl = document.getElementById('loader');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
} catch (e) {
  loaderEl.classList.add('is-hidden');
  canvas.insertAdjacentHTML('afterend',
    `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#9DA4B1;font:14px/1.4 monospace;text-align:center;padding:24px">WebGL jest wyłączony lub sterownik karty graficznej jest uszkodzony.<br><br>Zaktualizuj sterowniki GPU i/lub sprawdź czy WebGL jest włączone w przeglądarce (chrome://gpu).<br><br><small>Jeśli używasz zdalnego pulpitu — WebGL nie działa przez RDP.</small></div>`);
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(canvas.offsetWidth, canvas.offsetHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.fog = new THREE.FogExp2(BG, 0.022);

const camera = new THREE.PerspectiveCamera(45, canvas.offsetWidth / canvas.offsetHeight, 0.1, 1000);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.04;
controls.target.set(0, 4, 0);
controls.enableZoom = false;
controls.enablePan = false;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.4;

controls.minPolarAngle = THREE.MathUtils.degToRad(50);
controls.maxPolarAngle = THREE.MathUtils.degToRad(75);
controls.minDistance   = 16;
controls.maxDistance   = 32;

// Disable all controls on mobile — prevent OrbitControls from capturing touch events
// (CSS pointer-events:none handles the canvas, this is an extra JS safeguard)
function updateMobileInteraction() {
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    controls.enabled = false;
  } else {
    controls.enabled = true;
    controls.enableRotate = true;
  }
}
updateMobileInteraction();

const _pol  = THREE.MathUtils.degToRad(64);
const _azim = THREE.MathUtils.degToRad(111);
const _dist = 22;
camera.position.set(
  controls.target.x + _dist * Math.sin(_pol) * Math.sin(_azim),
  controls.target.y + _dist * Math.cos(_pol),
  controls.target.z + _dist * Math.sin(_pol) * Math.cos(_azim)
);
controls.update();

const composer = new EffectComposer(renderer);
composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
composer.setSize(canvas.offsetWidth, canvas.offsetHeight);

const pixelPass = new RenderPixelatedPass(2, scene, camera, {
  normalEdgeStrength: 0,
  depthEdgeStrength: 0,
});
composer.addPass(pixelPass);

const bloom = new UnrealBloomPass(
  new THREE.Vector2(canvas.offsetWidth, canvas.offsetHeight),
  0.45, 0.5, 0.55
);
composer.addPass(bloom);

const caPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uStrength: { value: 0.0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uStrength;
    varying vec2 vUv;
    void main(){
      vec2 offset = uStrength * (vUv - 0.5);
      float r = texture2D(tDiffuse, vUv - offset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv + offset).b;
      gl_FragColor = vec4(r, g, b, 1.0);
    }`,
});
composer.addPass(caPass);
composer.addPass(new OutputPass());

scene.add(new THREE.AmbientLight(0x0a1018, 0.12));
const fill = new THREE.DirectionalLight(0x8899aa, 0.15);
fill.position.set(2, 10, 6);
scene.add(fill);

const lightRed   = new THREE.PointLight(0xff1500, 0, 0, 2);
const lightGreen = new THREE.PointLight(0x00ff55, 0, 0, 2);
const lightBlue  = new THREE.PointLight(0x1e5cff, 0, 0, 2);
const lightTop   = new THREE.PointLight(0xffffff, 0, 0, 1.5);
scene.add(lightRed, lightGreen, lightBlue, lightTop);
const base = { red: 80, green: 40, blue: 150, top: 0 };

const beam = new THREE.SpotLight(0xffffff, 0, 0, Math.PI / 14, 0.4, 0);
beam.castShadow = false;
scene.add(beam, beam.target);

/* ── WATER PLANE — GPU Perlin fBm + RGB blobs + contour ── */
const waterGeo = new THREE.PlaneGeometry(500, 500, 64, 64);
waterGeo.rotateX(-Math.PI / 2);

const waterMat = new THREE.ShaderMaterial({
  uniforms: {
    ...THREE.UniformsLib.fog,
    uTime:           { value: 0 },
    uNormalStrength: { value: 2.5 },
    uSpeed:          { value: 0.055 },
    uScale:          { value: 0.08 },
    uOpacity:        { value: 1.0 },
    uBaseColor:      { value: new THREE.Color(0.002, 0.003, 0.005) },
    uWavesEnabled:   { value: 1.0 },
    uTexture:        { value: null },
    uTexMix:         { value: 0.0 },
    uLightRPos:     { value: new THREE.Vector3(-4.3, 6.0, -3.5) },
    uLightGPos:     { value: new THREE.Vector3( 2.8, 6.0, -4.6) },
    uLightBPos:     { value: new THREE.Vector3(-1.2, 6.3,  3.8) },
    uLightRInt:     { value: 0.0 },
    uLightGInt:     { value: 0.0 },
    uLightBInt:     { value: 0.0 },
    uContourBright: { value: 0.9 },
    uPsxSnap:       { value: 0.0 },
  },
  vertexShader: /* glsl */`
    #include <fog_pars_vertex>
    uniform float uPsxSnap;
    varying vec3 vWPos;
    void main(){
      vec4 wPos = modelMatrix * vec4(position, 1.0);
      vWPos = wPos.xyz;
      vec4 mvPosition = viewMatrix * wPos;
      gl_Position = projectionMatrix * mvPosition;
      if (uPsxSnap > 0.0) {
        gl_Position.xyz /= gl_Position.w;
        gl_Position.xy = floor(gl_Position.xy * uPsxSnap + 0.5) / uPsxSnap;
        gl_Position.xyz *= gl_Position.w;
      }
      #include <fog_vertex>
    }`,
  fragmentShader: /* glsl */`
    #include <fog_pars_fragment>
    uniform float uTime;
    uniform float uNormalStrength;
    uniform float uSpeed;
    uniform float uScale;
    uniform float uOpacity;
    uniform vec3 uBaseColor;
    uniform float uWavesEnabled;
    uniform sampler2D uTexture;
    uniform float uTexMix;
    uniform vec3 uLightRPos, uLightGPos, uLightBPos;
    uniform float uLightRInt, uLightGInt, uLightBInt;
    uniform float uContourBright;
    varying vec3 vWPos;

    float hash(vec2 p){p=fract(p*vec2(127.1,311.7));p+=dot(p,p+19.19);return fract(p.x*p.y);}
    float vn(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);}
    float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*vn(p);p=p*2.1+vec2(1.7,9.2);a*=.5;}return v;}

    vec3 diffuseBlob(vec3 lPos, vec3 lCol, float lInt){
      vec3 L = normalize(lPos - vWPos);
      float diff = max(L.y, 0.0);
      return lCol * lInt * diff;
    }

    void main(){
      float wOn = uWavesEnabled;
      vec2 radial = normalize(vWPos.xz + vec2(0.001)) * uTime * uSpeed * wOn;
      vec2 uv  = vWPos.xz * uScale + radial;
      vec2 uv2 = vWPos.xz * (uScale * 1.625) + radial * 0.7 + vec2(uTime * 0.02, -uTime * 0.015);

      float eps = 0.04;
      float str = uNormalStrength * wOn;
      float hL=fbm(uv-vec2(eps,0.)),hR=fbm(uv+vec2(eps,0.));
      float hD=fbm(uv-vec2(0.,eps)),hU=fbm(uv+vec2(0.,eps));
      vec3 N1=normalize(vec3((hL-hR)*str,2.*eps,(hD-hU)*str));
      float hL2=fbm(uv2-vec2(eps,0.)),hR2=fbm(uv2+vec2(eps,0.));
      float hD2=fbm(uv2-vec2(0.,eps)),hU2=fbm(uv2+vec2(0.,eps));
      vec3 N2=normalize(vec3((hL2-hR2)*str*.5,2.*eps,(hD2-hU2)*str*.5));
      vec3 N=normalize(N1+N2);

      vec3 V = normalize(cameraPosition - vWPos);

      vec3 col = uBaseColor;
      col += diffuseBlob(uLightRPos, vec3(1.0, 0.05, 0.0),  uLightRInt * 0.0022);
      col += diffuseBlob(uLightGPos, vec3(0.0, 1.0,  0.15), uLightGInt * 0.0022);
      col += diffuseBlob(uLightBPos, vec3(0.1, 0.3,  1.0),  uLightBInt * 0.0022);

      float h = fbm(uv);
      float distFromCenter = length(vWPos.xz);
      float waveZone = 1.0 - smoothstep(8.0, 24.0, distFromCenter);
      float contourVal = fract(h * 8.0);
      float lineWidth = 0.06;
      float contour = smoothstep(lineWidth, 0.0, contourVal)
                    + smoothstep(1.0 - lineWidth, 1.0, contourVal);
      contour *= waveZone * wOn;
      col = mix(col, vec3(0.7, 0.85, 1.0), contour * uContourBright);

      vec3 texCol = texture2D(uTexture, uv * 0.5).rgb;
      col = mix(col, texCol, uTexMix);

      gl_FragColor = vec4(col, uOpacity);
      #include <fog_fragment>
    }`,
  fog: true,
  transparent: true,
  side: THREE.DoubleSide,
});

const water = new THREE.Mesh(waterGeo, waterMat);
water.position.y = 3.5;
scene.add(water);

const beamCones = [];
let beamAngle = 0;
let beamTilt = 0.3;
let beamEnabled = true;
let beamSpeed = 0.8;
const size = new THREE.Vector3();
let loaded = false;

let _pendingSettings = null;
let _modelReady = false;

fetch('settings.json')
  .then((r) => r.ok ? r.json() : null)
  .catch(() => null)
  .then((s) => { _pendingSettings = s; if (_modelReady) applyHeroSettings(s); });

function applyHeroSettings(s) {
  if (!s) return;
  const u = waterMat.uniforms;
  if (s.water) {
    if (s.water.posY           != null) water.position.y          = s.water.posY;
    if (s.water.normalStrength != null) u.uNormalStrength.value   = s.water.normalStrength;
    if (s.water.speed          != null) u.uSpeed.value            = s.water.speed;
    if (s.water.scale          != null) u.uScale.value            = s.water.scale;
    if (s.water.opacity        != null) u.uOpacity.value          = s.water.opacity;
    if (s.water.baseColor      != null) u.uBaseColor.value.set(s.water.baseColor);
    if (s.water.wavesEnabled   != null) u.uWavesEnabled.value     = s.water.wavesEnabled;
    if (s.water.texMix         != null) u.uTexMix.value           = s.water.texMix;
  }
  if (s.beam?.pos) {
    beam.position.set(s.beam.pos.x, s.beam.pos.y, s.beam.pos.z);
    beamCones.forEach((c) => c.position.copy(beam.position));
  }
  if (s.beam?.tilt    != null) beamTilt   = s.beam.tilt;
  if (s.beam?.speed   != null) beamSpeed  = s.beam.speed;
  if (s.beam?.enabled != null) {
    beamEnabled = s.beam.enabled;
    beamCones.forEach((c) => { c.visible = beamEnabled; });
  }
  if (s.pixelSize != null) pixelPass.pixelSize = s.pixelSize;
  if (s.ca        != null) caPass.uniforms.uStrength.value = s.ca;
  if (s.lights?.base) {
    base.red = s.lights.base.red; base.green = s.lights.base.green; base.blue = s.lights.base.blue;
    lightRed.intensity = base.red; lightGreen.intensity = base.green; lightBlue.intensity = base.blue;
  }
  if (s.lights?.red)   lightRed.position.set(...s.lights.red);
  if (s.lights?.green) lightGreen.position.set(...s.lights.green);
  if (s.lights?.blue)  lightBlue.position.set(...s.lights.blue);
  if (s.lights?.base?.top != null) { base.top = s.lights.base.top; lightTop.intensity = base.top; }
  if (s.lights?.top)  lightTop.position.set(...s.lights.top);
  if (s.bloom) {
    if (s.bloom.strength  != null) bloom.strength  = s.bloom.strength;
    if (s.bloom.threshold != null) bloom.threshold = s.bloom.threshold;
    if (s.bloom.radius    != null) bloom.radius    = s.bloom.radius;
  }
  if (s.water?.contourBright != null) u.uContourBright.value = s.water.contourBright;
  if (s.water?.psxSnap       != null) u.uPsxSnap.value       = s.water.psxSnap;
}

new GLTFLoader().load('lighthouse.glb', (gltf) => {
  const model = gltf.scene;
  model.traverse((child) => {
    if (child.isMesh) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((mat) => {
        if (mat.emissiveIntensity !== undefined) mat.emissiveIntensity = Math.max(mat.emissiveIntensity, 1.5);
        mat.needsUpdate = true;
      });
    }
  });

  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  box.getSize(size);
  model.position.set(-center.x, -box.min.y, -center.z);
  scene.add(model);

  const reach = Math.max(size.x, size.z) * 1.2;
  lightRed.position.set(-4.3, 6.0, -3.5);  lightRed.distance   = reach;       lightRed.intensity   = base.red;
  lightGreen.position.set(2.8, 6.0, -4.6); lightGreen.distance = reach;       lightGreen.intensity = base.green;
  lightBlue.position.set(-1.2, 6.3, 3.8);  lightBlue.distance  = reach;       lightBlue.intensity  = base.blue;
  lightTop.position.set(0, size.y * 1.8, 4); lightTop.distance  = reach * 2.5; lightTop.intensity   = base.top;

  beam.position.set(-0.40, 8.64, -0.95);

  const beamLength = Math.max(size.x, size.z) * 1.4;
  const bVert = `
    uniform float uHeight;
    varying float vFade;
    void main(){
      vFade=clamp(1.0-(-position.z/uHeight),0.0,1.0);
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
    }`;
  const bFrag = `
    uniform vec3 uColor;
    uniform float uOpacity;
    varying float vFade;
    void main(){ gl_FragColor=vec4(uColor,uOpacity*vFade*vFade); }`;

  [{ r: 0.5, o: 0.18 }, { r: 1.0, o: 0.08 }, { r: 1.85, o: 0.03 }].forEach(({ r, o }) => {
    const geo = new THREE.ConeGeometry(beamLength * Math.tan(Math.PI / 18) * r, beamLength, 48, 1, true);
    geo.translate(0, -beamLength / 2, 0);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xfff8e8) }, uOpacity: { value: o }, uHeight: { value: beamLength } },
      vertexShader: bVert, fragmentShader: bFrag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const cone = new THREE.Mesh(geo, mat);
    cone.position.copy(beam.position);
    scene.add(cone);
    beamCones.push(cone);
  });

  _modelReady = true;
  if (_pendingSettings) applyHeroSettings(_pendingSettings);

  loaderEl.classList.add('is-hidden');
  loaded = true;
}, undefined, (err) => {
  console.error('GLB load error:', err);
  loaderEl.classList.add('is-hidden');
  loaded = true; // still reveal scene, just without model
});

// Timeout fallback — reveal scene even if model never loads
setTimeout(() => {
  if (!loaded) {
    loaderEl.classList.add('is-hidden');
    loaded = true;
    console.warn('Model load timed out — revealing scene without model');
  }
}, 15000);

const clock = new THREE.Clock();
let prevT = 0;
let _autoAzim = _azim; // tracked azimuth for manual auto-rotate on mobile

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  const dt = Math.min(t - prevT, 0.1);
  prevT = t;

  waterMat.uniforms.uTime.value = t;
  waterMat.uniforms.uLightRInt.value = lightRed.intensity;
  waterMat.uniforms.uLightGInt.value = lightGreen.intensity;
  waterMat.uniforms.uLightBInt.value = lightBlue.intensity;

  if (loaded) {
    if (beamEnabled) {
      beamAngle += dt * beamSpeed;
      const ct = Math.cos(beamTilt), st = Math.sin(beamTilt);
      beam.target.position.set(
        beam.position.x + Math.sin(beamAngle) * 40 * ct,
        beam.position.y - st * 40,
        beam.position.z + Math.cos(beamAngle) * 40 * ct
      );
      beam.target.updateMatrixWorld();
      beamCones.forEach((c) => c.lookAt(beam.target.position));
    }

    lightRed.intensity   = base.red   * (1 + Math.sin(t * 2.1)     * 0.12);
    lightGreen.intensity = base.green * (1 + Math.sin(t * 1.7 + 1) * 0.12);
    lightBlue.intensity  = base.blue  * (1 + Math.sin(t * 2.5 + 2) * 0.12);
    lightTop.intensity   = base.top;
  }

  if (!controls.enabled) {
    _autoAzim += dt * 0.4;
    camera.position.x = controls.target.x + _dist * Math.sin(_pol) * Math.sin(_autoAzim);
    camera.position.z = controls.target.z + _dist * Math.sin(_pol) * Math.cos(_autoAzim);
    camera.lookAt(controls.target);
  } else {
    // sync tracked azimuth with current camera position
    const dx = camera.position.x - controls.target.x;
    const dz = camera.position.z - controls.target.z;
    _autoAzim = Math.atan2(dx, dz);
  }
  controls.update();
  composer.render();
}
animate();

const hero = document.querySelector('.hero-section');
const ro = new ResizeObserver(() => {
  updateMobileInteraction();
  const w = hero.offsetWidth, h = hero.offsetHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.setSize(w, h);
});
ro.observe(hero);
