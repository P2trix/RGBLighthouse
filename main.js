import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { RenderPixelatedPass } from 'three/addons/postprocessing/RenderPixelatedPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

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
scene.background = new THREE.Color(0x07090F);
scene.fog = new THREE.FogExp2(0x07090F, 0.018);

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

/* ── WATER — flat plane + procedural normal map ───────── */
const waterGeo = new THREE.PlaneGeometry(500, 500, 4, 4);
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
    uLightRPos:   { value: new THREE.Vector3(-4.3, 6.0, -3.5) },
    uLightGPos:   { value: new THREE.Vector3( 2.8, 6.0, -4.6) },
    uLightBPos:   { value: new THREE.Vector3(-1.2, 6.3,  3.8) },
    uLightRInt:   { value: 0.0 },
    uLightGInt:   { value: 0.0 },
    uLightBInt:   { value: 0.0 },
  },
  vertexShader: /* glsl */`
    #include <fog_pars_vertex>
    varying vec3 vWPos;
    void main(){
      vec4 wPos = modelMatrix * vec4(position, 1.0);
      vWPos = wPos.xyz;
      vec4 mvPosition = viewMatrix * wPos;
      gl_Position = projectionMatrix * mvPosition;
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

      col = mix(col, vec3(0.7, 0.85, 1.0), contour * 0.9);

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

/* ── BEAM STATE ─────────────────────────────────────────── */
let beamCones = [];
let beamEnabled = false;
let beamSpeed = 0.8;
let beamAngle = 0;
let beamTilt = 0.3;
let beamLengthScale = 1.0;
let beamColorHex = 'fff8e8';

const CONE_DEFS = [
  { r: 0.5,  baseO: 0.18 },
  { r: 1.0,  baseO: 0.08 },
  { r: 1.85, baseO: 0.03 },
];

/* ── GLB MODEL LIST ─────────────────────────────────────── */
const GLB_MODELS = [
  { name: 'Default', url: 'lighthouse.glb' },
  // add more: { name: 'Lighthouse v2', url: 'lighthouse2.glb' },
];

let currentModel = null;
const loader = new GLTFLoader();
const modelSize = new THREE.Vector3();
let loaded = false;
let toolsInitialized = false;

function loadModel(url) {
  if (currentModel) {
    scene.remove(currentModel);
    currentModel.traverse((c) => {
      if (c.isMesh) {
        c.geometry.dispose();
        const ms = Array.isArray(c.material) ? c.material : [c.material];
        ms.forEach((m) => m.dispose());
      }
    });
    currentModel = null;
  }
  beamCones.forEach((c) => { scene.remove(c); c.geometry.dispose(); c.material.dispose(); });
  beamCones = [];
  loaded = false;

  loader.load(url, (gltf) => {
    const model = gltf.scene;

    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((mat) => {
          if (mat.emissiveIntensity !== undefined) mat.emissiveIntensity = Math.max(mat.emissiveIntensity, 1.5);
          mat.needsUpdate = true;
        });
      }
    });

    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    box.getSize(modelSize);
    model.position.set(-center.x, -box.min.y, -center.z);
    scene.add(model);
    currentModel = model;

    const reach = Math.max(modelSize.x, modelSize.z) * 1.2;
    lightRed.position.set(-4.3, 6.0, -3.5);  lightRed.distance   = reach; lightRed.intensity   = base.red;
    lightGreen.position.set(2.8, 6.0, -4.6); lightGreen.distance = reach; lightGreen.intensity = base.green;
    lightBlue.position.set(-1.2, 6.3, 3.8);  lightBlue.distance  = reach; lightBlue.intensity  = base.blue;

    beam.position.set(-0.40, 8.64, -0.95);
    beam.intensity = 0;
    beam.target.position.copy(beam.position);

    const beamLength = Math.max(modelSize.x, modelSize.z) * 1.4;
    const bVert = `uniform float uHeight;varying float vFade;void main(){vFade=clamp(1.0-(-position.z/uHeight),0.0,1.0);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
    const bFrag = `uniform vec3 uColor;uniform float uOpacity;varying float vFade;void main(){gl_FragColor=vec4(uColor,uOpacity*vFade*vFade);}`;

    CONE_DEFS.forEach((def) => {
      const geo = new THREE.ConeGeometry(beamLength * Math.tan(Math.PI / 18) * def.r, beamLength, 48, 1, true);
      geo.translate(0, -beamLength / 2, 0);
      geo.rotateX(Math.PI / 2);
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uColor:   { value: new THREE.Color('#' + beamColorHex) },
          uOpacity: { value: def.baseO },
          uHeight:  { value: beamLength },
        },
        vertexShader: bVert,
        fragmentShader: bFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const cone = new THREE.Mesh(geo, mat);
      cone.position.copy(beam.position);
      cone.visible = beamEnabled;
      cone.scale.z = beamLengthScale;
      scene.add(cone);
      beamCones.push(cone);
    });

    if (!toolsInitialized) {
      setupLightTool(modelSize.y, [
        { key: 'red',   label: 'R', light: lightRed },
        { key: 'green', label: 'G', light: lightGreen },
        { key: 'blue',  label: 'B', light: lightBlue },
      ]);
      setupBeamTool();
      camera.position.set(18, 15, 8);
      controls.target.set(0, 4, 0);
      controls.update();
      toolsInitialized = true;
    }

    loaded = true;
    revealScene();
  }, undefined, (err) => {
    const detail = err?.message
      || (err?.target && `HTTP ${err.target.status} loading ${err.target.responseURL || url}`)
      || String(err);
    console.error('Error loading model:', detail, err);
    loaderEl.classList.add('is-hidden');
    errorEl.hidden = false;
    const slot = errorEl.querySelector('.error__detail');
    if (slot) slot.textContent = detail;
  });
}

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
  const row = (label, id, min, max, step, val, fmt) =>
    `<div class="pix-tool__row"><span>${label}</span>`
    + `<input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}">`
    + `<code id="${id}-v">${fmt ? Number(val).toFixed(fmt) : val}</code></div>`;

  const panel = document.getElementById('pixelTool');
  panel.innerHTML =
    '<div class="pix-tool__head"><span>Pixelate</span>'
    + '<label class="pix-tool__chk"><input type="checkbox" id="px-on" checked> on</label></div>'
    + row('Size', 'px-size', 1, 16, 0.25, pixelPass.pixelSize)
    + row('CA',   'px-ca',   0, 0.02, 0.0005, 0, 4)
    + '<div class="pix-tool__head" style="margin-top:10px;border-top:1px solid rgba(157,164,177,0.12);padding-top:8px"><span>Bloom</span></div>'
    + row('Str', 'bl-str', 0, 3,   0.05, bloom.strength,  2)
    + row('Thr', 'bl-thr', 0, 1,   0.01, bloom.threshold, 2)
    + row('Rad', 'bl-rad', 0, 1,   0.01, bloom.radius,    2);

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

  const bind = (id, fn, fmt) => {
    const el = panel.querySelector('#' + id);
    const out = panel.querySelector('#' + id + '-v');
    el.addEventListener('input', () => {
      const v = Number(el.value);
      fn(v);
      out.textContent = fmt ? v.toFixed(fmt) : el.value;
    });
  };

  bind('px-ca',  (v) => { caPass.uniforms.uStrength.value = v; }, 4);
  bind('bl-str', (v) => { bloom.strength  = v; });
  bind('bl-thr', (v) => { bloom.threshold = v; });
  bind('bl-rad', (v) => { bloom.radius    = v; });

  setEnabled(true);
}

