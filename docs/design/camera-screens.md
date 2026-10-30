# The capture lab and the match's camera badges

Status: **implemented** (2026-10-30). Follows
[automatic board calibration](auto-calibration.md).

## Goals and non-goals

Goals:

- **One capture lab, no setup step.** The board finder made "camera setup" a
  single button press, so the screen becomes the capture lab alone. It opens
  on the live camera, ready to throw at. Finding the board happens over that
  same view and ends back in it.
- **Less text on screen.** What is explained today in paragraphs goes into
  folds, closed until opened.
- **In a match, connection and camera told apart.** Two badges instead of
  one. The connection badge is a signal icon that turns amber or red. The
  camera badge also has a cyan state while the board is being found again
  between visits.
- **The turn beep means "throw now".** When the board is being found again
  after the darts come out, the beep waits for it.
- **Never worse than before.** A board that cannot be found again keeps the
  calibration it had: the autoscorer goes on reading, a little off at the
  edges where the board drifted, and the camera badge says so in red.

Non-goals:

- Changing the board finder or how far the board must move before the
  calibration follows (see the [automatic board calibration](auto-calibration.md) design).
- The address: the screen stays at `/camera`, so existing links and the
  installed app's pages keep working. Only its name changes.

## The capture lab

### What it shows

The screen today has three modes: setup, calibrate, and try-it. It becomes one
view, today's try-it:

- the coach line and the picture, live, cropped to the board once it is found;
- the marking actions as today: save, skip, no new dart, darts out, take a
  photo, undo;
- the autoscorer's proposals switch, the marked strip, the frames panel.

Gone:
- the setup mode;
- **Try it** and **Done**, since there is nothing else to switch to;
- the "Three steps" panel;
- the second **Find the board again** button (the duplicate in screenshot 6).

Moved into folds, closed by default:
- the subtitle;
- the marking help;
- the autoscorer help;
- the model credits;
- a new **Camera** fold, holding the start/stop switch (solo mode) and the
  brightness slider.

The fold remembers being opened, as `Fold` does today.

**The camera starts when the lab opens.** In paired mode it is the phone's
camera, as today.

**Find the board** is the one way to calibrate:
- With no calibration it is the primary button, and the coach line says to
  press it. Settles are ignored until there is a calibration, as today.
- Once there is a calibration it is a quiet button among the actions.
- When the coach says the camera has moved, the button is in the coach's
  line, and nowhere else.

### Finding the board

1. **Find the board** opens a confirmation in the side panel: "The scan
   starts as soon as you press Scan. Point the phone at the board first."
   The buttons are **Scan** and **Not now**. It is an inline panel with
   `role="alertdialog"`, like the "keep photos?" question, not a modal.
