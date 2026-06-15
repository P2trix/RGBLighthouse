import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPixelatedPass } from 'three/addons/postprocessing/RenderPixelatedPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const BG = 0x07090F;
const canvas = document.getElementById('canvas');
const loaderEl = document.getElementById('loader');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(canvas.offsetWidth, canvas.offsetHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.fog = new THREE.FogExp2(BG, 0.022);

const camera = new THREE.PerspectiveCamera(45, canvas.offsetWidth / canvas.offsetHeight, 0.1, 1000);
camera.position.set(18, 15, 8);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.04;
controls.target.set(0, 4, 0);
controls.enableZoom = false;
controls.enablePan = false;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.4;

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
composer.addPass(new OutputPass());

scene.add(new THREE.AmbientLight(0x0a1018, 0.12));
const fill = new THREE.DirectionalLight(0x8899aa, 0.15);
fill.position.set(2, 10, 6);
scene.add(fill);

const lightRed   = new THREE.PointLight(0xff1500, 0, 0, 2);
const lightGreen = new THREE.PointLight(0x00ff55, 0, 0, 2);
const lightBlue  = new THREE.PointLight(0x1e5cff, 0, 0, 2);
scene.add(lightRed, lightGreen, lightBlue);
const base = { red: 80, green: 40, blue: 150 };

const beam = new THREE.SpotLight(0xffffff, 0, 0, Math.PI / 14, 0.4, 0);
beam.castShadow = false;
scene.add(beam, beam.target);

/* ── WATER PLANE — GPU Perlin fBm ─────────────────────── */
const waterGeo = new THREE.PlaneGeometry(500, 500, 100, 100);
waterGeo.rotateX(-Math.PI / 2);

const waterMat = new THREE.ShaderMaterial({
  uniforms: {
    ...THREE.UniformsLib.fog,
    uTime:  { value: 0 },
    uColor: { value: new THREE.Color(0x07090F) },
  },
  vertexShader: /* glsl */`
    #include <fog_pars_vertex>
    uniform float uTime;

    float hash(vec2 p) {
      p = fract(p * vec2(127.1, 311.7));
      p += dot(p, p + 19.19);
      return fract(p.x * p.y);
    }
    float vnoise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i), hash(i + vec2(1,0)), u.x),
        mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x),
        u.y
      );
    }
    float fbm(vec2 p) {
      float v = 0.0, a = 0.55;
      for (int i = 0; i < 5; i++) {
        v += a * vnoise(p);
        p  = p * 2.1 + vec2(1.7, 9.2);
        a *= 0.48;
      }
      return v;
    }

    void main() {
      vec3 pos = position;
      vec2 uv  = pos.xz * 0.14 + vec2(uTime * -0.09, uTime * -0.06);
      pos.y   += (fbm(uv) - 0.5) * 3.2;
      vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mvPos;
      #include <fog_vertex>
    }
  `,
  fragmentShader: /* glsl */`
    #include <fog_pars_fragment>
    uniform vec3 uColor;
    void main() {
      gl_FragColor = vec4(uColor, 1.0);
      #include <fog_fragment>
    }
  `,
  fog: true,
  side: THREE.DoubleSide,
});

const water = new THREE.Mesh(waterGeo, waterMat);
water.position.y = -0.3;
scene.add(water);

const beamCones = [];
let beamAngle = 0;
const beamTilt = -0.349;
const size = new THREE.Vector3();
let loaded = false;

new GLTFLoader().load('lighthouse.glb', (gltf) => {
  const model = gltf.scene;
  model.traverse((child) => {
    if (child.isMesh) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach(mat => {
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
  lightRed.position.set(-4.3, 6.0, -3.5);   lightRed.distance = reach;   lightRed.intensity = base.red;
  lightGreen.position.set(2.8, 6.0, -4.6);  lightGreen.distance = reach; lightGreen.intensity = base.green;
  lightBlue.position.set(-1.2, 6.3, 3.8);   lightBlue.distance = reach;  lightBlue.intensity = base.blue;

  beam.position.set(-0.40, 8.64, -0.95);
  const beamLength = Math.max(size.x, size.z) * 1.4;

  const vertexShader = `
    uniform float uHeight;
    varying float vFade;
    void main() {
      vFade = clamp(1.0 - (-position.z / uHeight), 0.0, 1.0);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`;
  const fragmentShader = `
    uniform vec3 uColor;
    uniform float uOpacity;
    varying float vFade;
    void main() { gl_FragColor = vec4(uColor, uOpacity * vFade * vFade); }`;

  /* 3 nested cones — inner sharp core + 2 wide soft halos */
  const layers = [
    { radiusMult: 0.5,  opacity: 0.22 },
    { radiusMult: 1.0,  opacity: 0.10 },
    { radiusMult: 1.85, opacity: 0.04 },
  ];

  layers.forEach(({ radiusMult, opacity }) => {
    const r = beamLength * Math.tan(Math.PI / 18) * radiusMult;
    const geo = new THREE.ConeGeometry(r, beamLength, 48, 1, true);
    geo.translate(0, -beamLength / 2, 0);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor:   { value: new THREE.Color(0xfff8e8) },
        uOpacity: { value: opacity },
        uHeight:  { value: beamLength },
      },
      vertexShader, fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const cone = new THREE.Mesh(geo, mat);
    cone.position.copy(beam.position);
    scene.add(cone);
    beamCones.push(cone);
  });

  loaderEl.classList.add('is-hidden');
  loaded = true;
});

const clock = new THREE.Clock();
let prevT = 0;

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  const dt = Math.min(t - prevT, 0.1);
  prevT = t;

  waterMat.uniforms.uTime.value = t;

  if (loaded) {
    beamAngle += dt * 0.8;
    const ct = Math.cos(beamTilt), st = Math.sin(beamTilt);
    beam.target.position.set(
      beam.position.x + Math.sin(beamAngle) * 40 * ct,
      beam.position.y - st * 40,
      beam.position.z + Math.cos(beamAngle) * 40 * ct
    );
    beam.target.updateMatrixWorld();
    beamCones.forEach(c => c.lookAt(beam.target.position));

    lightRed.intensity   = base.red   * (1 + Math.sin(t * 2.1)     * 0.12);
    lightGreen.intensity = base.green * (1 + Math.sin(t * 1.7 + 1) * 0.12);
    lightBlue.intensity  = base.blue  * (1 + Math.sin(t * 2.5 + 2) * 0.12);
  }

  controls.update();
  composer.render();
}
animate();

const hero = document.querySelector('.hero');
const ro = new ResizeObserver(() => {
  const w = hero.offsetWidth, h = hero.offsetHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.setSize(w, h);
});
ro.observe(hero);
