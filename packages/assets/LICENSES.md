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

| `prototype/sprites.png` | Original Blender models; code palette/outline rework | Codebase Quest contributors | CC-BY-4.0 | Yes | Phase 01 style study; 32 frames. |
| `prototype/sprites.json` | Original pack-atlas output | Codebase Quest contributors | CC-BY-4.0 | Yes | Phaser atlas metadata. |
| `prototype/tiles.png` | Original coordinate-hash generator | Codebase Quest contributors | CC-BY-4.0 | Yes | Six 16×16 palette-locked tiles. |
| `art/blender/prototype/gitling-0-0.png` | Original Blender model/render via local MCP | Codebase Quest contributors | CC-BY-4.0 | Yes | AI-authored procedural geometry, hard face bands; code-reworked output. |
| `art/blender/prototype/gitling-0-1.png` | Original Blender model/render via local MCP | Codebase Quest contributors | CC-BY-4.0 | Yes | AI-authored procedural geometry, hard face bands; code-reworked output. |
| `art/blender/prototype/gitling-0-2.png` | Original Blender model/render via local MCP | Codebase Quest contributors | CC-BY-4.0 | Yes | AI-authored procedural geometry, hard face bands; code-reworked output. |
| `art/blender/prototype/gitling-0-3.png` | Original Blender model/render via local MCP | Codebase Quest contributors | CC-BY-4.0 | Yes | AI-authored procedural geometry, hard face bands; code-reworked output. |
| `art/blender/prototype/gitling-1-0.png` | Original Blender model/render via local MCP | Codebase Quest contributors | CC-BY-4.0 | Yes | AI-authored procedural geometry, hard face bands; code-reworked output. |
| `art/blender/prototype/gitling-1-1.png` | Original Blender model/render via local MCP | Codebase Quest contributors | CC-BY-4.0 | Yes | AI-authored procedural geometry, hard face bands; code-reworked output. |
| `art/blender/prototype/gitling-1-2.png` | Original Blender model/render via local MCP | Codebase Quest contributors | CC-BY-4.0 | Yes | AI-authored procedural geometry, hard face bands; code-reworked output. |
| `art/blender/prototype/gitling-1-3.png` | Original Blender model/render via local MCP | Codebase Quest contributors | CC-BY-4.0 | Yes | AI-authored procedural geometry, hard face bands; code-reworked output. |
| `art/blender/prototype/gitling-2-0.png` | Original Blender model/render via local MCP | Codebase Quest contributors | CC-BY-4.0 | Yes | AI-authored procedural geometry, hard face bands; code-reworked output. |
| `art/blender/prototype/gitling-2-1.png` | Original Blender model/render via local MCP | Codebase Quest contributors | CC-BY-4.0 | Yes | AI-authored procedural geometry, hard face bands; code-reworked output. |
| `art/blender/prototype/gitling-2-2.png` | Original Blender model/render via local MCP | Codebase Quest contributors | CC-BY-4.0 | Yes | AI-authored procedural geometry, hard face bands; code-reworked output. |
| `art/blender/prototype/gitling-2-3.png` | Original Blender model/render via local MCP | Codebase Quest contributors | CC-BY-4.0 | Yes | AI-authored procedural geometry, hard face bands; code-reworked output. |
| `art/blender/prototype/gitling-3-0.png` | Original Blender model/render via local MCP | Codebase Quest contributors | CC-BY-4.0 | Yes | AI-authored procedural geometry, hard face bands; code-reworked output. |
| `art/blender/prototype/gitling-3-1.png` | Original Blender model/render via local MCP | Codebase Quest contributors | CC-BY-4.0 | Yes | AI-authored procedural geometry, hard face bands; code-reworked output. |
| `art/blender/prototype/gitling-3-2.png` | Original Blender model/render via local MCP | Codebase Quest contributors | CC-BY-4.0 | Yes | AI-authored procedural geometry, hard face bands; code-reworked output. |
| `art/blender/prototype/gitling-3-3.png` | Original Blender model/render via local MCP | Codebase Quest contributors | CC-BY-4.0 | Yes | AI-authored procedural geometry, hard face bands; code-reworked output. |
| `art/blender/prototype/gitling.blend` | Original Blender model/render via local MCP | Codebase Quest contributors | CC-BY-4.0 | Yes | AI-authored procedural geometry, hard face bands; code-reworked output. |
| `art/blender/prototype/gremlin-0-0.png` | Original Blender model/render via local MCP | Codebase Quest contributors | CC-BY-4.0 | Yes | AI-authored procedural geometry, hard face bands; code-reworked output. |
| `art/blender/prototype/gremlin-0-1.png` | Original Blender model/render via local MCP | Codebase Quest contributors | CC-BY-4.0 | Yes | AI-authored procedural geometry, hard face bands; code-reworked output. |
| `art/blender/prototype/gremlin-0-2.png` | Original Blender model/render via local MCP | Codebase Quest contributors | CC-BY-4.0 | Yes | AI-authored procedural geometry, hard face bands; code-reworked output. |
| `art/blender/prototype/gremlin-0-3.png` | Original Blender model/render via local MCP | Codebase Quest contributors | CC-BY-4.0 | Yes | AI-authored procedural geometry, hard face bands; code-reworked output. |
| `art/blender/prototype/gremlin-1-0.png` | Original Blender model/render via local MCP | Codebase Quest contributors | CC-BY-4.0 | Yes | AI-authored procedural geometry, hard face bands; code-reworked output. |
| `art/blender/prototype/gremlin-1-1.png` | Original Blender model/render via local MCP | Codebase Quest contributors | CC-BY-4.0 | Yes | AI-authored procedural geometry, hard face bands; code-reworked output. |
| `art/blender/prototype/gremlin-1-2.png` | Original Blender model/render via local MCP | Codebase Quest contributors | CC-BY-4.0 | Yes | AI-authored procedural geometry, hard face bands; code-reworked output. |
| `art/blender/prototype/gremlin-1-3.png` | Original Blender model/render via local MCP | Codebase Quest contributors | CC-BY-4.0 | Yes | AI-authored procedural geometry, hard face bands; code-reworked output. |
| `art/blender/prototype/gremlin-2-0.png` | Original Blender model/render via local MCP | Codebase Quest contributors | CC-BY-4.0 | Yes | AI-authored procedural geometry, hard face bands; code-reworked output. |
| `art/blender/prototype/gremlin-2-1.png` | Original Blender model/render via local MCP | Codebase Quest contributors | CC-BY-4.0 | Yes | AI-authored procedural geometry, hard face bands; code-reworked output. |
| `art/blender/prototype/gremlin-2-2.png` | Original Blender model/render via local MCP | Codebase Quest contributors | CC-BY-4.0 | Yes | AI-authored procedural geometry, hard face bands; code-reworked output. |
| `art/blender/prototype/gremlin-2-3.png` | Original Blender model/render via local MCP | Codebase Quest contributors | CC-BY-4.0 | Yes | AI-authored procedural geometry, hard face bands; code-reworked output. |
| `art/blender/prototype/gremlin-3-0.png` | Original Blender model/render via local MCP | Codebase Quest contributors | CC-BY-4.0 | Yes | AI-authored procedural geometry, hard face bands; code-reworked output. |
| `art/blender/prototype/gremlin-3-1.png` | Original Blender model/render via local MCP | Codebase Quest contributors | CC-BY-4.0 | Yes | AI-authored procedural geometry, hard face bands; code-reworked output. |
| `art/blender/prototype/gremlin-3-2.png` | Original Blender model/render via local MCP | Codebase Quest contributors | CC-BY-4.0 | Yes | AI-authored procedural geometry, hard face bands; code-reworked output. |
| `art/blender/prototype/gremlin-3-3.png` | Original Blender model/render via local MCP | Codebase Quest contributors | CC-BY-4.0 | Yes | AI-authored procedural geometry, hard face bands; code-reworked output. |
| `art/blender/prototype/gremlin.blend` | Original Blender model/render via local MCP | Codebase Quest contributors | CC-BY-4.0 | Yes | AI-authored procedural geometry, hard face bands; code-reworked output. |
