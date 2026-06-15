import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { RenderPixelatedPass } from 'three/addons/postprocessing/RenderPixelatedPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const canvas = document.getElementById('canvas');
const loaderEl = document.getElementById('loader');
const hintEl = document.getElementById('hint');
const errorEl = document.getElementById('error');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 15);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 2, 0);

const composer = new EffectComposer(renderer);
composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
composer.setSize(window.innerWidth, window.innerHeight);

const renderPass = new RenderPass(scene, camera);
renderPass.enabled = false;
composer.addPass(renderPass);

const pixelPass = new RenderPixelatedPass(2, scene, camera, {
  normalEdgeStrength: 0,
  depthEdgeStrength: 0,
});
composer.addPass(pixelPass);

const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.45,
  0.5,
  0.55
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

setupPixelTool(renderPass, pixelPass);

const ambient = new THREE.AmbientLight(0x0a1018, 0.12);
scene.add(ambient);

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
scene.add(beam);
scene.add(beam.target);

/* ── WATER PLANE — GPU fBm ────────────────────────────── */
const waterGeo = new THREE.PlaneGeometry(500, 500, 120, 120);
waterGeo.rotateX(-Math.PI / 2);
const waterMat = new THREE.ShaderMaterial({
  uniforms: {
    ...THREE.UniformsLib.fog,
    uTime: { value: 0 },
    uAmp:  { value: 7.0 },
  },
  vertexShader: /* glsl */`
    #include <fog_pars_vertex>
    uniform float uTime;
    uniform float uAmp;
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
      pos.y+=(h-.5)*uAmp;
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

let beamCone = null;
let beamSpeed = 0.8;
let beamAngle = 0;
let beamTilt = 0.3;

const loader = new GLTFLoader();
const size = new THREE.Vector3();
let loaded = false;

loader.load('lighthouse.glb', (gltf) => {
  const model = gltf.scene;

  model.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach(mat => {
        if (mat.emissiveIntensity !== undefined) {
          mat.emissiveIntensity = Math.max(mat.emissiveIntensity, 1.5);
        }
        mat.needsUpdate = true;
      });
    }
  });

  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  box.getSize(size);

  model.position.x = -center.x;
  model.position.y = -box.min.y;
  model.position.z = -center.z;

  scene.add(model);

  const h = size.y;
  const reach = Math.max(size.x, size.z) * 1.2;

  lightRed.position.set(-4.3, 6.0, -3.5);
  lightRed.distance = reach;
  lightRed.intensity = base.red;

  lightGreen.position.set(2.8, 6.0, -4.6);
  lightGreen.distance = reach;
  lightGreen.intensity = base.green;

  lightBlue.position.set(-1.2, 6.3, 3.8);
  lightBlue.distance = reach;
  lightBlue.intensity = base.blue;

  setupLightTool(h, [
    { key: 'red',   label: 'R', light: lightRed },
    { key: 'green', label: 'G', light: lightGreen },
    { key: 'blue',  label: 'B', light: lightBlue },
  ]);

  beam.position.set(-0.40, 8.64, -0.95);
  beam.intensity = 0;
  beam.target.position.copy(beam.position);

  const beamLength = Math.max(size.x, size.z) * 1.4;
  const beamRadius = beamLength * Math.tan(Math.PI / 18);
  const coneGeo = new THREE.ConeGeometry(beamRadius, beamLength, 40, 1, true);
  coneGeo.translate(0, -beamLength / 2, 0);
  coneGeo.rotateX(Math.PI / 2);
  const coneMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xfff0c0) },
      uOpacity: { value: 0.35 },
      uHeight: { value: beamLength },
    },
    vertexShader: `
      uniform float uHeight;
      varying float vFade;
      void main() {
        vFade = clamp(1.0 - (-position.z / uHeight), 0.0, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vFade;
      void main() { gl_FragColor = vec4(uColor, uOpacity * vFade); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  beamCone = new THREE.Mesh(coneGeo, coneMat);
  beamCone.position.copy(beam.position);
  scene.add(beamCone);

  setupBeamTool(beamCone, coneMat);

  camera.position.set(18, 15, 8);
  controls.target.set(0, 4, 0);
  controls.update();

  loaded = true;
  revealScene();
}, undefined, (err) => {
  const detail = err?.message
    || (err?.target && `HTTP ${err.target.status} loading ${err.target.responseURL || 'lighthouse.glb'}`)
    || String(err);
  console.error('Error loading model:', detail, err);
  loaderEl.classList.add('is-hidden');
  errorEl.hidden = false;
  const slot = errorEl.querySelector('.error__detail');
  if (slot) slot.textContent = detail;
});

function revealScene() {
  loaderEl.classList.add('is-hidden');
  hintEl.classList.add('is-visible');
  setTimeout(() => hintEl.classList.add('is-faded'), 4500);
  controls.addEventListener('start', () => hintEl.classList.add('is-faded'), { once: true });
}

function setupLightTool(h, entries) {
  const markerSize = h * 0.12;
  const markers = entries.map((e) => {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(markerSize, markerSize, markerSize),
      new THREE.MeshBasicMaterial({ color: e.light.color })
    );
    box.position.copy(e.light.position);
    box.userData.light = e.light;
    scene.add(box);
    return { ...e, box };
  });

  const gizmo = new TransformControls(camera, renderer.domElement);
  gizmo.setSize(0.85);
  gizmo.addEventListener('dragging-changed', (ev) => { controls.enabled = !ev.value; });
  gizmo.addEventListener('objectChange', () => {
    if (gizmo.object) { gizmo.object.userData.light.position.copy(gizmo.object.position); refresh(); }
  });
  scene.add(gizmo);

  const raycaster = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  renderer.domElement.addEventListener('pointerdown', (ev) => {
    if (gizmo.dragging) return;
    const rect = renderer.domElement.getBoundingClientRect();
    ptr.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    ptr.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ptr, camera);
    const hit = raycaster.intersectObjects(markers.map((m) => m.box), false)[0];
    if (hit) select(hit.object);
  });

  function select(box) {
    gizmo.attach(box);
    markers.forEach((m) => m.row.classList.toggle('is-active', m.box === box));
    refresh();
  }

  const panel = document.getElementById('lightTool');
  panel.innerHTML =
    '<div class="light-tool__head"><span>Lights — drag boxes / sliders</span>'
    + '<button id="lt-copy" class="light-tool__btn">copy</button>'
    + '<button id="lt-hide" class="light-tool__btn">hide</button></div>';

  markers.forEach((m) => {
    const row = document.createElement('div');
    row.className = 'light-tool__row';
    row.innerHTML =
      `<button class="light-tool__sel" style="background:#${m.light.color.getHexString()}">${m.label}</button>`
      + '<code class="light-tool__pos"></code>'
      + `<input type="range" class="light-tool__int" min="0" max="400" step="2" value="${base[m.key]}">`
      + `<code class="light-tool__intval">${base[m.key]}</code>`;
    panel.appendChild(row);
    m.row = row;
    m.posEl = row.querySelector('.light-tool__pos');
    m.intEl = row.querySelector('.light-tool__intval');
    row.querySelector('.light-tool__sel').addEventListener('click', () => select(m.box));
    const slider = row.querySelector('.light-tool__int');
    slider.addEventListener('input', () => {
      base[m.key] = Number(slider.value);
      m.light.intensity = base[m.key];
      m.intEl.textContent = slider.value;
    });
  });

  function refresh() {
    markers.forEach((m) => {
      const p = m.box.position;
      m.posEl.textContent = `${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`;
    });
  }

  document.getElementById('lt-copy').addEventListener('click', (e) => {
    const text = markers.map((m) => {
      const p = m.box.position;
      return `${m.key}: position(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})  intensity ${base[m.key]}`;
    }).join('\n');
    navigator.clipboard?.writeText(text);
    e.target.textContent = 'copied!';
    setTimeout(() => { e.target.textContent = 'copy'; }, 1200);
  });

  let hidden = false;
  function setHidden(v) {
    hidden = v;
    markers.forEach((m) => { m.box.visible = !hidden; });
    gizmo.visible = !hidden;
    gizmo.enabled = !hidden;
    document.getElementById('lt-hide').textContent = hidden ? 'show' : 'hide';
  }
  document.getElementById('lt-hide').addEventListener('click', () => setHidden(!hidden));

  refresh();
  select(markers[0].box);
  setHidden(true);
}

function setupPixelTool(renderPass, pixelPass) {
  const panel = document.getElementById('pixelTool');
  panel.innerHTML =
    '<div class="pix-tool__head"><span>Pixelate</span>'
    + '<label class="pix-tool__chk"><input type="checkbox" id="px-on" checked> on</label></div>'
    + '<div class="pix-tool__row"><span>Size</span>'
    + `<input type="range" id="px-size" min="1" max="16" step="0.25" value="${pixelPass.pixelSize}">`
    + `<code id="px-sizeval">${pixelPass.pixelSize}</code></div>`;

  const chk = panel.querySelector('#px-on');
  const size = panel.querySelector('#px-size');
  const sizeVal = panel.querySelector('#px-sizeval');

  function setEnabled(on) {
    pixelPass.enabled = on;
    renderPass.enabled = !on;
    size.disabled = !on;
    panel.classList.toggle('is-off', !on);
  }
  chk.addEventListener('change', () => setEnabled(chk.checked));

  size.addEventListener('input', () => {
    const v = Number(size.value);
    pixelPass.setPixelSize(v);
    sizeVal.textContent = v;
  });

  setEnabled(true);
}

function setupBeamTool(cone, mat) {
  const panel = document.getElementById('beamTool');
  const row = (label, id, min, max, step, val) =>
    `<div class="pix-tool__row"><span>${label}</span>`
    + `<input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}">`
    + `<code id="${id}-v">${val}</code></div>`;

  panel.innerHTML =
    '<div class="pix-tool__head"><span>Beam</span>'
    + '<label class="pix-tool__chk"><input type="checkbox" id="bm-on"> on</label></div>'
    + row('Opacity', 'bm-opa', 0, 0.8, 0.01, mat.uniforms.uOpacity.value)
    + row('Speed', 'bm-spd', 0, 3, 0.05, beamSpeed)
    + row('Length', 'bm-len', 0.3, 2, 0.05, 1)
    + row('Angle', 'bm-ang', -20, 90, 1, Math.round((beamTilt * 180) / Math.PI))
    + '<div class="pix-tool__row"><span>Color</span>'
    + `<input type="color" id="bm-col" value="#${mat.uniforms.uColor.value.getHexString()}"></div>`
    + '<div class="pix-tool__row"><span>Pos</span><code id="bm-pos" class="bm-pos"></code></div>'
    + '<div class="pix-tool__btns"><button id="bm-move" class="pix-tool__btn">move</button>'
    + '<button id="bm-copy" class="pix-tool__btn">copy</button></div>';

  const bind = (id, fn) => {
    const el = panel.querySelector('#' + id);
    const out = panel.querySelector('#' + id + '-v');
    el.addEventListener('input', () => { fn(Number(el.value)); out.textContent = el.value; });
  };

  const chk = panel.querySelector('#bm-on');
  cone.visible = false;
  panel.classList.add('is-off');
  chk.addEventListener('change', () => {
    cone.visible = chk.checked;
    panel.classList.toggle('is-off', !chk.checked);
  });

  bind('bm-opa', (v) => { mat.uniforms.uOpacity.value = v; });
  bind('bm-spd', (v) => { beamSpeed = v; });
  bind('bm-len', (v) => { cone.scale.z = v; });
  bind('bm-ang', (v) => { beamTilt = (v * Math.PI) / 180; });

  const col = panel.querySelector('#bm-col');
  col.addEventListener('input', () => { mat.uniforms.uColor.value.set(col.value); });

  const mSize = size.y * 0.1;
  const marker = new THREE.Mesh(
    new THREE.BoxGeometry(mSize, mSize, mSize),
    new THREE.MeshBasicMaterial({ color: mat.uniforms.uColor.value, wireframe: true })
  );
  marker.position.copy(beam.position);
  marker.visible = false;
  scene.add(marker);

  const gizmo = new TransformControls(camera, renderer.domElement);
  gizmo.setSize(0.8);
  gizmo.visible = false;
  gizmo.enabled = false;
  gizmo.addEventListener('dragging-changed', (e) => { controls.enabled = !e.value; });
  gizmo.addEventListener('objectChange', () => {
    beam.position.copy(marker.position);
    cone.position.copy(marker.position);
    updatePos();
  });
  scene.add(gizmo);

  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  renderer.domElement.addEventListener('pointerdown', (ev) => {
    if (!marker.visible || gizmo.dragging) return;
    const rect = renderer.domElement.getBoundingClientRect();
    ptr.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    ptr.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(ptr, camera);
    if (ray.intersectObject(marker, false).length) gizmo.attach(marker);
  });

  const posEl = panel.querySelector('#bm-pos');
  function updatePos() {
    const p = marker.position;
    posEl.textContent = `${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}`;
  }
  updatePos();

  const moveBtn = panel.querySelector('#bm-move');
  moveBtn.addEventListener('click', () => {
    const on = !marker.visible;
    marker.visible = on;
    gizmo.visible = on;
    gizmo.enabled = on;
    if (on) gizmo.attach(marker); else gizmo.detach();
    moveBtn.textContent = on ? 'done' : 'move';
  });

  panel.querySelector('#bm-copy').addEventListener('click', (e) => {
    const p = marker.position;
    navigator.clipboard?.writeText(`beam.position.set(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)});`);
    e.target.textContent = 'copied!';
    setTimeout(() => { e.target.textContent = 'copy'; }, 1200);
  });
}

function setupWaterTool() {
  const panel = document.getElementById('waterTool');
  panel.innerHTML =
    '<div class="pix-tool__head"><span>Water</span></div>'
    + '<div class="pix-tool__row"><span>Amp</span>'
    + '<input type="range" id="wt-amp" min="0" max="20" step="0.5" value="7">'
    + '<code id="wt-amp-v">7.0</code></div>';

  const slider = panel.querySelector('#wt-amp');
  const val    = panel.querySelector('#wt-amp-v');
  slider.addEventListener('input', () => {
    const v = Number(slider.value);
    waterMat.uniforms.uAmp.value = v;
    val.textContent = v.toFixed(1);
  });
}

function setupCamTool() {
  const panel = document.getElementById('camTool');
  const RAD = THREE.MathUtils.radToDeg;

  /* default limits */
  controls.minPolarAngle = THREE.MathUtils.degToRad(5);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(85);
  controls.minDistance   = 8;
  controls.maxDistance   = 60;

  panel.innerHTML =
    '<div class="pix-tool__head"><span>Camera</span>'
    + '<span id="cam-status" class="cam-tool__locked">● FREE</span></div>'
    + '<div class="cam-tool__vals">'
    +   '<div class="cam-tool__val"><span class="cam-tool__val-label">POLAR°</span><span class="cam-tool__val-num" id="cv-polar">—</span></div>'
    +   '<div class="cam-tool__val"><span class="cam-tool__val-label">AZIMUTH°</span><span class="cam-tool__val-num" id="cv-azim">—</span></div>'
    +   '<div class="cam-tool__val"><span class="cam-tool__val-label">DIST</span><span class="cam-tool__val-num" id="cv-dist">—</span></div>'
    + '</div>'
    + '<hr class="cam-tool__divider">'
    + '<div class="cam-tool__limit-row"><label>Min polar</label><input type="range" id="cl-minpol" min="0" max="89" step="1" value="5"><code id="cl-minpol-v">5°</code></div>'
    + '<div class="cam-tool__limit-row"><label>Max polar</label><input type="range" id="cl-maxpol" min="1" max="90" step="1" value="85"><code id="cl-maxpol-v">85°</code></div>'
    + '<div class="cam-tool__limit-row"><label>Min dist</label><input type="range" id="cl-mind" min="1" max="40" step="0.5" value="8"><code id="cl-mind-v">8</code></div>'
    + '<div class="cam-tool__limit-row"><label>Max dist</label><input type="range" id="cl-maxd" min="10" max="100" step="1" value="60"><code id="cl-maxd-v">60</code></div>';

  const bind = (id, fn) => {
    const el = panel.querySelector('#' + id);
    const out = panel.querySelector('#' + id + '-v');
    el.addEventListener('input', () => { fn(Number(el.value)); out.textContent = el.value + (id.includes('pol') ? '°' : ''); });
  };
  bind('cl-minpol', v => { controls.minPolarAngle = THREE.MathUtils.degToRad(v); });
  bind('cl-maxpol', v => { controls.maxPolarAngle = THREE.MathUtils.degToRad(v); });
  bind('cl-mind',   v => { controls.minDistance = v; });
  bind('cl-maxd',   v => { controls.maxDistance = v; });

  const polEl   = panel.querySelector('#cv-polar');
  const azimEl  = panel.querySelector('#cv-azim');
  const distEl  = panel.querySelector('#cv-dist');
  const statEl  = panel.querySelector('#cam-status');

  const minPolEl = panel.querySelector('#cl-minpol');
  const maxPolEl = panel.querySelector('#cl-maxpol');

  function tick() {
    const pol  = RAD(controls.getPolarAngle());
    const azim = RAD(controls.getAzimuthalAngle());
    const dist = controls.getDistance();

    polEl.textContent  = pol.toFixed(1) + '°';
    azimEl.textContent = ((azim % 360 + 360) % 360).toFixed(1) + '°';
    distEl.textContent = dist.toFixed(1);

    const minPol = RAD(controls.minPolarAngle);
    const maxPol = RAD(controls.maxPolarAngle);
    const atLimit = pol <= minPol + 0.5 || pol >= maxPol - 0.5
                 || dist <= controls.minDistance + 0.1
                 || dist >= controls.maxDistance - 0.1;

    statEl.textContent = atLimit ? '● LIMIT' : '● FREE';
    statEl.className   = atLimit ? 'cam-tool__warn' : 'cam-tool__locked';

    requestAnimationFrame(tick);
  }
  tick();
}

setupWaterTool();
setupCamTool();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloom.setSize(window.innerWidth, window.innerHeight);
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
    beamAngle += dt * beamSpeed;
    const ct = Math.cos(beamTilt), st = Math.sin(beamTilt);
    beam.target.position.set(
      beam.position.x + Math.sin(beamAngle) * 40 * ct,
      beam.position.y - st * 40,
      beam.position.z + Math.cos(beamAngle) * 40 * ct
    );
    beam.target.updateMatrixWorld();

    if (beamCone) beamCone.lookAt(beam.target.position);

    lightRed.intensity   = base.red   * (1 + Math.sin(t * 2.1)     * 0.12);
    lightGreen.intensity = base.green * (1 + Math.sin(t * 1.7 + 1) * 0.12);
    lightBlue.intensity  = base.blue  * (1 + Math.sin(t * 2.5 + 2) * 0.12);
  }

  controls.update();
  composer.render();
}
animate();
