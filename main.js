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
  0.45, 0.5, 0.55
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

  beam.position.set(0, h * 0.95, 0);
  beam.intensity = 6;

  camera.position.set(18, 15, 8);
  controls.target.set(0, 4, 0);
  controls.update();

  loaded = true;
  revealScene();
}, undefined, (err) => {
  const detail = err?.message || String(err);
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
  const sizeInput = panel.querySelector('#px-size');
  const sizeVal = panel.querySelector('#px-sizeval');

  function setEnabled(on) {
    pixelPass.enabled = on;
    renderPass.enabled = !on;
    sizeInput.disabled = !on;
    panel.classList.toggle('is-off', !on);
  }
  chk.addEventListener('change', () => setEnabled(chk.checked));

  sizeInput.addEventListener('input', () => {
    const v = Number(sizeInput.value);
    pixelPass.setPixelSize(v);
    sizeVal.textContent = v;
  });

  setEnabled(true);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloom.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  if (loaded) {
    const angle = t * 0.8;
    beam.target.position.set(
      beam.position.x + Math.sin(angle) * 40,
      0,
      beam.position.z + Math.cos(angle) * 40
    );
    beam.target.updateMatrixWorld();

    lightRed.intensity   = base.red   * (1 + Math.sin(t * 2.1)     * 0.12);
    lightGreen.intensity = base.green * (1 + Math.sin(t * 1.7 + 1) * 0.12);
    lightBlue.intensity  = base.blue  * (1 + Math.sin(t * 2.5 + 2) * 0.12);
  }

  controls.update();
  composer.render();
}
animate();
