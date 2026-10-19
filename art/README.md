# art/

Sources for the game's art. Built, shippable assets go to `packages/assets/`
(each one listed in `packages/assets/LICENSES.md`).

| Folder | Contents |
|---|---|
| `blender/` | `.blend` model sources (Git LFS) for characters, monsters, bosses and Gitling |
| `palettes/` | The master palette and biome sub-palettes |
| `concepts/` | Concept images and mood boards. **Never shipped as final art.** |

Large sources (`.blend`, source PNGs under `blender/` and `concepts/`, audio
sources) are stored with Git LFS (see `.gitattributes`). Run `git lfs install`
once before adding them. The pipeline is described in MASTER-PLAN §21.