function setupBeamTool() {
  const panel = document.getElementById('beamTool');
  const row = (label, id, min, max, step, val) =>
    `<div class="pix-tool__row"><span>${label}</span>`
    + `<input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}">`
    + `<code id="${id}-v">${val}</code></div>`;

  panel.innerHTML =
    '<div class="pix-tool__head"><span>Beam</span>'
    + '<label class="pix-tool__chk"><input type="checkbox" id="bm-on"> on</label></div>'
    + row('Opacity', 'bm-opa', 0, 1.5, 0.05, 1.0)
    + row('Speed',   'bm-spd', 0, 3,   0.05, beamSpeed)
    + row('Length',  'bm-len', 0.3, 2, 0.05, 1)
    + row('Angle',   'bm-ang', -20, 90, 1, Math.round((beamTilt * 180) / Math.PI))
    + '<div class="pix-tool__row"><span>Color</span>'
    + `<input type="color" id="bm-col" value="#${beamColorHex}"></div>`
    + '<div class="pix-tool__row"><span>Pos</span><code id="bm-pos" class="bm-pos"></code></div>'
    + '<div class="pix-tool__btns"><button id="bm-move" class="pix-tool__btn">move</button>'
    + '<button id="bm-copy" class="pix-tool__btn">copy</button></div>';

  const bind = (id, fn) => {
    const el = panel.querySelector('#' + id);
    const out = panel.querySelector('#' + id + '-v');
    el.addEventListener('input', () => { fn(Number(el.value)); out.textContent = el.value; });
  };

  const chk = panel.querySelector('#bm-on');
  panel.classList.add('is-off');
  chk.addEventListener('change', () => {
    beamEnabled = chk.checked;
    beamCones.forEach((c) => { c.visible = beamEnabled; });
    panel.classList.toggle('is-off', !beamEnabled);
  });

  bind('bm-opa', (v) => {
    CONE_DEFS.forEach((def, i) => {
      if (beamCones[i]) beamCones[i].material.uniforms.uOpacity.value = def.baseO * v;
    });
  });
  bind('bm-spd', (v) => { beamSpeed = v; });
  bind('bm-len', (v) => {
    beamLengthScale = v;
    beamCones.forEach((c) => { c.scale.z = v; });
  });
  bind('bm-ang', (v) => { beamTilt = (v * Math.PI) / 180; });

  const col = panel.querySelector('#bm-col');
  col.addEventListener('input', () => {
    beamColorHex = col.value.replace('#', '');
    beamCones.forEach((c) => { c.material.uniforms.uColor.value.set(col.value); });
  });

  const mSize = modelSize.y * 0.1 || 0.8;
  const marker = new THREE.Mesh(
    new THREE.BoxGeometry(mSize, mSize, mSize),
    new THREE.MeshBasicMaterial({ color: 0xfff8e8, wireframe: true })
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
    beamCones.forEach((c) => { c.position.copy(marker.position); });
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
  const row = (label, id, min, max, step, val, fmt) =>
    `<div class="pix-tool__row"><span>${label}</span>`
    + `<input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}">`
    + `<code id="${id}-v">${fmt ? Number(val).toFixed(fmt) : val}</code></div>`;

  const initCol = '#' + waterMat.uniforms.uBaseColor.value.getHexString();
  panel.innerHTML =
    '<div class="pix-tool__head"><span>Water</span>'
    + '<label class="pix-tool__chk"><input type="checkbox" id="wt-on" checked> on</label></div>'
    + '<div class="pix-tool__row"><span>Color</span>'
    + `<input type="color" id="wt-col" value="${initCol}" style="flex:0 0 auto;width:60px;height:20px"></div>`
    + '<div class="pix-tool__row"><span>Waves</span>'
    + '<label class="pix-tool__chk"><input type="checkbox" id="wt-waves" checked> on</label></div>'
    + row('Str',     'wt-str', 0,    6,    0.1,   2.5,   1)
    + row('Speed',   'wt-spd', 0,    0.2,  0.005, 0.055, 3)
    + row('Scale',   'wt-scl', 0.01, 0.3,  0.005, 0.08,  3)
    + row('Opacity', 'wt-opa', 0,    1,    0.02,  1,     2)
    + '<div class="pix-tool__head" style="margin-top:10px;border-top:1px solid rgba(157,164,177,0.12);padding-top:8px"><span>Texture</span></div>'
    + row('Mix', 'wt-tex-mix', 0, 1, 0.02, 0, 2)
    + '<div class="pix-tool__row" style="margin-top:4px">'
    + '<input type="file" id="wt-tex-file" accept=".png,.webp,.jpg,.jpeg" style="display:none">'
    + '<button class="pix-tool__btn" id="wt-tex-btn" style="flex:1">load png / webp</button>'
    + '<button class="pix-tool__btn" id="wt-tex-clr" title="clear texture">✕</button>'
    + '</div>'
    + '<div class="pix-tool__row" style="margin-top:2px"><code id="wt-tex-name" style="color:#6f8cff;font-size:10px;word-break:break-all"></code></div>';

  const chk = panel.querySelector('#wt-on');
  chk.addEventListener('change', () => {
    water.visible = chk.checked;
    panel.classList.toggle('is-off', !chk.checked);
  });

  panel.querySelector('#wt-col').addEventListener('input', (e) => {
    waterMat.uniforms.uBaseColor.value.set(e.target.value);
  });

  const wavesChk = panel.querySelector('#wt-waves');
  wavesChk.addEventListener('change', () => {
    waterMat.uniforms.uWavesEnabled.value = wavesChk.checked ? 1.0 : 0.0;
  });

  const bind = (id, fn, fmt) => {
    const el  = panel.querySelector('#' + id);
    const out = panel.querySelector('#' + id + '-v');
    el.addEventListener('input', () => {
      const v = Number(el.value);
      fn(v);
      out.textContent = fmt ? v.toFixed(fmt) : el.value;
    });
  };

  bind('wt-str',     (v) => { waterMat.uniforms.uNormalStrength.value = v; }, 1);
  bind('wt-spd',     (v) => { waterMat.uniforms.uSpeed.value = v; },          3);
  bind('wt-scl',     (v) => { waterMat.uniforms.uScale.value = v; },          3);
  bind('wt-opa',     (v) => { waterMat.uniforms.uOpacity.value = v; },        2);
  bind('wt-tex-mix', (v) => { waterMat.uniforms.uTexMix.value = v; },         2);

  const fileInput = panel.querySelector('#wt-tex-file');
  const nameEl    = panel.querySelector('#wt-tex-name');

  panel.querySelector('#wt-tex-btn').addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    new THREE.TextureLoader().load(url, (tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      if (waterMat.uniforms.uTexture.value) waterMat.uniforms.uTexture.value.dispose();
      waterMat.uniforms.uTexture.value = tex;
      nameEl.textContent = file.name;
      URL.revokeObjectURL(url);
    });
    fileInput.value = '';
  });

  panel.querySelector('#wt-tex-clr').addEventListener('click', () => {
    if (waterMat.uniforms.uTexture.value) {
      waterMat.uniforms.uTexture.value.dispose();
      waterMat.uniforms.uTexture.value = null;
    }
    waterMat.uniforms.uTexMix.value = 0;
    panel.querySelector('#wt-tex-mix').value = 0;
    panel.querySelector('#wt-tex-mix-v').textContent = '0.00';
    nameEl.textContent = '';
  });
}

