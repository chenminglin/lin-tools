# Media Lab Project Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create and register a character-based Media Lab app icon for browser, Web App, macOS, and Windows use.

**Architecture:** One transparent 1024px source illustration is generated from the existing character reference. Shell image tools export the exact platform sizes and container formats, while Vite copies web files from `frontend/public/`; Flask exposes them through its existing public-icons route and a new manifest route.

**Tech Stack:** built-in image generation, PNG, ImageMagick, macOS `sips` and `iconutil`, React/Vite, Flask, pytest, Node.js test runner

---

## File Structure

- Create: `frontend/public/icons/app/media-lab-source.png` — approved 1024px transparent source art.
- Create: `frontend/public/icons/app/icon-512.png`, `icon-256.png`, `icon-192.png`, `apple-touch-icon.png`, `icon-64.png`, `icon-32.png`, `icon-16.png` — Web and platform PNG derivatives.
- Create: `frontend/public/icons/app/favicon.ico` — multi-resolution favicon.
- Create: `frontend/public/icons/app/MediaLab.icns` — macOS app icon.
- Create: `frontend/public/site.webmanifest` — Web App icon declaration.
- Modify: `frontend/index.html` — favicon, Apple touch icon, and manifest references.
- Modify: `src/lin_tools/web_app.py` — serve the manifest from Vite public assets.
- Modify: `tests/test_frontend_assets.py` — assert the registered icon and manifest URLs are served.

### Task 1: Generate and validate source art

**Files:**
- Create: `frontend/public/icons/app/media-lab-source.png`

- [ ] **Step 1: Inspect the character reference**

Use the image viewer for `/Users/bethenachan/code/make_video/actor/chibi-host-pose-sheet.png`. Confirm the identity details to preserve: yellow beret, black bob haircut, rounded face, dark navy outline, white shirt, blue apron.

- [ ] **Step 2: Generate the 1024px source image with the built-in image tool**

Use the character sheet as a reference image and submit this prompt:

```text
Use case: stylized-concept
Asset type: app icon source art for Media Lab
Input image: character identity and illustration-style reference
Primary request: create a single centered chibi host head-and-shoulders icon, smiling directly toward the viewer
Style/medium: polished clean 2D chibi app-icon illustration matching the reference; rounded forms; dark navy bold outline; no text
Composition/framing: head fills about 70 percent of a square canvas; yellow beret and face remain unmistakable at 16px; only a small blue apron collar is visible
Scene/backdrop: transparent background; behind the character use one mint-green rounded square halo, leaving transparent corners
Details: add only a tiny white play triangle and two subtle sound-wave dots as media cues; keep both behind or beside the head and clearly secondary
Color palette: yellow beret, black hair, peach skin, white shirt, royal-blue apron, mint green, warm white, dark navy outline
Constraints: genuine alpha transparency; exactly one character; no letters, words, watermark, logo, frame, checkerboard pattern, cropped hat, cropped face, or cropped shoulders; square composition
```

Copy the selected generated output to `frontend/public/icons/app/media-lab-source.png`.

- [ ] **Step 3: Verify source dimensions and transparency**

Run:

```bash
sips -g pixelWidth -g pixelHeight -g hasAlpha frontend/public/icons/app/media-lab-source.png
```

Expected: 1024×1024 and `hasAlpha: yes`. Inspect it visually at original size and at 64px and 16px. Regenerate only if the beret, face, or outline is unclear at small size.

- [ ] **Step 4: Commit source art**

```bash
git add frontend/public/icons/app/media-lab-source.png
git commit -m "assets: add Media Lab icon source"
```

### Task 2: Export platform-specific icon assets

**Files:**
- Create: `frontend/public/icons/app/icon-512.png`
- Create: `frontend/public/icons/app/icon-256.png`
- Create: `frontend/public/icons/app/icon-192.png`
- Create: `frontend/public/icons/app/apple-touch-icon.png`
- Create: `frontend/public/icons/app/icon-64.png`
- Create: `frontend/public/icons/app/icon-32.png`
- Create: `frontend/public/icons/app/icon-16.png`
- Create: `frontend/public/icons/app/favicon.ico`
- Create: `frontend/public/icons/app/MediaLab.icns`

