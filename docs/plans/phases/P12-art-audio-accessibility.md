# Phase 12: Art, Audio, Polish and Accessibility

> **Milestone:** F · Beautiful World · **Depends on:** 09 (can grow in parallel from
> Phase 01's style test) · **Effort:** 2–3 weeks · **Status:** Not started
> **Read first:** MASTER-PLAN §5.4, §7.6, §21, ADR 0004 (art style)

## Goal
Codebase Quest **looks, sounds and feels** like a polished indie game, built with
an **open, licensable asset pipeline**: Blender-rendered pixel characters and
monsters (via Blender MCP), code-generated tiles and overlays, UI from Figma, plus
a living world, adaptive audio, game feel, the **Tour mode**, and **first-class
accessibility**.

## Why now
The MVP proves the game; polish makes people want to play and share it. Art is
made only for features that survived playtesting.

## Scope

### In
- Style guide (from ADR 0004); master palette + 12 biome palettes.
- The full **asset pipeline** in `tools/asset-pipeline/` (MASTER-PLAN §21.3).
- Characters: the composable system (body + outfit + trait accessory + head
  variant) rendered from Blender.
- Monsters, Guardians, Hydra heads, minions, Gitling, critters (Blender → pixel).
- **Combat art:** cell sprites per kind (joint, body, organ, armor, heart, grouped,
  hidden, damaged, severed), token trail, severing and piercing effects.
- Tiles and buildings: code-generated per biome + hand touch-ups; metric overlays
  (age, scaffolding, cracks, lit windows, flags, banners).
- UI: HUD, panels and menus (Figma MCP if authorized, else hand-made), pixel font
  + readable fallback font.
- World life: caravans, ambient creatures, water and foliage, day and night,
  test-status weather.
- Audio: biome music, adaptive combat and boss music, sound effects, UI sounds.
- Game feel (with reduced-motion versions).
- **Tour / Flyover mode** (record-ready).
- Accessibility (table below); settings menu; control remapping.
- A performance pass.
- A community **art contribution kit** (briefs, palette files, templates).

### Out (later phases)
- 3D/VR (future).
- Voice acting (future).

## Design

### The pipeline (`tools/asset-pipeline/`)
| Step | Tool | Output |
|---|---|---|
| 1. Model | Blender via Blender MCP (`art/blender/*.blend`, Git LFS) | Low-poly models, palette materials, toon shading |
| 2. Render | Blender script: orthographic camera, 32×32 (characters) / 48–96 (bosses), no anti-aliasing, 4 or 8 directions, animation frames | Raw PNG frames |
| 3. Pixelize | `pixelize` | Palette-snapped, alpha-thresholded, 1-pixel outline |
| 4. Compose | `compose-character` | Layered bodies + outfits + accessories |
| 5. Pack | `pack-atlas` | Sprite sheets + Phaser atlas JSON |
| 6. Tiles | `gen-tiles` (seeded, palette-locked) | Biome tilesets + overlays |
| 7. Register | `license-manifest` | Entries in `packages/assets/LICENSES.md` (CI-enforced) |

Everything is reproducible: `pnpm assets:build` regenerates all shipped assets
from sources.

### What comes from where
| Asset | Source |
|---|---|
| Characters, monsters, bosses, Gitling | Blender → pipeline |
| Tiles, buildings, overlays, combat cells | Code-generated + hand touch-ups (Aseprite / LibreSprite / Piskel) |
| UI | Figma MCP (needs authorization in the Claude session) or hand-made |
| Concepts and mood boards | Image models such as fal.ai; **kept in `art/concepts/`, never shipped** |
| Sound effects | jsfxr-style generator + CC0 packs |
| Music | BeepBox or commissioned/community musicians + CC0 packs |

### Licensing rules (from MASTER-PLAN §21.4)
- Original assets: CC-BY-4.0. Third-party: CC0, CC-BY or compatible only; **never NC
  or ND**; never ripped assets.
- AI-assisted work: allowed only after human or code rework; disclosed in the
  manifest.
- CI fails if any shipped asset lacks a manifest entry.

### Composable characters
`body (symbol kind) + outfit tint (class/module color) + accessory (trait: wings,
hammer, ear trumpet, mirror, coin, lotus, ghost veil) + head variant (seeded)`.
Animations per body: idle, walk (4 directions), talk.

### Monsters and bosses
- Each monster: idle, move, hurt, attack-telegraph and tamed animations; level
  variants by size or color.
- Guardians: a base boss rig + a biome theme kit (crown, armor, aura); phase-change
  effects as the body rearranges.
- Hydra: modular heads (count = stages).
- The Architect's Shadow: a silhouette built from the kingdom's own map tiles.

### The living world
| Feature | Meaning |
|---|---|
| Caravans | Carts along roads with strong data flow; cargo icons from data type names |
| Test-status weather | Rain over regions whose last local test run failed (Phase 10 runner or imported JUnit); sunshine if passing; clear if unknown |
| Day and night | Cosmetic, can be turned off |
| Ambient life | Birds, fish, tamed critters |

### Audio
One calm loop per biome + an exploration variant; combat and boss themes with
**adaptive layers** (intensity rises as monster HP falls); sound effects
(footsteps by ground, doors, dialogue blips with per-NPC pitch, Read, Sever,
Pierce, correct and wrong, tame, level-up).

### Game feel
50 ms hit stop, a flash on damage, particles on sever and tame, floating damage
numbers, a camera kick on boss phase changes, coins flying to the HUD. **Every
effect has a reduced-motion version.**

### Tour / Flyover mode
An auto camera path: Gate → regions in story order → landmarks → Guardian arenas
→ overview, with lore captions. Play/pause, speed, skip; **record mode** (16:9
safe area, no HUD, fixed duration such as 90 seconds) for Phase 17 videos.

### Accessibility
| Need | Features |
|---|---|
| Motor | Full remapping; one-hand presets; click-to-move; hold ↔ toggle; no timers by default; teleport navigation |
| Visual | Font scaling to 200%; high contrast; colorblind palettes (protanopia, deuteranopia, tritanopia) for tiles, cells and UI; cell kinds by shape + icon; ARIA live regions for dialogue, questions and monster turns |
| Cognitive | Story difficulty; objective reminders; recap button; reduced-text mode; dyslexia-friendly font option |
| Vestibular | Reduced motion |
| Hearing | Subtitles for all audio cues; visual sound indicators |

### Performance
Texture atlases, pooling, tile culling, throttled minimap redraws; memory < 500 MB
on a big repo; 60 fps on a mid-range laptop for 100k lines.

### Community art kit
`docs/art/`: the style guide, palette files (`.gpl`/`.ase`), sprite templates,
"how to submit art" (license agreement, file naming), and a list of open art
requests linked to `art`-labelled issues.

## Tasks
- [ ] Style guide + palettes (from ADR 0004).
- [ ] Complete the pipeline scripts + `pnpm assets:build`.
- [ ] Composable character parts in Blender + renders.
- [ ] Monsters, Guardians, Hydra heads, minions, Gitling, critters.
- [ ] Combat cell art + effects.
- [ ] Biome tilesets, buildings, overlays (code-generated + touch-ups).
- [ ] UI pass (Figma MCP if authorized) + fonts.
- [ ] Caravans, ambient life, weather, day and night.
- [ ] Music + sound effects + adaptive mixer.
- [ ] Juice (with reduced-motion versions).
- [ ] Tour mode + record mode.
- [ ] Settings menu: controls, accessibility, audio, graphics.
- [ ] Performance pass + benchmarks.
- [ ] Community art kit + 10 `art` issues for contributors.

## Automated tests
- **License check:** every shipped asset has a manifest entry (CI).
- **Reproducibility:** `pnpm assets:build` from clean sources gives identical outputs (hash check for code-generated assets; Blender renders compared with a small tolerance).
- **Atlas integrity:** every atlas frame lies inside its image; every sprite key referenced by the game exists.
- **Visual regression:** key scenes in default, high-contrast and each colorblind mode.
- **Colorblind contrast:** simulated screenshots of combat cells and UI meet a minimum contrast.
- **Accessibility:** axe-core on all overlays; keyboard-only run (start → talk → fight → quest); ARIA announcements fire; reduced motion disables shake and flash.
- **Performance benchmark** thresholds.
- **Tour mode:** visits every region within the expected duration on `tiny-ts`.

## Manual test script
1. Play 20 minutes of `tiny-ts` with sound. Does it feel like a real game?
2. Fight a Guardian. Are the cell kinds instantly readable?
3. Switch each colorblind mode; play keyboard-only for 5 minutes; then mouse-only.
4. Turn on reduced motion and a large font; play a boss fight.
5. Run Tour mode on your own project and imagine showing it in a team meeting.
6. Ask 2 people to play with sound; note where they smile or get confused.

## Definition of done
- [ ] All tests green; the license manifest is complete; assets rebuild from sources.
- [ ] Performance targets met.
- [ ] The accessibility checklist is implemented and tested.
- [ ] Community art kit published, with open art issues.

## Risks
| Risk | Mitigation |
|---|---|
| Art takes forever | Blender pipeline + composable characters + community artists |
| Inconsistent style | Style guide, one palette, review in PRs |
| Licensing mistakes | CI manifest check; no NC/ND; concepts never shipped |
| Effects hurt accessibility | Reduced-motion versions for every effect |

## Hand-off to the next phase
Phase 13 receives a polished game ready to share; Phase 17 receives Tour mode
recordings and the art kit for community growth.

## Start prompt for Claude
```
Read AGENTS.md, docs/plans/README.md, the MASTER-PLAN sections listed in the
phase header, ADR 0004, and docs/plans/phases/P12-art-audio-accessibility.md.
Implement Phase 12 on branch phase/12-art-audio. Use the Blender MCP for
characters and monsters (tell me if it isn't connected) and the asset pipeline
for everything shipped. Every asset needs a license manifest entry.
```

## Results (fill in after testing)
- Date:
- Automated tests / performance numbers:
- Play session notes:
- Decisions / ADRs:
