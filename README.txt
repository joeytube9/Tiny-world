Tiny World V5.0.1 — STARTUP HOTFIX

FIXED
- V5 could remain on the splash screen forever.
- The V5 visual patch accidentally removed eraName(), jobCounts(), renderCivilization(), and showCitizen().
- Those functions are restored.
- Startup now dismisses the splash independently of world generation, so a future runtime error cannot trap the app on the loading screen indefinitely.
- Service-worker cache version bumped so iPhone pulls the repaired game.js.

This keeps all V5 Visual Overhaul features.

DEPLOY
Replace the GitHub repository files with this flat build and commit.
Cloudflare will redeploy automatically.
