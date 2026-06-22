import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.getElementById('canvas');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020815);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, 10, 30);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(0, 5, 0);
controls.update();

// Białe światło kierunkowe — zawsze oświetla model niezależnie od rozmiaru
const dirLight = new THREE.DirectionalLight(0xffffff, 4);
dirLight.position.set(5, 10, 8);
scene.add(dirLight);

// Ciemny ambient — żeby cienie były widoczne
const ambient = new THREE.AmbientLight(0x4466aa, 5);
scene.add(ambient);

// RGB punktowe — tymczasowo wyłączone (test kolorów materiałów)
const lightRed   = new THREE.PointLight(0xff1100, 0, 0, 0);
const lightGreen = new THREE.PointLight(0x00ff88, 0, 0, 0);
const lightBlue  = new THREE.PointLight(0x2255ff, 0, 0, 0);
scene.add(lightRed, lightGreen, lightBlue);

// Reflektor
const beam = new THREE.SpotLight(0xffffff, 3, 0, Math.PI / 14, 0.4, 0);
scene.add(beam);
scene.add(beam.target);

const loader = new GLTFLoader();
loader.load('lighthouse.glb', (gltf) => {
  const model = gltf.scene;

  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size   = box.getSize(new THREE.Vector3());
  console.log('size:', size);

  model.position.x = -center.x;
  model.position.y = -box.min.y;
  model.position.z = -center.z;

  const modelH = size.y;
  const modelMinY = box.min.y;

  model.traverse(child => {
    if (!child.isMesh) return;

    const name = child.name;
    const n = name.toLowerCase();
    const mats = Array.isArray(child.material) ? child.material : [child.material];

    // Pobierz środkową pozycję Y meshu w przestrzeni świata
    const meshBox = new THREE.Box3().setFromObject(child);
    const meshCenterY = (meshBox.min.y + meshBox.max.y) / 2;
    const relY = (meshCenterY - modelMinY) / modelH; // 0 = dół, 1 = góra

    let color = null;
    let emissive = null;
    let emissiveIntensity = 0;
    let roughness = 0.7;
    let metalness = 0.1;

    if (n.includes('boat') || n.includes('durham')) {
      color = 0x8b6914;         // łódź — ciepłe drewno
      roughness = 0.9;
    } else if (n === 'cone') {
      color = 0x7a1010;         // kopuła — ciemna czerwień
    } else if (n.startsWith('cube')) {
      color = 0x3a4560;         // skały
      roughness = 0.95;
    } else if (n.includes('drzwi') || n === 'boolean') {
      color = 0x2a1a08;         // drzwi — ciemne drewno
      roughness = 0.9;
    } else if (n.includes('mesh_38')) {
      color = 0x2a2f3a;         // słupki ogrodzenia
    } else if (n.startsWith('mesh_')) {
      color = 0x353d50;         // kamienne płyty/ścieżka
      roughness = 0.95;
    } else if (n.startsWith('cylinder')) {
      // Wieża latarni — naprzemienne czerwone i białe pasy
      // Wyżej = bliżej szczytu = więcej pasów
      const bandIndex = Math.floor(relY * 8);
      if (relY > 0.82) {
        color = 0x2a2f3a;       // górna platforma — ciemny metal
        metalness = 0.4;
        roughness = 0.4;
      } else if (relY > 0.65) {
        color = 0x1a1f28;       // pokój latarni — ciemny
        metalness = 0.5;
      } else {
        color = bandIndex % 2 === 0 ? 0xcc2020 : 0xe0ddd8;  // czerwone/białe pasy
      }
    } else if (n.startsWith('rectangle')) {
      // Architektoniczne detale — balustrady, gzymsy
      if (relY > 0.6) {
        color = 0x1a1f28;       // górne detale — ciemny metal
        metalness = 0.5;
        roughness = 0.4;
        // Okna — emissive
        if (n.includes('rectangle_5') || n.includes('rectangle_6')) {
          emissive = 0x4488ff;
          emissiveIntensity = 2.0;
          color = 0x88aaff;
        }
      } else {
        color = 0x404858;       // dolne detale
      }
    }

    mats.forEach(m => {
      if (color !== null) m.color.setHex(color);
      m.roughness = roughness;
      m.metalness = metalness;
      if (emissive !== null) {
        m.emissive.setHex(emissive);
        m.emissiveIntensity = emissiveIntensity;
      }
      m.needsUpdate = true;
    });
  });

  scene.add(model);

  const h = size.y;
  const d = Math.max(size.x, size.z);

  camera.position.set(0, h * 0.5, d * 1.2 + h * 0.5);
  controls.target.set(0, h * 0.35, 0);
  controls.update();

  const s = d * 0.9;
  lightRed.position.set(-s, h * 0.15, -s * 0.4);
  lightGreen.position.set(s, h * 0.05, s * 0.7);
  lightBlue.position.set(-s * 0.4, h * 0.08, s);
  beam.position.set(0, h * 0.96, 0);

  dirLight.position.set(s * 0.5, h, s * 0.8);
  dirLight.target.position.set(0, h * 0.3, 0);
  scene.add(dirLight.target);

}, undefined, err => console.error(err));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  beam.target.position.set(Math.sin(t * 0.7) * 60, 0, Math.cos(t * 0.7) * 60);
  beam.target.updateMatrixWorld();
  controls.update();
  renderer.render(scene, camera);
}
animate();
