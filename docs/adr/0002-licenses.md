# 0002. MIT for code, CC-BY-4.0 for original assets

- Status: Accepted
- Date: 2026-10-19
- Phase: 00

## Context

Pillar 8 ("open and welcoming") and MASTER-PLAN §21.4 / §22.1 call for a
permissive code license and clear asset licensing, so people can use, fork and
contribute without legal doubt, and so third-party art never puts the project
at risk.

## Decision

- **Code:** MIT (`LICENSE`), copyright holder **Clazd** (chosen by the owner).
- **Original art and audio:** CC-BY-4.0 (`ASSETS-LICENSE.md`).
- **Third-party assets:** only CC0, CC-BY or compatible licenses; never NC or
  ND, never ripped. Each file is listed in `packages/assets/LICENSES.md`. CI
  runs `scripts/license-check.ts` (report-only in Phase 00, `--enforce` from
  Phase 01).
- **AI-assisted assets:** only after human or code rework, disclosed in
  `packages/assets/LICENSES.md`.
- **Code of conduct:** the Contributor Covenant **3.0** (the latest version),
  adopted by reference: `CODE_OF_CONDUCT.md` links to the official text and
  adds the project's reporting and attribution sections, instead of copying
  the whole text. The private contact is a marked TODO the owner fills in
  before announcing the project. Until then reports go through GitHub's
  private vulnerability reporting.
- **Security reports:** GitHub private vulnerability reporting (`SECURITY.md`).
  The owner has to enable it in the repository settings.

## Consequences

- Anyone may reuse the code and original assets, with attribution for assets.
- Contributors keep the copyright of what they contribute, under these
  licenses (inbound = outbound; no CLA).
- Adopting the Contributor Covenant by reference is a small deviation from the
  Phase 00 table ("Contributor Covenant (latest version), with your contact"):
  the full text isn't copied into the repo, and the contact is still a TODO.
