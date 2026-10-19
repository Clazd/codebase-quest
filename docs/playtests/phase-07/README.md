# Phase 07 manual playtest

Automated fights establish correctness. Only your session can rate whether the
combat is enjoyable and teaches something. Phase 01's adoption decision is
still pending; use this session to add observations rather than assuming a go.

1. From the repository root, run `pnpm install --frozen-lockfile`, then
   `pnpm cq -- play fixtures/repos/smelly-ts`. Open the printed local URL and
   enter the kingdom. The equivalent fixture preview is `pnpm dev`, followed
   by `http://localhost:5173/?world=fixtures/smelly-ts`.
2. Open **Codex (C)** and choose **Story**, **Normal** or **Expert**. Close it.
   Monsters patrol near their files; walk near one or interact with **E**.
   **Z** toggles sneaking and reduces detection range. Sealed mini-bosses wait for P09.
3. Fight Gremlin, Serpent, Mimic, Mutant, Ghost, Wisp, Minotaur, Imp, Wraith,
   Shapeshifter, Echo and Shadow. Arrows move on the grid; Enter selects;
   **1–8** use the base actions, **9** uses the first twist, **E** ends a turn,
   and **0** flees. Tab reaches all remaining twist/item buttons. When asked,
   number keys choose an answer. Token animation can be skipped.
4. Try Read, Trace, Sever, Disable Organ, Break Armor, Pierce, the three Gitling
   hints, a Hint Potion and the other consumables. Let an organ survive two
   monster turns to see its callee minion. Flee, then return within 60 seconds
   to check its wounds. Lose once: you return to the region gate.
5. After each fight record the table below. Opinion actions have no correct
   answer. A Wisp records your uncertainty rather than declaring code dead.
6. Run `pnpm cq -- play fixtures/repos/tiny-ts`. Fight the Mutant based on
   `computeTaskStatus`, then open its entry in **Codex → body map**. Compare
   the rows/limbs/hearts to the source. The map should summarize the function.
7. In the Codex expand **Bestiary**, edit an investigation note and click
   **Export Bestiary**. Read the Markdown: location, measured evidence and
   suggested fixes should make a useful tech-debt report.
8. Run `pnpm cq -- play "C:/path/to/your/project"` and play for 15 minutes.
   This analyzes source only. Record any misleading prompt or unavailable
   action with encounter ID (`#combat`'s `data-encounter`) and question ID
   (`window.__CQ__.getFight()?.question?.id` in a dev build). Ordinary dev
   builds have no `__testAnswerKey`; use your understanding of the source.

| Monster / function | Learned something true (1–5) | What did you learn? | Misleading action / question ID |
|---|---|---|---|
| | | | |

Record the mean learning score (target ≥ 4), any wrong-key actions, whether the
map helped, and whether you wanted another fight. No human score or manual
wrong-key count has been claimed in the automated results.

For the repeatable simulator run `pnpm balance:combat`. You can also pass one
or more repository folders: `pnpm balance:combat fixtures/repos/smelly-ts`.
