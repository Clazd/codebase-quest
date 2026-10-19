# Asset licenses

Every asset file shipped in `packages/assets/` has an entry here. The rules
(MASTER-PLAN §21.4):

- Original art and audio made for Codebase Quest: **CC-BY-4.0**
  (see [`ASSETS-LICENSE.md`](../../ASSETS-LICENSE.md)).
- Third-party assets: only **CC0, CC-BY or compatible** licenses. Never NC
  (non-commercial) or ND (no-derivatives) licenses, never ripped assets.
- AI-assisted assets: only after human or code rework, and disclosed here.

CI checks this file (`pnpm license-check`; report-only in Phase 00, enforced
from Phase 01).

| File | Source | Author | License | AI-assisted | Notes |
|---|---|---|---|---|---|
| `kenney/tiny-dungeon/tilemap_packed.png` | [Tiny Dungeon 1.0](https://kenney.nl/assets/tiny-dungeon) | Kenney (www.kenney.nl) | CC0 1.0 | No | Placeholder tiles and hero for the Phase 00 test scene. Unmodified. |
| `kenney/tiny-dungeon/License.txt` | Tiny Dungeon 1.0 | Kenney | CC0 1.0 | No | The pack's original license file. |
