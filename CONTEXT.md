# treblewise

A darts scorer that keeps every dart as a position on the board, and a camera that learns to read them. This file names the concepts the code is built around, so the code, the docs and the conversations about them use the same words.

## Language

### Throwing

**Visit**:
One player's turn at the oche: up to three darts, fewer when a bust or a checkout ends it.
_Avoid_: turn, round, throw (a throw is one dart)

**Darts in the board**:
The darts of the current visit that are still physically in the board, each with a position.
_Avoid_: carried darts (the capture lab's older name), board darts

**Pull-out phase**:
The time after a visit is over and before its darts are out of the board, during which no photograph is read.
_Avoid_: awaiting empty, clearing

**Early pull**:
The darts coming out before the visit was thrown in full; the darts not thrown missed the board.

**Game visit**:
In a game, which visit's darts are in the board and where that visit stands: **throwing**, **open**, **held** or **closed**. Open, held and closed are never recorded in the match's event log; a reload shows the last visit open again.
_Avoid_: last visit, current visit (both are positions of the game visit, not separate things)

**Open** (a visit):
Thrown in full, with the autoscorer not scoring: still shown and still correctable until the next player throws or "Darts out" is pressed; the scoreboard has already moved on.

**Held** (a visit):
Thrown in full, with the autoscorer scoring: the scoreboard waits on the player who threw until the darts are seen coming out, or "Darts out" is pressed.

**Closed** (a visit):
Its darts are out of the board: no longer correctable from the game screen.

### Camera

**Settle**:
The moment the board goes still after moving, when one photograph is taken; a settle is a hand as often as a dart.
_Avoid_: capture, trigger

**Empty board**:
A settle whose board looks like a reference photograph with no darts in it: the empty board seen just before this visit's first dart, or the one taken at calibration.

**Visit photo**:
The latest photograph showing exactly the **darts in the board**: what the change gate compares a new photograph against, and what a report opens on.
_Avoid_: previous frame, last frame

**Board watcher**:
The module that follows the board between settles: it classifies each settle (empty board or not), keeps the **pull-out phase** and the **visit photo**, and reads a photograph for new darts when its owner asks.
_Avoid_: autoscorer (the model and its pipeline as a whole), camera

**Proposal**:
A new dart the model read in a photograph, beside the **darts in the board**, that a person has not yet confirmed or corrected.
_Avoid_: guess, detection (a detection is any tip the model sees, old darts included)

**Blind visit**:
A capture-lab visit the model is kept out of entirely, so a person marks it from scratch and it can go into a test set.

### Labelling

**Capture lab**:
The screen where the camera is set up and calibrated, and throws are marked to build training data.
_Avoid_: capture screen, camera setup

**Marking session**:
The capture lab's try-it loop: the photograph being marked, the newer one waiting behind it, the darts in the board, the blind roll, the let-stand/corrected tally, undo of the last save, and leaving with marks unsaved.
_Avoid_: try-it state, pending frame (a pending frame is just the photograph being marked)

**Report**:
In a game, opening the **visit photo** to mark where the visit's darts really landed, which corrects the score and saves a labelled photograph.

## Relationships

- A **visit** has at most three darts; while it lasts, those darts are the **darts in the board**.
- A **visit** ends in a **pull-out phase**, which ends at an **empty board**, at "Darts out", or when the next visit's first dart is entered by hand.
- The **board watcher** has one owner at a time: the **capture lab** or a game. The owner decides when a **visit** is over and when a photograph is read; the **board watcher** decides what a **settle** shows.
- In the **capture lab**, the **marking session** owns the **board watcher**: it hands it each settle, opens or holds the photograph, and keeps it told of saves, undos and "Board cleared".
- In a game, the **game visit** owns the **board watcher** the same way.
- Reading a photograph yields at most one **proposal**, never one that a dart in the board claims.

## Example dialogue

> **Dev:** "A settle came in with two darts in the board and the board looks empty. Is that a pull-out phase?"
> **Domain expert:** "No: the pull-out phase only follows a visit that is over. Two darts and an empty board is an early pull: the third dart missed."

> **Dev:** "Should the change gate compare against the last settle?"
> **Domain expert:** "Against the visit photo. The last settle may be a hand reaching in; the visit photo is the board with exactly the darts we know about."

## Flagged ambiguities

- "previous photo" meant the last settle in a game and the last saved photograph in the capture lab. Resolved: both use the **visit photo**.
- "carried darts" (capture lab) and "the visit's darts" (game) are the same thing. Resolved: **darts in the board**.
