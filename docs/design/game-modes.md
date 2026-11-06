# Game modes

Status: **implemented** (2026-11-06), awaiting review. Issue #22.

The user asked for this while away from the computer and left the choice of
games and rules to me. So this document was written alongside the code
instead of being approved first. Everything below is open to change.

## Goals and non-goals

Goals:

- A **mode picker** in the setup, before the settings: X01, Cricket, Around
  the clock, Shanghai, Killer, and three drills: Bob's 27, Halve-it and
  Count-up.
- **Each mode has its own settings**, shown only when that mode is picked.
- Every mode keeps what X01 has: the camera and the autoscorer, the pull-out,
  undo, correcting any dart, the visit sheet, who throws first, rematch, ending
  early, the history, and the caller with the clips it already has.
- Old matches keep folding exactly as before.

Non-goals:

- Folding the new modes into the X01 statistics. A dart at the 3 round the
  clock is not a scoring dart, so the X01 averages and the usual average stay
  X01-only. Each game has its own statistics instead (see *Statistics*).
- New caller clips. A new mode uses the clips the caller already has: visit
  totals, "No score", "to throw", "game shot". Calling Cricket marks would need
  new clips, picked by ear (see the caller pack).
- Party games and 121-style checkout drills. Each would be a new rules module
  on the same engine.

## Interfaces and data contracts

- `StoredMatch.config` is now a `GameConfig`, which is `X01Config` or one of
  the mode configs. A mode config carries `mode: 'cricket' | …`. X01 configs
  carry `mode: 'x01'` or nothing, so stored matches need no migration.
  - All configs share `players` and `startingPlayerIndex`.
  - Every mode config has `legsToWin`. The drills force it to 1.
- The event log is unchanged: `dart.thrown`, `dart.corrected` and
  `match.ended`.
- `reduceGame(config, events)` folds any game. X01 still goes through
  `reduceMatch`; every other mode goes through `reduceTurns` (core
  `game/turns.ts`) with its own rules.
- The snapshot keeps X01's shape: legs, then visits, then darts, plus
  `current` with the player, `dartInVisit` and `remaining`. That shape is why
  `gameVisit`, the camera, undo and corrections work in every mode unchanged.
  On top of it:
  - `leg.state` holds where the mode stands: marks, lives, hits and so on.
  - `leg.over` says the leg is decided.
  - `current.round` and `current.aim` give the round and the one target, when
    the mode has one.
  - `snapshot.drawn` is true when a drill ends level.
  - `remaining` is the number on the player's card: points, lives, or numbers
    left.
- A dart records what it counted for in `Dart.hits`: Cricket marks, or hits on
  the target. `Dart.scored` is what it was worth to the thrower.
- A match is `finished` when `snapshot.current === null`. That covers won,
  ended early, and drawn.

## Design

The rules of each mode, and its settings (defaults in bold):

| Mode | Rules | Settings |
| --- | --- | --- |
| Cricket | 15–20 and the bull, three marks each (the 25 is one mark, the bullseye two). Marks past the third score while someone else has the number open. You win by closing everything while the score allows it. | Scoring **standard** / cut-throat (lowest wins) / no score; legs **1** |
| Around the clock | Every number in order, mid-visit win | Bed **any** / singles / doubles / trebles; order **1→20** / 20→1 / clockwise; hits per number **1**–3; bull to finish (off); doubles and trebles skip ahead (any bed only, off); legs **1** |
| Shanghai | Round n at number n; most points after the last round. Level at the top, everyone plays bull rounds until someone leads. | Rounds **7** (1–20); a Shanghai wins (**on**); legs **1** |
| Killer | Hit your own number to become a killer. A killer takes lives off whoever owns the numbers they hit. The last player with a life wins. | Lives **3**; bed **doubles** / any (single 1, double 2, treble 3); hits to become a killer **1**; numbers **drawn** (stored in the config) / thrown (one dart each, thrown again if it misses or lands on a taken number); a killer hitting their own number loses lives (**on**); legs **1** |
| Bob's 27 | Start on 27. Each round is D1 to D20, and the bull if set. A hit adds the double's value; a round with no hit takes it away. At 0 or below you are out. | Bull round (off); play on below zero (off) |
| Halve-it | One round per target. A round with no hit halves the score, rounded down. | Targets **classic** (15 16 D 17 18 T 19 20 Bull) / long (12 13 14 D 15 16 17 T 18 19 20 Bull) |
| Count-up | Every dart scores its value, for so many rounds | Rounds 5 / **8** / 10 / 20 |

On the screen:

- **Setup** has a tile grid: "Games", then "Training". The rows below the grid
  are the chosen mode's own settings. The bottom bar sums the game up, for
  example "Cricket · cut-throat · first to 2 legs".
- **The game** routes `/game` through `Play.vue`. X01 keeps `Game.vue`; every
  other mode uses `ModeGame.vue`, which has the same layout.
  - The player cards (`ModePlayerCard`) are shaped like X01's. They show the
    big number (a target, points, or the Killer number), a caption, lives as
    pips, and a progress bar.
  - Cricket replaces the cards with a chalkboard (`CricketBoard`).
  - The dart cards, the board and the keypad show `current.aim`.
  - The leg and match card reuses `ResultCard`, without the X01 score bands.
  - What the screens say is computed in `game/modeView.ts`.