- [ ] **Step 1: Export the Web PNG sizes**

Run:

```bash
sips -z 512 512 frontend/public/icons/app/media-lab-source.png --out frontend/public/icons/app/icon-512.png
sips -z 256 256 frontend/public/icons/app/media-lab-source.png --out frontend/public/icons/app/icon-256.png
sips -z 192 192 frontend/public/icons/app/media-lab-source.png --out frontend/public/icons/app/icon-192.png
sips -z 180 180 frontend/public/icons/app/media-lab-source.png --out frontend/public/icons/app/apple-touch-icon.png
sips -z 64 64 frontend/public/icons/app/media-lab-source.png --out frontend/public/icons/app/icon-64.png
sips -z 32 32 frontend/public/icons/app/media-lab-source.png --out frontend/public/icons/app/icon-32.png
sips -z 16 16 frontend/public/icons/app/media-lab-source.png --out frontend/public/icons/app/icon-16.png
```

- [ ] **Step 2: Build the multi-resolution favicon**

Run:

```bash
magick frontend/public/icons/app/icon-16.png frontend/public/icons/app/icon-32.png frontend/public/icons/app/icon-64.png frontend/public/icons/app/favicon.ico
```

Expected: `favicon.ico` contains 16px, 32px, and 64px layers.

- [ ] **Step 3: Build the macOS ICNS file**

Run:

```bash
iconset_dir="/tmp/MediaLab.iconset"
rm -rf "$iconset_dir"
mkdir -p "$iconset_dir"
sips -z 16 16 frontend/public/icons/app/media-lab-source.png --out "$iconset_dir/icon_16x16.png"
sips -z 32 32 frontend/public/icons/app/media-lab-source.png --out "$iconset_dir/icon_16x16@2x.png"
sips -z 32 32 frontend/public/icons/app/media-lab-source.png --out "$iconset_dir/icon_32x32.png"
sips -z 64 64 frontend/public/icons/app/media-lab-source.png --out "$iconset_dir/icon_32x32@2x.png"
sips -z 128 128 frontend/public/icons/app/media-lab-source.png --out "$iconset_dir/icon_128x128.png"
sips -z 256 256 frontend/public/icons/app/media-lab-source.png --out "$iconset_dir/icon_128x128@2x.png"
sips -z 256 256 frontend/public/icons/app/media-lab-source.png --out "$iconset_dir/icon_256x256.png"
sips -z 512 512 frontend/public/icons/app/media-lab-source.png --out "$iconset_dir/icon_256x256@2x.png"
sips -z 512 512 frontend/public/icons/app/media-lab-source.png --out "$iconset_dir/icon_512x512.png"
sips -z 1024 1024 frontend/public/icons/app/media-lab-source.png --out "$iconset_dir/icon_512x512@2x.png"
iconutil -c icns "$iconset_dir" -o frontend/public/icons/app/MediaLab.icns
```

- [ ] **Step 4: Verify all assets**

Run:

```bash
for image in frontend/public/icons/app/*.png; do
  sips -g pixelWidth -g pixelHeight -g hasAlpha "$image"
done
file frontend/public/icons/app/favicon.ico frontend/public/icons/app/MediaLab.icns
```

Expected: all PNGs are square, `media-lab-source.png` retains alpha, and both container files identify as ICO/ICNS. Inspect `icon-16.png`, `icon-32.png`, and `icon-512.png` visually.

- [ ] **Step 5: Commit generated app assets**

```bash
git add frontend/public/icons/app
git commit -m "assets: add Media Lab app icon variants"
```

### Task 3: Add failing coverage for Web asset delivery

**Files:**
- Modify: `tests/test_frontend_assets.py`

- [ ] **Step 1: Add the expected app-asset tests**

Append:

```python
def test_frontend_app_icon_and_manifest_are_served() -> None:
    app = web_app.create_app()
    client = app.test_client()

    icon_response = client.get("/icons/app/favicon.ico")
    manifest_response = client.get("/site.webmanifest")

    assert icon_response.status_code == 200
    assert icon_response.mimetype == "image/vnd.microsoft.icon"
    assert manifest_response.status_code == 200
    assert manifest_response.mimetype == "application/manifest+json"
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pytest -q tests/test_frontend_assets.py::test_frontend_app_icon_and_manifest_are_served
```

Expected: failure because `/site.webmanifest` is not yet exposed by Flask.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/test_frontend_assets.py
git commit -m "test: define Media Lab web icon delivery"
```

### Task 4: Register Web icon metadata and serve the manifest

**Files:**
- Create: `frontend/public/site.webmanifest`
- Modify: `frontend/index.html:4-8`
- Modify: `src/lin_tools/web_app.py:94-102`

- [ ] **Step 1: Create the Web App manifest**

Create `frontend/public/site.webmanifest` with:

```json
{
  "name": "Media Lab",
  "short_name": "Media Lab",
  "icons": [
    {
      "src": "/icons/app/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/app/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ],
  "background_color": "#fff9f6",
  "theme_color": "#22c55f",
  "display": "standalone"
}
```

- [ ] **Step 2: Add icon metadata to the Vite HTML entrypoint**

Add these lines inside `frontend/index.html`'s `<head>` after the viewport meta tag:

```html
<link rel="icon" href="/icons/app/favicon.ico" sizes="any" />
<link rel="icon" type="image/png" sizes="32x32" href="/icons/app/icon-32.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/icons/app/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
<meta name="theme-color" content="#22c55f" />
```

- [ ] **Step 3: Add a narrowly scoped Flask manifest route**

After `frontend_icons` in `create_app`, add:

```python
    @app.get("/site.webmanifest")
    def frontend_manifest():
        return send_from_directory(FRONTEND_PUBLIC, "site.webmanifest", mimetype="application/manifest+json")
```

- [ ] **Step 4: Run focused test coverage and verify it passes**

Run:

```bash
pytest -q tests/test_frontend_assets.py
```

Expected: both the existing tool icon test and the new favicon/manifest delivery test pass.

- [ ] **Step 5: Run front-end verification**

Run:

```bash
cd frontend && npm test && npm run build
```

Expected: all Node tests pass, TypeScript succeeds, and Vite copies the manifest and `icons/app/` assets to `frontend/dist/`.

- [ ] **Step 6: Commit Web registration**

```bash
git add frontend/index.html frontend/public/site.webmanifest src/lin_tools/web_app.py tests/test_frontend_assets.py
git commit -m "feat: register Media Lab app icon"
```

### Task 5: Verify the running production app

**Files:**
- Verify: `frontend/dist/icons/app/favicon.ico`
- Verify: `frontend/dist/site.webmanifest`

- [ ] **Step 1: Restart the local Flask app after building**

Run:

```bash
LIN_TOOLS_PORT=5050 .env/bin/python run_web.py
```

Expected: the app starts at `http://127.0.0.1:5050`.

- [ ] **Step 2: Verify live icon and manifest responses**

Run:

```bash
curl --noproxy '*' -sS -o /dev/null -w '%{http_code} %{content_type}\n' http://127.0.0.1:5050/icons/app/favicon.ico
curl --noproxy '*' -sS -o /dev/null -w '%{http_code} %{content_type}\n' http://127.0.0.1:5050/site.webmanifest
```

Expected: `200 image/vnd.microsoft.icon` and `200 application/manifest+json`.

- [ ] **Step 3: Inspect the browser title bar and tab icon**

Open `http://127.0.0.1:5050`, force refresh, and inspect the browser tab. Expected: the favicon shows the simplified character head; the application page continues to show the existing tool-entry icons and remains functional.

- [ ] **Step 4: Final checks**

Run:

```bash
pytest -q
cd frontend && npm test && npm run build
cd .. && git diff --check && git status --short
```

Expected: all Python and front-end tests pass, the production build succeeds, no whitespace errors exist, and no unrelated tracked changes are included in the icon commits.
