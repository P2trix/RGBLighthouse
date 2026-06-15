# RGBLighthouse — Three.js Scene

Interaktywna scena 3D z latarnią morską renderowana przez **Three.js** w przeglądarce.  
Model GLB pochodzi ze Spline. Scena działa bez Node.js — tylko PowerShell.

**Repo:** https://github.com/P2trix/RGBLighthouse  
**Live generator:** https://p2trix.github.io/RGBLighthouse/  
**Live landing:** https://p2trix.github.io/RGBLighthouse/Landing/

---

## Jak uruchomić lokalnie

```powershell
cd C:\Users\p2trix\Desktop\lighthouse-project
.\server.ps1
```

Serwer startuje na `http://localhost:3000`. Przeglądarka otworzy się automatycznie.

---

## Struktura plików

```
lighthouse-project/
├── index.html            ← strona generatora (debug tools)
├── main.js               ← cała logika generatora
├── style.css             ← style generatora + paneli
├── lighthouse.glb        ← model 3D (root — używany przez generator)
├── server.ps1            ← lokalny HTTP server (PowerShell)
│
└── Landing/
    ├── index.html        ← strona landing (embed hero)
    ├── hero.js           ← scena bez debug UI (do embedowania)
    ├── landing.css       ← style landing page
    ├── lighthouse.glb    ← model 3D (Landing — obecnie rgb_lighthouse_copy_copy(1).glb)
    ├── settings.json     ← kalibrowane parametry sceny (źródło prawdy dla hero.js)
    └── logo.svg
```

---

## Workflow: kalibracja → landing

1. Odpal generator (`http://localhost:3000`)
2. Ustaw parametry suwakami (woda, beam, światła, bloom, CA, pixelizacja)
3. Kliknij **Save → Landing** → pobierze `settings.json`
4. Wrzuć `settings.json` do folderu `Landing/`
5. `git add Landing/settings.json && git commit && git push`
6. Landing załaduje nowe parametry przez `fetch('settings.json')`

---

## Stack

- **Three.js r0.165** — CDN via importmap, bez npm
- **GLTFLoader**, **OrbitControls**, **TransformControls**
- **EffectComposer**: `RenderPixelatedPass` → `UnrealBloomPass` → `ShaderPass` (CA) → `OutputPass`
- Vanilla JS (ES modules), zero frameworków

---

## Panele generatora (main.js)

| Panel | Lokalizacja | Co robi |
|-------|-------------|---------|
| **Pixelate** | lewy górny | pixel size (1–16), CA (0–0.1), bloom Str/Thr/Rad |
| **Beam** | lewy (2) | on/off, opacity, speed, length, angle, kolor, pozycja (move/copy) |
| **Water** | lewy (3) | on/off, kolor, fale on/off, Str/Speed/Scale/Opacity, texture upload |
| **Model** | lewy (4) | GLB picker — Default + wgrane przez "+ load .glb" |
| **Lights** | prawy górny | R/G/B intensity sliders + drag boxes (TransformControls) |
| **Camera** | lewy dolny | polar/azimuth/dist readout, min/max limits |
| **Save** | prawy dolny | "Save → Landing" (pobiera settings.json), "JSON" (pełny export) |

---

## Techniczne szczegóły

### Woda (ShaderMaterial)
- `PlaneGeometry(500,500,4,4)` obrócona X=-90°, `water.position.y = 3.5`
- Proceduralne normalne: fBm (5 oktaw), 2 warstwy UV z offsetem czasowym
- Diffuse blobs (RGB): `max(L.y, 0.0)` — unika oil-slick efektu
- Contour lines: `fract(fbm(uv)*8.0)` z `smoothstep`, fade `waveZone = 1-smoothstep(8,24,dist)`
- Fog: `#include <fog_pars_vertex/fragment>` — zmienna MUSI się nazywać `mvPosition` (nie `mvPos`), nigdy nie redekларuj `cameraPosition`

### Beam
- `beam.position.set(-0.40, 8.64, -0.95)`, `beamTilt = 0.3` (dodatni = obraca się w DÓŁ)
- 3 stożki: `[{r:0.5, opacity:0.18}, {r:1.0, opacity:0.08}, {r:1.85, opacity:0.03}]`
- `beamLength = max(size.x, size.z) * 1.4`, kąt stożka = `PI/18`
- W hero.js: `beamEnabled` + `beamSpeed` + `beamCones.forEach(c => c.visible = beamEnabled)`

### Chromatic Aberration (CA)
- `ShaderPass` z uniformem `uStrength` (0–0.1)
- Shader: `offset = uStrength * (vUv - 0.5)`, sample R/G/B z przesunięciem
- W hero.js: obsługiwane przez `applyHeroSettings(s)` → `caPass.uniforms.uStrength.value = s.ca`

### settings.json (Landing)
```json
{
  "water":  { "posY", "normalStrength", "speed", "scale", "opacity", "baseColor", "wavesEnabled", "texMix" },
  "beam":   { "pos": {x,y,z}, "tilt", "speed", "lengthScale", "colorHex", "enabled" },
  "lights": { "base": {red,green,blue}, "red":[x,y,z], "green":[x,y,z], "blue":[x,y,z] },
  "bloom":  { "strength", "threshold", "radius" },
  "pixelSize": 4.75,
  "ca": 0.05
}
```

### Cross-origin: dlaczego nie localStorage
`localStorage` jest per-origin — `localhost:3000` i `p2trix.github.io` to różne origin'y, dane się nie synchronizują.  
Rozwiązanie: `Landing/settings.json` commitowany do repo, `hero.js` fetchuje go przez `fetch('settings.json')` na starcie.  
Race condition fetch vs model load obsługiwana przez `_pendingSettings` / `_modelReady` flagi.

---

## GLB — aktualny stan

| Plik | Model |
|------|-------|
| `lighthouse.glb` (root) | `rgb_lighthouse_copy_copy(2).glb` — używany przez generator |
| `Landing/lighthouse.glb` | `rgb_lighthouse_copy_copy(1).glb` — używany przez landing |

Aby podmienić model na Landing: skopiuj nowy `.glb` jako `Landing/lighthouse.glb` i pushuj.

---

## Checkpoint

- **Tag:** `v0.1-2026-06-15` — stan po sesji kalibracyjnej, pełny feature set
