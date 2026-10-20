# Testing and verification

Verification performed for this package:

- `npm test`: **21 tests passed, 0 failed** (21 October 2026 runtime environment).
- `npm run check`: **passed**. This checks JavaScript syntax, required local assets, manifest and Vercel JSON, RTL wiring, and dictionary-validator integration.
- Original design comparison: **15 key CSS selectors/rule groups compared** with the supplied ZIP, covering the tile, tile text, tile score, board, square, premium-square styles, rack, and rack slots. The compared declarations were unchanged.
- Browser smoke test using an isolated Playwright page fixture: **225 board squares, two seven-tile racks, no page JavaScript errors**, and the validator returned `valid` for `خلطت`. The fixture checked mobile (about 400 px), tablet (834 px), and wide desktop (1920 px) layouts for horizontal overflow. Toggling dark mode preserved tile background `#f5e6b9`, tile text `#006400`, board background `#7d4e32`, premium blue `#3b82f6`, and the tile font declaration.
- Service-worker tests cover caching, offline navigation, dictionary/validator availability offline, update handling, failed responses, and removal of old cache versions.

## Important test boundaries

The browser smoke test used the project's HTML, styles, and game scripts in an isolated fixture. Direct navigation to a locally served page was blocked by this runtime's browser restrictions, and the fixture did not load live Tailwind/Google Fonts from their CDNs. Therefore this is **not** a full end-to-end test of a deployed Vercel URL, nor proof that every browser/TV/iOS version renders identically. Test the first online load, installation, and subsequent offline launch on the target device after deployment.

The bundled `dictionary/ar-fusha.txt` is a compact starter lexicon seeded for this game, not a complete Arabic Fusha dictionary and not a full morphological analyzer. `خلطت` is a regression-tested acceptance case. A valid word not present in the bundled resources is reported as **unknown/not found**, not automatically declared invalid; the current UI asks the player to decide how to proceed. This conservative fallback avoids claiming that an incomplete list proves a word is not Arabic. Integration of a larger, licensed lexical resource remains future work.

No change was pushed to the linked GitHub repository and no Vercel deployment was performed. The provided ZIP is the tested deliverable; deploy it by uploading its extracted project files to GitHub and importing the repository into Vercel as described in `README.md`.
