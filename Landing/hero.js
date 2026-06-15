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

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.04;
controls.target.set(0, 4, 0);
controls.enableZoom = false;
controls.enablePan = false;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.4;

/* match standalone scene: polar 64°, azimuth 111°, dist 22 */
controls.minPolarAngle = THREE.MathUtils.degToRad(50);
controls.maxPolarAngle = THREE.MathUtils.degToRad(75);
controls.minDistance   = 16;
controls.maxDistance   = 32;

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
const waterGeo = new THREE.PlaneGeometry(500, 500, 120, 120);
waterGeo.rotateX(-Math.PI / 2);

const waterMat = new THREE.ShaderMaterial({
  uniforms: {
    ...THREE.UniformsLib.fog,
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */`
    #include <fog_pars_vertex>
    uniform float uTime;
    varying float vH;
    varying vec3 vWPos;
    float hash(vec2 p){p=fract(p*vec2(127.1,311.7));p+=dot(p,p+19.19);return fract(p.x*p.y);}
    float vn(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);}
    float fbm(vec2 p){float v=0.,a=.55;for(int i=0;i<5;i++){v+=a*vn(p);p=p*2.1+vec2(1.7,9.2);a*=.48;}return v;}
    void main(){
      vec3 pos=position;
      vec2 uv=pos.xz*0.055+vec2(uTime*-0.07,uTime*-0.045);
      float h=fbm(uv);
      vH=h;
      float falloff=1.0-smoothstep(12.0,35.0,length(pos.xz));
      pos.y+=(h-.5)*7.0*falloff;
      vec4 wPos=modelMatrix*vec4(pos,1.0);
      vWPos=wPos.xyz;
      vec4 mvPosition=viewMatrix*wPos;
      gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: /* glsl */`
    #include <fog_pars_fragment>
    varying float vH;
    varying vec3 vWPos;
    uniform vec3 cameraPosition;
    void main(){
      /* derive surface normal from screen-space height derivatives */
      float dhx=dFdx(vH)*7.0;
      float dhz=dFdy(vH)*7.0;
      vec3 N=normalize(vec3(-dhx,1.0,-dhz));

      vec3 L=normalize(vec3(0.4,1.0,0.6));
      vec3 V=normalize(cameraPosition-vWPos);
      vec3 H=normalize(L+V);

      float diff=max(dot(N,L),0.0)*0.35;
      float spec=pow(max(dot(N,H),0.0),48.0)*0.25;

      vec3 trough=vec3(0.02,0.05,0.12);
      vec3 crest =vec3(0.08,0.18,0.38);
      vec3 col=mix(trough,crest,smoothstep(.3,.75,vH));
      col+=diff*vec3(0.04,0.10,0.20)+spec*vec3(0.6,0.75,0.9);
      gl_FragColor=vec4(col,1.0);
      #include <fog_fragment>
    }`,
  fog: true,
  side: THREE.DoubleSide,
});

const water = new THREE.Mesh(waterGeo, waterMat);
water.position.y = -0.3;
scene.add(water);

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