- **The caller** (`announceMode`):
  - It calls "game shot" and "and the match", except at the end of a drill
    played alone.
  - It calls the visit total in the points modes, and "No score" for a Bob's 27
    or Halve-it round with no hit.
  - Then it calls "to throw".
  - A halved round or a missed Bob's 27 round plays the bust sound, through
    `visit.busted`.

## Statistics

Built on 2026-11-06 at the user's request; the rest was left to me.

- **Targets:** each dart records what it was thrown at (`Dart.target`), given by one optional rule, `target()`, which the engine asks before each dart. It returns the number round the clock, the double in Bob's 27, the round's number in Shanghai, the target in Halve-it, and your own number while becoming a killer.
- **Core:** `stats/modes.ts` `modeStats()` walks a player's own visits once and gives:
  - legs played and won;
  - the darts that counted, and the hit rate by target, with where each dart landed;
  - cricket marks by number, and the trebles;
  - one result per leg in the game's own unit (`RESULT_UNIT`): darts to get round the clock (fewer is better), marks per round in cricket, final points in the drills and Shanghai, lives in Killer.
- **Screen:** a Game picker beside the player and the period, showing only the games the player has thrown in. Each game shows:
  - four tiles in its own terms (`game/modeStatsView.ts`);
  - in the games with a target, a board painted by hit rate (`TargetBoard.vue`). Tap a number on the board or in the list, and its darts appear where they landed, filled when they counted. Bob's 27 paints only the doubles;
  - cricket's marks by number;
  - the last ten results.
- **X01, rearranged with the user:**
  - Shape of scoring sits beside "When you go at the 20";
  - each board has its own row, with its text beside it, and the doubles next to the heatmap.
- **Board maps:**
  - The real board, faded, is under every map, with all twenty numbers (`BoardFace.vue`, which the game's dartboard now draws through too).
  - The aim map runs from black at the lowest value on the board to yellow at the highest, squared, so the colour spreads instead of being yellow all over.

## Teams

Approved from mockups on 2026-11-06.

- **Where:** in every game except Killer, where a shared number and shared lives would make an odd game.
- **The rule:** a team is a side. It shares the score and takes its turn like a player would, and its members take the side's visits in turn (A1, B1, A2, B2…). The rotation runs through the whole match, so everyone throws as often.
- **Contract:** every config is a `Lineup` (core `game/teams.ts`):
  - `players` are the people;
  - `teams?` (`{ id, name, members }`) the sides;
  - `startingPlayerIndex` indexes the sides.
- **Folding:** both engines take turns over `sides(config)`. After the fold, `assignThrowers` fills `visit.throwerId` and `current.throwerId`. The engines and every game's rules know nothing of teams.
- **Statistics:** personal statistics read `visit.throwerId`, so a member's darts are theirs; legs won and who started go to their team. `matchStats(snapshot, 'side')` gives a team's totals for the match screen and the history. Without teams the thrower is the side, so nothing changes.
- **Setup:**
  - A Teams switch from three players up, shown as 2–4 team columns.
  - A move button sends a player to the next team; "+ Team" adds one, and "Shuffle teams" deals everyone at random.
  - Players who haven't been placed are dealt onto the smallest team (`game/teamDraft.ts`).
  - Who throws first is decided between the players, even in teams: one dart each at the bull, the wheel landing on one player, or every player ordered by hand. The teams follow (`orderTeams`): a team goes as early as its best-placed member, and its members go in their places' order. So the closest at the bull leads their team, and that team throws first.
- **Playing:**
  - Each team's card, or its column on the cricket board, lists its members, with the one at the oche marked (`TeamMembers.vue`).
  - The heading says "Anna (Team 2) to throw".
  - The visits list and the caller name the person who threw (`game/sides.ts`).

## Alternatives

- **Each mode with its own engine, as X01 has.** Rejected: each would repeat
  the turn taking, corrections, legs and the end-early rule, and each would
  need its own tests for them.
- **Moving X01 onto the turn engine as well.** Rejected for now: X01's sets
  and busts don't fit the turn engine. It is the battle-tested path every
  stored match folds through. Leaving it alone means no stored match can
  change.
- **Teams known to every engine and every game's rules.** Rejected: each game would have to deal with members. As sides plus one pass to record who threw, a team costs the engines nothing.
- **One generic game screen for every mode, X01 included.** Rejected for the
  same reason: X01's screen has its checkout routes, averages and charts.

## Testing

- Core: one test file per mode (`tests/game/<mode>.test.ts`) covers the
  rules, the settings, wins, draws, legs and corrections.
  `tests/game/modes.test.ts` covers dispatch, old configs and ending a game
  early.
- Web: `tests/game/modeView.test.ts` checks what the screens say.
  `tests/caller/announceMode.test.ts` checks the calls. The Setup tests check
  the picker and each mode's settings. `tests/screens/ModeGame.test.ts` plays
  Cricket, Around the clock and a drill through the keypad.

## Open questions

- Should the setup remember the last mode and its settings?
- Should there be a Cricket round limit (DartCounter's 20 rounds)?
- Should Cricket have the "marks per round" statistics, and the drills a
  history of their own, in the Statistics screen?
- Should Killer's "thrown" numbers ask for the other hand on screen, or leave
  that to the players as now?
