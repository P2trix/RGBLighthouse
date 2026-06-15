# CLAUDE.md — RGBLighthouse context

Projekt: interaktywna scena 3D Three.js dla **Andrzeja Budzanowskiego (psychob)**.  
Repo: https://github.com/P2trix/RGBLighthouse  
Local dev: `C:\Users\p2trix\Desktop\lighthouse-project\` — serwer przez `.\server.ps1` → `http://localhost:3000`  
NIE używaj Bash do startowania serwera. Jeśli użytkownik pyta jak uruchomić, powiedz żeby sam wkleił: `cd C:\Users\p2trix\Desktop\lighthouse-project; .\server.ps1`

## Dwa pliki główne

| Plik | Cel |
|------|-----|
| `main.js` | Generator z debug UI — pełne narzędzia, panele, slajdery |
| `Landing/hero.js` | Hero embed bez UI — ładuje `Landing/settings.json` przez fetch |

Zmiany w logice sceny (water shader, beam, lights) muszą być synchronizowane w OBU plikach.

## Stałe / Gotcha

- `water.position.y = 3.5` — w obu plikach, nie zmieniać
- `beamTilt = 0.3` — **dodatni** = beam skierowany w DÓŁ (`beam.y - sin(tilt)*40`)
- Fog shader: zmienna MUSI być `mvPosition` (nie `mvPos`), nigdy nie redekларuj `cameraPosition`
- `localStorage` nie działa między localhost:3000 a github.io — settings idą przez `Landing/settings.json` + fetch
- GLB root (`lighthouse.glb`) ≠ GLB landing (`Landing/lighthouse.glb`) — to mogą być różne pliki

## Three.js Stack

- r0.165 via CDN importmap (zero npm)
- Composer: `RenderPixelatedPass(pixelSize)` → `UnrealBloomPass` → `ShaderPass(CA)` → `OutputPass`
- CA shader: `offset = uStrength * (vUv - 0.5)`, sample R/G/B z przesunięciem, range 0–0.1
- Water: `ShaderMaterial`, `transparent:true`, `side:DoubleSide`, `fog:true`

## Beam — 3 stożki

```js
[{r:0.5, o:0.18}, {r:1.0, o:0.08}, {r:1.85, o:0.03}]
// beamLength = max(size.x, size.z) * 1.4
// ConeGeometry(beamLength * tan(PI/18) * r, beamLength, 48, 1, true)
// geo.translate(0, -beamLength/2, 0); geo.rotateX(PI/2)
// AdditiveBlending, depthWrite:false
```

## applyHeroSettings(s) w hero.js — co obsługuje

- `s.water.*` — uniforms uNormalStrength, uSpeed, uScale, uOpacity, uBaseColor, uWavesEnabled, uTexMix; water.position.y
- `s.beam.pos` — beam.position + beamCones.forEach(c => c.position.copy)
- `s.beam.tilt` → beamTilt
- `s.beam.speed` → beamSpeed
- `s.beam.enabled` → beamEnabled + beamCones.forEach(c => c.visible)
- `s.lights.base` → base.red/green/blue + light intensities
- `s.lights.red/green/blue` → lightX.position.set(...)
- `s.bloom.*` → bloom.strength/threshold/radius
- `s.pixelSize` → pixelPass.pixelSize
- `s.ca` → caPass.uniforms.uStrength.value

## Race condition fetch vs model

```js
let _pendingSettings = null;
let _modelReady = false;
fetch('settings.json').then(r => r.ok ? r.json() : null).catch(() => null)
  .then(s => { _pendingSettings = s; if (_modelReady) applyHeroSettings(s); });
// Po załadowaniu modelu:
_modelReady = true;
if (_pendingSettings) applyHeroSettings(_pendingSettings);
```

## Workflow kalibracja → deploy

1. Generator → ustaw parametry → "Save → Landing" → pobierze `settings.json`
2. `cp ~/Downloads/settings.json Landing/settings.json`
3. `git add Landing/settings.json && git commit && git push`

## Aktualne kalibrowane wartości (settings.json)

```json
water: normalStrength=5, speed=0, scale=0.065, opacity=0.76, baseColor=#070a10
beam: pos(-0.4,8.64,-0.95), tilt=0.3, speed=0.8, lengthScale=1, enabled=true
lights: red=102, green=82, blue=68 (neutralne/ciepłe)
bloom: str=0.45, thr=0.55, rad=0.5
pixelSize=4.75, ca=0.05
```

## Checkpoint

Tag `v0.1-2026-06-15` — pełny feature set: water (kolor/fale/tex/CA), beam (3 stożki/enable), GLB picker, bloom, lights, settings export/fetch