2. **Scan** freezes the photo, and the finder's steps light up over it in
   the stage (today's loading screen). The marking session ends first, as
   leaving try-it does today: a mark on a photo under the old calibration
   would be a ghost.
3. **Found**:
   - the markers and the wireframe appear on the frozen photo;
   - the side panel's actions become **Use this calibration**, **Find again**
     and **Cancel**;
   - above them is the verdict, green or amber with the numbers under a
     chevron;
   - the drag help goes in a fold.

   **Not found**: the same, with the reason, and the markers to place by hand.
4. **Use this calibration** saves it. The markers and the frozen photo go,
   and the lab is back on the live picture, ready to throw. **Cancel** goes
   back without saving.

**From a match:** the camera badge's **Find the board again** opens the lab at
step 1, with the camera on, as `?find=1` does today but stopping at the
confirmation. The phone may need turning first, and that is what the
confirmation is for.

## The match's badges

### Connection badge (paired mode only)

- A signal-bars icon (a new `signal` in `Icon`), green, amber or red with the
  link's health (pairing/link.ts), and a chevron. It has no text: the icon
  says what it is, and its accessible name says it in words, e.g.
  "Connection to the phone: slow".
- The chevron opens a popover with today's link numbers and, when red,
  today's "too slow" text and a **Pair again** button. Pair again does what
  the lobby's card does: it ends the pairing and opens the pairing code. The
  match waits in the lobby.
- A slow link no longer turns the camera badge red: the connection badge says
  it.

### Camera badge

| State | Colour | When |
|---|---|---|
| Off | grey | the camera is off in this match |
| Ready | green | the autoscorer can read the board |
| Finding the board | cyan | between visits, while the board is found again |
| Board lost | red | the last check could not find the board: the old calibration is still in use |
| Not set up, moved, cut off | red | as today |

"Board lost" clears at the next check that finds the board, or at a new
calibration. Its panel says that the autoscorer goes on with the
calibration it had, and offers **Find the board again**. The badge keeps its
panel as today: the picture, the coach, and "Board moved 1.8 mm: followed".

### The turn beep

Today the beep plays as soon as the darts are seen coming out. With the
camera on and the autoscorer scoring, the board is found again on that same
photograph, which takes about half a second. The beep now waits for that
check, whatever it comes to: found, moved and followed, too late, or lost. It
means the board is checked and the next player can throw.

- The check is started by the same settle that ends the pull-out, so it is
  already running when the turn passes. The game visit is told the check's
  promise (`gameVisit.awaitBoard(promise)`), and it holds back its
  `turn-passed` signal until the promise settles.
- The beep never waits more than 3 s: a stuck check must not silence the
  game. A check that is still running then is left to finish on its own.
- Without the camera, or with the autoscorer not scoring, nothing changes:
  no check, no wait.

## As built

Where the build went beyond, or differs from, the design above:

- **The coach in the lab.** The setup coach has a `problemsOnly` mode. It
  says nothing while all is well, so it never doubles the marking coach's
  line. It speaks for:
  - a board not found yet;
  - a moved camera, with its **Find the board again**;
  - a cut-off board;
  - a dark, glaring or blurry picture.

  During a scan it no longer repeats "the camera has moved", since finding
  the board is the answer to that.
- **The frames panel's privacy lines** went into a fold too, with the marking
  help, the autoscorer help and the model credits. `Fold` gained `closed`, and
  it remembers an opened fold as it remembered a closed one.
- **No board yet, in a match:** the camera badge's button and its panel's
  **Find the board** open the capture lab at the scan's confirmation. A lost
  or moved board does the same, with **Find the board again**. Only a board
  cut off leaves for the capture lab without the confirmation.
- **The connection badge** also goes red, with **Pair again**, when the phone
  has dropped out altogether, as the lobby offers it then. While the phone is
  connecting it is amber. The camera panel no longer shows the connection
  light, since the badge has it.
- **The turn signal** is held in the game visit (`awaitBoard`), so the beep,
  and anything else listening for the turn passing, waits for the check.

## Alternatives

- **Keep a setup step, with the finder in it.** It is what screenshot 6 shows,
  and it is why the main button there was wrong: the setup step's only job
  left is one button, which the lab can hold.
- **A modal dialog for the confirmation.** The app has no shared dialog, by an
  earlier decision. The inline panel is the pattern the lab already uses.
- **Beep at once, and the check after.** Then the beep would not mean the
  board is ready, and a dart thrown during the check makes it "too late".
- **Drop the calibration when the board is lost.** The autoscorer would stop
  altogether. A drifted calibration reads most darts right.

## Testing

- **Capture lab:**
  - it opens on the live view with the camera started;
  - with no calibration, Find the board is the primary button;
  - the confirmation opens, Not now closes it, and Scan runs the finder;
  - Use this calibration saves and returns to the live view with no markers;
  - Cancel saves nothing;
  - a moved camera shows one Find the board again, in the coach;
  - `?find=1` stops at the confirmation.
- **Badges:**
  - the connection badge shows only when paired, with its colour from the
    link health and Pair again when red;
  - the camera badge goes cyan during a check and red after a lost one,
    clearing after a found one;
  - a slow link leaves the camera badge alone.
- **Beep:**
  - `turn-passed` waits for the check;
  - it fires at 3 s if the check hangs;
  - it fires at once without a check.
- **Screenshots** for review, as before: Chrome with a real photo as the
  camera, lab and match.

## Open questions

Settled on 2026-10-30:

- **Find the board** opens the confirmation, which says the scan starts right
  away.
- The camera starts when the lab opens.
- A lost board keeps the old calibration, beeps anyway, and turns the camera
  badge red.