function setupGlbTool() {
  const panel = document.getElementById('glbTool');
  panel.innerHTML =
    '<div class="pix-tool__head"><span>Model</span></div>'
    + '<div id="glb-btns" class="pix-tool__btns">'
    + GLB_MODELS.map((m, i) =>
        `<button class="pix-tool__btn${i === 0 ? ' is-active' : ''}" data-idx="${i}">${m.name}</button>`
      ).join('')
    + '</div>'
    + '<div class="pix-tool__row" style="margin-top:6px">'
    + '<input type="file" id="glb-file" accept=".glb" style="display:none">'
    + '<button class="pix-tool__btn" id="glb-browse" style="width:100%">+ load .glb</button>'
    + '</div>';

  const btnsDiv = panel.querySelector('#glb-btns');

  function activate(btn) {
    btnsDiv.querySelectorAll('.pix-tool__btn').forEach((b) => b.classList.remove('is-active'));
    btn.classList.add('is-active');
  }

  function makeBtn(idx) {
    const btn = document.createElement('button');
    btn.className = 'pix-tool__btn';
    btn.dataset.idx = idx;
    btn.textContent = GLB_MODELS[idx].name;
    btn.addEventListener('click', () => { activate(btn); loadModel(GLB_MODELS[idx].url); });
    return btn;
  }

  btnsDiv.querySelectorAll('[data-idx]').forEach((btn) => {
    const idx = Number(btn.dataset.idx);
    btn.addEventListener('click', () => { activate(btn); loadModel(GLB_MODELS[idx].url); });
  });

  const fileInput = panel.querySelector('#glb-file');
  panel.querySelector('#glb-browse').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const name = file.name.replace(/\.glb$/i, '');
    const idx = GLB_MODELS.push({ name, url }) - 1;
    const btn = makeBtn(idx);
    btnsDiv.appendChild(btn);
    activate(btn);
    loadModel(url);
    fileInput.value = '';
  });
}

