# Phase 08 manual walkthrough

Use a fresh browser game and keep notes here. Automated results belong in the
phase's Results section; the architecture sentence and usefulness ratings below
must come from a human playthrough.

## Start

From the repository root in PowerShell:

```powershell
pnpm install --frozen-lockfile
pnpm fixtures
pnpm cq -- play fixtures/repos/tiny-ts --port 4299
```

Enter the kingdom. Press **Q** (or the quest tracker button) for Quests, Skills,
Equipment, Bazaar, Journal and Saves. **Tab/Shift+Tab**, **Enter**, and **Escape**
work throughout. **WASD/arrows** walk, **E** interacts, **C** opens the Codex,
**G** opens Gitling, **M** opens the map, and **Z** toggles sneaking. In Saves,
select Story for the first walkthrough. Use Start new game if this browser has
existing progress; its previous-game backup remains recoverable.

## 1. Prologue and Chapter 1, without debug tools

1. Entering the Gate completes the first prologue step. In Q, read the welcome
   scroll and acknowledge it. Meet Gitling in that panel or through G.
2. The next objective names a real resident. Choose Guide me, close Q and follow
   the gold arrow through gates/doors. Press E to talk. Read the Code Panel and
   its caller/callee links. Escape returns to the world.
3. Follow the first-monster objective. Use Read, Trace, Sever and the real
   evidence shown in the fight. Finish it, then close the combat result panel.
   Verify the prologue reward popup, XP/gold and available Chapter 1.
4. Accept Chapter 1 and follow its named exact call path. At each stop, talk and
   inspect the code, then return to Q for the call-order question. Where no
   exact call exists, inspect the declaration and count its named parameters, or
   identify the declaration kind for a class, interface or type.
   A wrong choice gives feedback and leaves the objective unfinished. After the
   exact path, the chapter explicitly labels its supplementary surveys.
5. Finish the chapter. Check the completed checklist, Concept Keys, XP and gold.
   M and the minimap show `!` for available quest boards and `?` for objectives.

Write **one sentence from memory** describing how Taskly handles a request:

> Not measured yet: _________________________________________________

Does the first flow match what you would teach a new teammate? Was the survey
too long? Record any misleading objective or answer before marking the phase
done.

## 2. Skills, equipment and economy

- Spend a point in each available branch. Nodes require the previous node in
  their branch and one earned point. Buy a Hint Potion or Energy Tonic in the
  Bazaar and verify gold decreases and inventory increases. Use it in combat;
  reload and check that consumption persists.
- In Equipment, choose a known NPC. Compass lists exact callers and draws arrows
  after you meet that resident. Spyglass shows types above nearby NPCs and marks
  annotated Code Panel lines. Lantern shows test references and measured report
  coverage (or honestly says not measured), lights tested buildings and reveals
  nearby Shadows. Hourglass steps source statements with static branch-reading
  choices. Boots travels only along imports/importers. Lens draws weighted
  region arrows on the overworld. Monocle shows git dates and file age.
- Some views need several levels. Taskly’s complete main story provides enough
  points to obtain all seven views if you prioritize their nodes. Continue
  chapters, side quests and daily
  challenges to earn them; a separate test save may be used to inspect all views
  after the ordinary progression playtest. Do not count a debug grant as earned
  progression. `pnpm bot:story` runs the automated test-build story bot.
- In Journal, compare regional Light and stars, read a documentation scroll,
  inspect achievements and export the profile PNG. Three stars require a
  Guardian, which belongs to the next phase. No API key is needed.
- Try a Concept Gate in Story, then Expert. Story warns and permits entry;
  Expert names the missing key and blocks entry. Complete the prerequisite
  region's Collection quest to obtain that key.

| View | Useful in real work? | Observation |
|---|---|---|
| Compass | Pending | |
| Spyglass | Pending | |
| Lantern | Pending | |
| Hourglass | Pending | |
| Boots | Pending | |
| Lens | Pending | |
| Monocle | Pending | |

## 3. Save round trip

In Q → Saves, Export `.cqsave`. Note your XP, gold, active objective, Codex note,
inventory and position. Start a new game, then import the exported file. All
those values should return. Reload the page and enter again; verify them again.
Try a malformed `.cqsave`: the active game remains intact, a clear error appears
and Download damaged save backup is available. Restore previous game backup
recovers the explicit checkpoint, independently of subsequent autosaves.

Keep the same browser and port when restarting `cq play`. A different browser or
origin requires importing the file. Do not clear all browser storage to reset a
game: use the in-game button.

## 4. Code changes, safely in a disposable copy

Do not alter the pinned `fixtures/repos/tiny-ts` repository. Copy it to a new
ignored output directory first (choose another name if this destination exists):

```powershell
New-Item -ItemType Directory -Path out/phase08-manual
Copy-Item -LiteralPath fixtures/repos/tiny-ts -Destination out/phase08-manual/tiny-ts -Recurse
pnpm cq -- play out/phase08-manual/tiny-ts --port 4300
```

In this copy, finish a question about a function and add a Codex note. Export a
save. Stop the server with Ctrl+C. Edit that function, optionally rename another
file and remove another function. Commit these changes **in the disposable copy**:

```powershell
git -C out/phase08-manual/tiny-ts add -A
git -C out/phase08-manual/tiny-ts -c user.name="Quest Playtest" -c user.email="playtest@example.com" commit -m "test: renovate the manual kingdom"
pnpm cq -- play out/phase08-manual/tiny-ts --port 4300
```

The welcome summary should report renovations/new/moved/archived residents.
Changed understood/mastered code should now be read. Unchanged and uniquely
moved code keeps its progress. Deleted notes appear in Journal → Archive.
Changed unfinished quests need rechecking and cannot grant their rewards twice.

## 5. Your project

Run `pnpm cq -- play C:/path/to/your/project --port 4301`, play its first chapter
and write whether it is the flow you would show a new teammate first. Repositories
without proven delivery or middleware syntax will omit those side quests;
empty repositories show a welcome survey instead of invented code.

- Own-project first flow: **pending owner playtest**.
- Architecture sentence: **pending**.
- Confusing or incorrect scored answers: **pending**; turn any finding into a
  regression test before closing the phase.
