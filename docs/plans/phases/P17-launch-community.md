# Phase 17: Launch and Community

> **Milestone:** H · Everywhere · **Depends on:** all previous phases ·
> **Effort:** ~2 weeks + ongoing · **Status:** Not started
> **Read first:** MASTER-PLAN §19, §22

## Goal
Launch Codebase Quest publicly as a **healthy open-source project**: a clear
landing page, docs, a 5-minute tutorial, demo kingdoms, a trailer, the
contributor funnel (good first issues, "Play this repo" on its own repo, credits),
funding (Sponsors), open-core plans, privacy-respecting analytics, and a launch
plan. Then learn fast from real users and contributors.

## Why now
Everything is built and tested. Now people need to discover it, understand it in
seconds, get value in their first 5 minutes, and find an easy way to contribute.

## Scope

### In
- Landing page, docs site, FAQ.
- A first-run tutorial (5 minutes, demo kingdom).
- 3 demo kingdoms of famous permissively licensed projects (offered to their
  maintainers as official worlds).
- A trailer and short clips (Tour mode recordings, edited e.g. with Remotion and
  FFmpeg).
- **Community funnel:**
  - "▶ Play this repo" on Codebase Quest's own repo.
  - Its own `.codequest/` official world, with Hero's Trial pointing at the
    project's `good first issue`s.
  - **30 good first issues** written from the plans' backlogs and art/language
    needs.
  - The all-contributors bot.
  - Contributor statues in the Hall of Heroes (opt-in).
  - A GitHub Discussions structure (Ideas, Q&A, Show and tell, Monster ideas).
- **Funding:** GitHub Sponsors and/or Open Collective + `FUNDING.yml`; open-core
  plans page.
- Billing for hosted plans (hosted checkout + webhooks only).
- Opt-in analytics, crash reporting, feedback widget.
- The launch plan and readiness checklist.
- Final legal docs (privacy policy, terms, attributions), reviewed by a human.

### Out
- New gameplay features. **Feature freeze** during launch (bug fixes only).

## Design

### Landing page (one scroll)
1. **Hero:** "Every codebase is a world. Go explore." + a 10-second loop + **"Play a
   demo kingdom"** (no sign-up) + a **GitHub stars** button.
2. **How it works:** Code → World → Code-Body Combat → Real contribution.
3. **No key needed:** "Works with your own AI agent through MCP — or no AI at all."
4. **For you:** tabs for New hires, Maintainers, Learners, Teams, Instructors.
5. **Open source:** MIT, contribute (code, art, music, languages), sponsors.
6. **Privacy:** "Your code stays on your machine."
7. **Install:** `npx codebase-quest play .` + `npx codebase-quest setup` + "Play any
   public repo".

### First-run tutorial (5 minutes)
Gate → meet Gitling → talk to 2 NPCs → a Gremlin fight (Read, Sever, Pierce) →
see the body map in the Codex → watch Kingdom Light rise → "Now try it on your own
repo" + "Let your agent prepare it: `npx codebase-quest setup`". **Target
completion > 70%.**

### Community funnel
| Step | What |
|---|---|
| Discover | Devlog GIFs, Show HN, communities (MASTER-PLAN §22.3) |
| Try | Demo kingdom in the browser |
| Star | Stars button on the landing page and in the game's credits |
| Learn the code | "▶ Play this repo" on Codebase Quest itself |
| First contribution | Hero's Trial on the project's own good first issues; art and language issues |
| Get credit | all-contributors, Hall of Heroes statue (opt-in), release notes |
| Stay | Fast reviews (< 48 h), Discussions, monthly community calls (optional) |

### Funding and plans
- Enable **GitHub Sponsors** and/or **Open Collective**; add `FUNDING.yml` and
  sponsor tiers (e.g. name in credits, logo in README).
- Open-core plans (MASTER-PLAN §19.1).
- **You set up payment accounts, tax and payouts yourself.** The code only
  integrates a hosted checkout + webhooks (e.g. Stripe), tested in test mode.

### Analytics and feedback (privacy-respecting)
Opt-in aggregate events only (tutorial step, session length bucket, feature used);
never code, file names or private repo names. Crash reports with paths and code
scrubbed. In-game feedback with a screenshot the player previews and approves.

