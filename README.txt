Tiny World — V2.1 FLAT BUILD

This version has NO folders.

Upload all of these files directly to the root of your GitHub repository:
- index.html
- styles.css
- game.js
- manifest.webmanifest
- service-worker.js
- apple-touch-icon.png
- icon-192.png
- icon-512.png
- README.txt

CLOUDFLARE SETTINGS
Build command: None
Deploy command: npx wrangler deploy --assets .
Root directory: /

The period after --assets is required.

This build includes the V2.1 camera fixes:
- terrain no longer stretches/morphs near map edges
- people/buildings/terrain share the same camera transform
- iPhone Retina scaling is handled correctly
- pinch zoom stays aligned
- camera is clamped correctly