function gatherSettings() {
  return {
    water: {
      posY:          water.position.y,
      normalStrength: waterMat.uniforms.uNormalStrength.value,
      speed:         waterMat.uniforms.uSpeed.value,
      scale:         waterMat.uniforms.uScale.value,
      opacity:       waterMat.uniforms.uOpacity.value,
      baseColor:     '#' + waterMat.uniforms.uBaseColor.value.getHexString(),
      wavesEnabled:  waterMat.uniforms.uWavesEnabled.value,
      texMix:        waterMat.uniforms.uTexMix.value,
    },
    beam: {
      pos:         { x: beam.position.x, y: beam.position.y, z: beam.position.z },
      tilt:        beamTilt,
      speed:       beamSpeed,
      lengthScale: beamLengthScale,
      colorHex:    beamColorHex,
      enabled:     beamEnabled,
    },
    lights: {
      base:  { ...base },
      red:   [lightRed.position.x,   lightRed.position.y,   lightRed.position.z],
      green: [lightGreen.position.x, lightGreen.position.y, lightGreen.position.z],
      blue:  [lightBlue.position.x,  lightBlue.position.y,  lightBlue.position.z],
    },
    bloom: {
      strength:  bloom.strength,
      threshold: bloom.threshold,
      radius:    bloom.radius,
    },
    pixelSize: pixelPass.pixelSize,
  };
}