### Launch plan
| When | What |
|---|---|
| T−14 days | Private beta (20–50 developers + 5 maintainers); fix the top issues |
| T−7 | Posts ready (Show HN, Product Hunt, relevant communities), trailer, blog "How we turn code into worlds", 30 good first issues |
| T−3 | Early access for developer YouTubers and streamers |
| T | Publish in a planned order; stay online; monitor builds, errors and costs |
| T+7 | "What we learned in week 1" post; top fixes released |
| T+30 | Metrics review; next roadmap shaped with the community in Discussions |
| Next October | Hacktoberfest participation with prepared issues |

**Copy rule:** honest claims only; show real gameplay.

### Launch-day readiness
- [ ] Load test at 10× expected traffic (cached worlds via CDN).
- [ ] Build queue autoscaling or a "high demand" waiting screen.
- [ ] Daily AI budget cap + alerts (hosted features).
- [ ] Error and latency alerts; rollback plan.
- [ ] Support inbox, FAQ, Discussions moderated.

### Success metrics (first 30 days)
| Metric | Target |
|---|---|
| Tutorial completion | > 70% |
| Day-7 return | > 20% |
| GitHub stars | > 1,000 |
| External contributors (merged PRs) | > 15 |
| "Play this repo" badges on other repos | > 100 |
| Public kingdoms built | > 1,000 |
| "I understand this codebase better" | ≥ 4 / 5 |

## Tasks
- [ ] Landing page + docs site + FAQ.
- [ ] Tutorial + completion tracking.
- [ ] Demo kingdoms (+ pull requests offered to their maintainers).
- [ ] Trailer + clips with captions.
- [ ] The project's own official world + "▶ Play this repo" badge.
- [ ] 30 good first issues; all-contributors bot; Discussions categories.
- [ ] Sponsors / Open Collective + `FUNDING.yml` (you create the accounts).
- [ ] Plans page + hosted checkout integration (test mode).
- [ ] Opt-in analytics + crash reporting + feedback widget.
- [ ] Final legal docs (human-reviewed).
- [ ] Private beta; launch assets; readiness checklist.

## Automated tests
- **Landing and docs:** Lighthouse performance and accessibility ≥ 90; link check.
- **Tutorial E2E:** completes in under 5 minutes; keyboard-only works.
- **Billing:** webhook signature verification; plan changes unlock features (test mode).
- **Analytics privacy:** payloads never contain code, file paths or private repo names (schema-enforced + test).
- **Load test** at 10× expected traffic.

## Manual test script
1. As a newcomer, open the landing page on your phone and laptop. Within 10 seconds, can you tell what it is?
2. Play the demo kingdom; finish the tutorial.
3. Run the install commands exactly as written on the landing page, on your own repo.
4. Play Codebase Quest's own repo; try its Hero's Trial on a good first issue.
5. Buy Pro in **test mode**; check features unlock.
6. Run the private beta; record the top 10 pieces of feedback.

## Definition of done
- [ ] Readiness checklist complete.
- [ ] Private beta feedback addressed (top 10).
- [ ] Launched.
- [ ] T+7 and T+30 notes written in Results.

## Risks
| Risk | Mitigation |
|---|---|
| Launch-day load | CDN, queue, waiting screen, budget caps |
| Contributors arrive but get stuck | Clear issues, playable onboarding, fast reviews |
| Overclaiming | Honest copy; real gameplay |
| Maintainers dislike unofficial worlds | Opt-out listing; offer official worlds |

## Start prompt for Claude
```
Read AGENTS.md, docs/plans/README.md, the MASTER-PLAN sections listed in the
phase header, and docs/plans/phases/P17-launch-community.md.
Implement Phase 17 on branch phase/17-launch. Feature freeze: bug fixes only.
Ask me before creating any external account, publishing anything, or enabling
payments; I'll do account and payment setup myself.
```

## Results (fill in after launch)
- Launch date:
- Day-1 / Day-7 / Day-30 metrics:
- Community numbers (stars, contributors, badges):
- What we learned:
- Next roadmap:
