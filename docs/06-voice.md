# 06 — Voice: calling out and scoring by voice

Two separate features that happen to both involve speech.

## Calling the score out loud

The point is that nobody looks at the screen. What gets spoken:

- The visit total, in caller style: "One hundred and eighty!", "Sixty".
- The remaining score: "You require thirty-two".
- The checkout, when asked for or when the route is non-obvious.
- Leg and set results, and whose throw it is.
- Corrections, so an autoscorer fix is audible: "Correction, forty-one".

### Implementation: recorded clips, the browser's speech for names

The vocabulary is finite (0–180, the doubles and trebles, "you require", a few
shots), so it is **recorded once**: the same voice on every device, starting at
once, and offline after the first visit. `speechSynthesis` is a poor caller on
its own. It varies by browser and device, and when a device has no English voice
it reads English in whatever voice it has (Brave on an Italian Windows reads the
score in an Italian voice).

- **The pack.** `apps/web/scripts/build-caller-pack.py` records every phrase in
  `caller/phrases.ts` into `apps/web/public/caller/<locale>/`: one MP3 holding
  each clip as a whole MP3 file, back to back, and `index.json`, which gives
  each phrase's byte range. English is about 440 clips at 40 kbps. It is
  fetched on the first tap of a match, and each clip is decoded the first time
  it is said. A test checks the shipped pack against the phrase list and
  against the calls of randomly played matches, so a phrase changed in `en.ts`
  without rebuilding the pack fails the build.
- **Delivery.** A stage caller rises with the score, so every phrase has a mood
  (`phrases.ts`): flat below 20, calm to 59, excited to 99, enthusiastic to
  139, wild to 179, and the long, drawn-out 180 on its own. Game shot, set
  and match are at the top. Chatterbox's emotion control turns the mood into
  the voice's excitement. Then every clip gets the same sound: a warm
  microphone tone, levelled like a live desk, with a short room around it.
- **Checked by ear and by machine.** Each recording is transcribed (Whisper)
  and recorded again when the words do not match; the 180 is picked by ear.
  Recordings are cached, so changing the sound does not record them again; a
  full recording takes about two hours on a small NVIDIA card.
- **Names.** A player's name cannot be recorded in advance. A call keeps it apart
  from its words (`caller/call.ts`: `[{ name: 'Ann' }, 'you require forty']`),
  and the browser's speech says just the name, in any voice the device has.
  Bringing a speech model into the page to say names in the same voice was
  weighed and rejected: around 75 MB for one word per call. The clips play
  about 12 dB down so a name is as loud as they are, and the words after a
  name start once the name's measured length has passed, since the Windows
  voices go on with most of a second of silence before they say they are done.
  "Names off", beside the caller in a game, leaves them out: "you require
  forty" alone, and no "to throw".
- **Sounds.** Under the caller, the game plays a dart going in, a bust, and
  the turn passing (`caller/sounds.ts`), picked by ear against the caller.
  The dart and the glass of a bust are short CC0 recordings from Freesound
  (doc 08); the shards falling after the glass, and the turn, are
  synthesised. A dart that busts is not called by its score: the glass
  breaks, and "No score" comes a beat (250 ms) after it.
- **Fallback.** Without the pack (offline on the first visit), whole calls go to
  the browser's speech, but only in a voice of the app's language. With none,
  the caller stays silent rather than read English in another accent.
- **The voice.** Chatterbox's own voice (Resemble AI, MIT), chosen by ear over
  the English Piper voices, which cannot act, and over Chatterbox copying a
  Piper voice, which broke up on the excited lines. Credited on the landing
  page (doc 08).

Phrases are data, one file per locale, never string-concatenated in code — "one
hundred and eighty" versus "centottanta" is not a formatting problem. A new
locale needs its strings, a voice, and its own pack.

## Scoring by voice

The player says the score instead of touching anything. This matters in the two
cases the project cares about: the autoscorer got it wrong and the player does
not want to walk to the phone, and solo practice where any interaction breaks
rhythm.

### Grammar

A small, closed grammar per locale, parsed in `packages/core` so it is unit
tested without a microphone:

| Utterance | Meaning |
|---|---|
| "treble twenty", "triple twenty", "t twenty" | T20 |
| "double sixteen", "d sixteen" | D16 |
| "twenty", "single twenty" | S20 |
| "bull", "bullseye", "fifty" | inner bull |
| "outer bull", "twenty five" | outer bull |
| "no score", "miss", "out" | 0 |
| "sixty", "one hundred and forty", "one eighty" | a visit total, split into the canonical darts |
| "undo", "scratch that" | retract the last dart |
| "next player", "confirm", "yes" / "no" | flow control |

Totals are accepted as well as individual darts, because that is how players
actually talk. A total is stored without `pos`, and the stats layer knows it.

### Recognition: adapters, because the platform is uneven

`VoiceInput` is an interface with adapters, chosen at runtime by capability:

1. **Web Speech API** — default where it works. Chrome/Edge are the realistic
   targets, and they support the two things that make it usable here:
   `processLocally` for on-device recognition (no audio leaves the device) and
   contextual biasing via `phrases`, which is boosted with the darts vocabulary
   and, dynamically, with the phrases that are plausible right now ("double
   sixteen" when the player is on 32). Biasing the recogniser to the current
   game state is a large accuracy win for free.
2. **Grammar-constrained offline ASR** (Vosk-class WASM model, ~40 MB, cached) —
   for Safari and Firefox, where the Web Speech API is absent or unreliable, and
   for noisy rooms, where a closed grammar beats a general recogniser
   comfortably. Opt-in download.
3. **Push-to-talk fallback** — hold a big button while speaking. Continuous
   listening in a room with music and other players is the failure mode nobody
   plans for; a button is not a defeat.

### Honest platform limits, stated now

- Voice input on iOS Safari is unreliable; the offline adapter exists because of
  that, and until it ships, iOS gets manual and camera scoring only.
- Continuous recognition burns battery. Voice input defaults to push-to-talk in
  solo mode and to continuous in paired mode, where the laptop does the
  listening.
- A misheard score must never silently change the game: every voice score is
  echoed by the caller, and "undo" is always one word away.