function setupSaveTool() {
  const panel = document.getElementById('saveTool');
  panel.innerHTML =
    '<button class="pix-tool__btn" id="st-save" style="flex:1">Save → Landing</button>'
    + '<button class="pix-tool__btn" id="st-json" style="padding:3px 10px">JSON</button>';

  panel.querySelector('#st-save').addEventListener('click', () => {
    localStorage.setItem('lighthouseSettings', JSON.stringify(gatherSettings()));
    const btn = panel.querySelector('#st-save');
    btn.textContent = '✓ Saved';
    setTimeout(() => { btn.textContent = 'Save → Landing'; }, 1800);
  });

  panel.querySelector('#st-json').addEventListener('click', () => {
    const json = JSON.stringify(gatherSettings(), null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = 'lighthouse-settings.json';
    a.click();
  });
}

function setupCamTool() {
  const panel = document.getElementById('camTool');
  const RAD = THREE.MathUtils.radToDeg;

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
  bind('cl-minpol', (v) => { controls.minPolarAngle = THREE.MathUtils.degToRad(v); });
  bind('cl-maxpol', (v) => { controls.maxPolarAngle = THREE.MathUtils.degToRad(v); });
  bind('cl-mind',   (v) => { controls.minDistance = v; });
  bind('cl-maxd',   (v) => { controls.maxDistance = v; });

  const polEl  = panel.querySelector('#cv-polar');
  const azimEl = panel.querySelector('#cv-azim');
  const distEl = panel.querySelector('#cv-dist');
  const statEl = panel.querySelector('#cam-status');

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
setupGlbTool();
setupSaveTool();
setupCamTool();

loadModel(GLB_MODELS[0].url);

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
  waterMat.uniforms.uLightRInt.value = lightRed.intensity;
  waterMat.uniforms.uLightGInt.value = lightGreen.intensity;
  waterMat.uniforms.uLightBInt.value = lightBlue.intensity;

  if (loaded) {
    beamAngle += dt * beamSpeed;
    const ct = Math.cos(beamTilt), st = Math.sin(beamTilt);
    beam.target.position.set(
      beam.position.x + Math.sin(beamAngle) * 40 * ct,
      beam.position.y - st * 40,
      beam.position.z + Math.cos(beamAngle) * 40 * ct
    );
    beam.target.updateMatrixWorld();

    beamCones.forEach((c) => c.lookAt(beam.target.position));

    lightRed.intensity   = base.red   * (1 + Math.sin(t * 2.1)     * 0.12);
    lightGreen.intensity = base.green * (1 + Math.sin(t * 1.7 + 1) * 0.12);
    lightBlue.intensity  = base.blue  * (1 + Math.sin(t * 2.5 + 2) * 0.12);
  }

  controls.update();
  composer.render();
}
animate();
