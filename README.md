# Lighthouse Project — Three.js 3D Scene

Projekt interaktywnej sceny 3D z latarnią morską. Model pochodzi z **Spline**, wyeksportowany jako `.glb` i renderowany przez **Three.js** bezpośrednio w przeglądarce.

## Jak to uruchomić

Nie potrzebujesz Node.js ani żadnych narzędzi. Wystarczy PowerShell.

**Krok 1** — otwórz PowerShell w folderze projektu (prawy klik na folder → "Otwórz w terminalu")

**Krok 2** — wklej i uruchom:

```powershell
powershell -ExecutionPolicy Bypass -File server.ps1
```

Przeglądarka otworzy się automatycznie na `http://localhost:8080`.  
Serwer działa dopóki nie zamkniesz okna PowerShell.

## Co zawiera projekt

| Plik | Opis |
|------|------|
| `index.html` | Szkielet strony, importmap dla Three.js z CDN |
| `style.css` | Reset + pełnoekranowy canvas |
| `main.js` | Scena Three.js: ładowanie GLB, oświetlenie, animacja |
| `lighthouse.glb` | Model 3D latarni (z Spline) |
| `server.ps1` | Prosty lokalny serwer HTTP (PowerShell) |
| `package.json` | Opcjonalnie: Vite + Three.js (jeśli masz Node.js) |

## Cel wizualny (Spline reference)

W Spline scena wygląda tak:
- Ciemne tło (prawie czarne, lekko granatowe)
- Latarnia z paskami czerwono-białymi
- Kolorowe punktowe światła: **czerwone** (lewy tył), **zielone** (prawy przód), **niebieskie** (lewy przód)
- Glowing emissive w oknie latarni
- Obracający się reflektor na szczycie
- Animowana woda wokół wyspy

Screenshoty z Spline dołączone w folderze `screens/`.

## Sterowanie

| Akcja | Opis |
|-------|------|
| Lewy przycisk myszy + przeciągnij | Obracaj kamerę |
| Scroll | Zoom |
| Prawy przycisk + przeciągnij | Przesuń kamerę |

## Stack

- **Three.js** r0.165 (ładowany z CDN, bez instalacji)
- **GLTFLoader** + **OrbitControls** z `three/addons`
- Vanilla JS, bez frameworków

## Jeśli masz Node.js (opcjonalnie)

```bash
npm install
npm run dev
```
