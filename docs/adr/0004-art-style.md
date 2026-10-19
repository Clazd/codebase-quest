# 0004. Blender pixel style study

- Status: Accepted for prototype; final direction pending playtest
- Date: 2026-10-19
- Phase: 01

## Context

Phase 01 needs an inexpensive comparison of original Blender sprites, Kenney
placeholders and generated tiles. Blender 5.1.2's installed MCP add-on was
listening locally on port 9876 when this continuation checked it.

## Decision

**Adjust: use the rendered study for evaluation; defer final style adoption.**
Gitling is a mint creature with a glowing crest and small wings. The purple
Gremlin holds a TODO sign. Each has four directions × four idle frames, rendered
at 32×32 with an orthographic camera, flat materials, explicit hard face bands,
one Cycles sample and a minimal reconstruction filter. Palette snapping, alpha
thresholding and a one-pixel exterior outline create the final binary-alpha
32-color sprite sheet. Phaser loads and animates the packed atlas.

The art page places both sprites beside Kenney Tiny Dungeon placeholders and
six deterministic 16px tiles (three grass variants, road, water, stone wall).
Animation can be paused and respects reduced-motion preferences.

## Pipeline and provenance

The source Python and local add-on transport are in `tools/asset-pipeline/scripts/`.
The bridge uses the installed add-on's documented-in-source execute protocol;
there was no separately exposed Blender connector tool in this Codex session.
Requests contain only authored geometry, never analyzed code or answer keys.
The renderer creates a separate scene and restores the user's original scene.
`.blend` copies and raw renders are Git LFS files in `art/blender/prototype/`.
Palette cleanup and atlas generation can be repeated without Blender.
CI fetches LFS sources for the golden/determinism tests and enforces licenses.

This is original, AI-assisted procedural geometry with code rework, disclosed
under CC-BY-4.0 in the asset manifest. Kenney retains CC0. No image-model output
is shipped. Flat emissive materials with per-face hard bands replace a full
toon shader for this tiny style test; pixel cleanup removes partial alpha.

## Consequences

Four directions and idle silhouettes are available for real comparison now.
The TODO sign is tiny at native resolution and needs specific human readability
feedback; no preference or satisfaction result has been invented. Phase 12 can
reuse the pipeline, but should wait for the 3–5-person study before committing
to this art direction or doing final sprite cleanup.
