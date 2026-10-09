# Voice control — design notes and the options considered

## 1. What the existing board already gives us

`snooker_scoreboard.html` is one self-contained file: markup, CSS, an `I18N` dictionary
(EN/中文) and a single IIFE holding the whole state machine. Everything a voice layer needs is
already there, and it is worth being precise about what that is, because it decides the design:

| Existing piece | Why it matters for voice |
| :--- | :--- |
| `addPoints(player, value, redCount)` refuses any pot where `player !== state.turn` | The "a stray tap can never score for the wrong player" guarantee is enforced in the function, not the UI — so a voice layer cannot bypass it even if the recogniser hands us garbage |
| `canPotReds` / `canPotColor` encode every phase rule | A spoken "green" in the reds phase is simply refused, exactly like a tap on a disabled button |
| `takeShot()` / `handOverTo(player)` | One call ends the visit and hands the table over |
| `showFoulDialog` → `applyFoul(pts, redAlsoPotted)` | Fouls are already split into "collect the parameters" and "apply", which is exactly the shape a parser returns |
| One history entry per mutation, `undo()` restores scores, reds, phase and turn | Every voice action is reversible, so a misheard command costs one Undo |
| `render()` saves to `localStorage` and paints everything | A voice action needs no new UI code — call the action and the board redraws |
| `I18N` with `en` and `zh` | Both target languages are already localised, so the recogniser can follow the UI language |

There is also one real hazard: the four ball buttons on each player's card are **disabled for
whichever player is not at the table**. Any voice layer that blindly forwards "red" as a
synthetic click on a specific player's button would either do nothing or hit the wrong player's
card. Voice must therefore be routed by *intent*, not by simulated clicks.

## 2. The options

**A. Browser Web Speech API (`SpeechRecognition`)** — Chrome/Edge ship it; a handful of lines
get live transcription with interim results, `confidence`, and language selection. Free, no
backend, no dependency, works from `file://` or any static host. Costs: Chrome and Edge send the
audio to their vendor's speech service ([Chrome's on-device mode is still only a proposal][w3c]),
Firefox has no implementation at all ([2](https://github.com/vercel/ai-elements/issues/210)), and
a snooker club is a noisy room.

**B. Cloud STT of your own (Whisper API, Azure, Google)** — better accuracy, your own vocabulary
biasing, but it needs network on every shot, an API key shipped in a client-side app, a
round-trip per utterance, and it sends match audio to a third party. Wrong trade for a scoreboard
whose whole point is that it is one file you open.

**C. On-device STT (Vosk, whisper.cpp via WASM, Moonshine)** — no network and no data leaving the
machine, with a grammar you can restrict to 30 phrases. Costs: a 50–200 MB model download, a
build step, and a wasm runtime — which breaks the "single HTML file, no build" property that makes
this board pleasant to use.

**D. A hybrid** — Web Speech API as the default (A) with a hand-rolled offline fallback (C) behind
a feature flag.

**Recommendation: A, built as a thin intent layer, with C left as a later option.** The board is a
single offline file used at a table by two people who are holding cues; a 200 MB model download and
a toolchain is a large price for a command vocabulary of roughly thirty words. The important part
is not the recogniser — it is that the recogniser's output is treated as *untrusted text* and put
through the same guards as a button press. If accuracy in a noisy club ever proves inadequate, the
same parser can be fed by an offline engine later without touching any rules code.

## 3. What was built

```
microphone ──► SpeechRecognition ──► transcript (untrusted text)
                                          │
                                          ▼
                              parseVoiceCommand(transcript, lang)
                                          │  exactly one intent, or null
                                          ▼
                              executeVoiceCommand(intent)
                                          │
        ┌──────────────┬──────────────────┼───────────────┬──────────────┐
        ▼              ▼                  ▼               ▼              ▼
    addPoints      takeShot          applyFoul          undo      newFrame / resetMatch /
  (turn-checked)  (hand over)     (penalty pts)      (history)      concedeFrame
```

Everything above the last row is new; the last row is the existing board, unchanged in behaviour.

Key properties:

- **One intent per utterance.** `parseVoiceCommand` returns a single object
  (`{kind:'pot', value:7, reds:1}`, `{kind:'endVisit'}`, `{kind:'foul', pts:5, redAlsoPotted:true}`,
  …) or `null`. A transcript like `red black` matches only the red, never both — voice can add
  two balls with one sentence.
- **Unknown speech is a no-op.** It shows the `❓ "what it heard"` chip and changes nothing, so
  background conversation at the next table cannot move the score.
- **Explicit beats implicit.** A foul is only recognised when the word *foul* is spoken (or the
  unambiguous "four away" shape), so "foul on the blue" can never be read as potting the blue.
- **Destructive = confirmed, by voice.** `new frame`, `reset match` and `concede` park themselves
  in a pending slot and the board asks "… Confirm?" out loud — the microphone re-opens for the
  answer, and the next utterance `yes` or `no` decides (确认 / 取消 in Chinese). If the microphone
  is off, the same question appears as a dialog whose YES runs the parked action, with a plain
  `confirm()` as the last resort. A confirmation that is never answered is simply dropped.
- **A negated ball never scores.** "not blue, yellow" drops the negated segment and pots yellow;
  "no red" does nothing at all.
- **Push once, then hands-free.** The Web Speech API has no true continuous mode and no "listen for
  N seconds" setting: the engine decides when an utterance and a silence have ended. The board
  therefore sets `continuous = true` (one session spans several commands, so there are far fewer
  gaps and fewer of Chrome's per-session start beeps) and re-opens the session whenever the engine
  closes it. Three constants in the voice block control the feel:
  `voiceRestartDelay = 250` (gap after an utterance), `voiceSilenceDelay = 600` (gap after a silent
  session) and `voiceMaxRestarts = 3000` (the loop guard). Lower the first two for a tighter feel;
  raise them if the restarting itself becomes distracting.
- **Accuracy: alternatives plus near-miss, not grammars.** `maxAlternatives = 5`, and if the top
  guess is not a command the board tries the others, repairing a single-character slip
  (`yello` → `yellow`) only onto words it already knows. Chrome documents that it ignores JSGF
  grammar contents, so a grammar would add risk without biasing anything. When a lower-ranked guess
  wins, the chip shows both, so a wrong pick is visible rather than silent.
- **One engine: the browser's recogniser.** A local Whisper engine was built and then removed
  (v1.6.1). It was the wrong trade for this board: it needed a ~490 MB model, pip packages and a
  server process, and its audio capture path could not be validated reliably, while the browser
  recogniser needs no install and already worked. The compatibility work it forced is gone with it.

### What recognition actually depends on

The Web Speech API is a general dictation engine with no vocabulary control, so accuracy is decided
mostly by the microphone and the room, not by page settings. In order of payoff:

1. Put the microphone near the mouth (a headset or lapel mic), not across the table.
2. Check the OS input device and level, and that Chrome selected the same device.
3. Keep the room's competing noise down; the board ignores anything that is not a command, so
   background talk is usually harmless, but it can drag a word the wrong way.

Within the page, the accuracy work is `maxAlternatives = 5` plus the near-miss matcher, which snaps
a single-character slip (`yello` → `yellow`) onto a word the board already knows. When a lower-ranked
guess wins, the chip shows both, so a wrong pick is visible rather than silent.

**Microphone troubleshooting** is the browser's own: `chrome://settings/content/microphone` for the
permission, and the OS sound settings for the device. The chip reports what happened —
`❓ Heard "…" — no command matched it` means audio arrived and the transcript was not a command,
while no chip change at all means no recognition result arrived.
- **Permission is asked once, at the click — but only on a real origin.** The chip calls
  `getUserMedia` before starting the recogniser, which puts the browser's permission prompt at a
  predictable moment and then releases the device so the recogniser can use it. Browsers remember
  the answer *per origin*, and a `file://` page has no stable origin, which is why opening the HTML
  from disk re-asks every time. Serving the folder (`python serve.py`, `serve.bat`, or
  `python -m http.server`) and using `http://127.0.0.1:<port>` makes the grant stick. A page cannot
  host that server itself: browsers expose no socket API, so the server has to be a process.
- **One command per utterance.** A guard flag (`voiceSessionHandled`) means the multiple results a
  recogniser emits for one utterance cannot apply a pot twice.
- **No speech synthesis.** The board never talks, partly because chirping status text at the table
  is annoying and partly because a board that speaks will hear itself — which matters much more now
  that the microphone stays open. Feedback is a chip plus a short 880 Hz chime (Web Audio).
- **Bilingual.** The recogniser language follows the UI language (`en-GB` / `zh-CN`), and saying
  "speak chinese" / "说中文" switches both.

## 4. Honest limitations

1. **Chrome/Edge only.** Firefox has no `SpeechRecognition`, so there the chip says so and the
   board is unchanged. Safari's implementation is partial.
2. **Audio leaves the machine** in Chrome and Edge — the request is transcribed by the vendor's
   service ([discussion][w3c]). If a match must stay private or offline, option C is the answer.
   This now applies continuously while the board is armed, not just per command.
3. **Noisy rooms are the real accuracy limit**, more than accents. "Brown" is the risky word
   (round/down/frown); "black" and "blue" are close in some accents. The design absorbs that:
   a wrong colour is either rejected by the rules guards (if illegal) or costs one `undo`, which
   is itself voice-addressable.
4. **`file://` microphone access** is not universally granted. Opening the file directly works in
   current Chrome/Edge, but a local static server (`python -m http.server`) is the reliable path.
5. **The board's own audio output must stay off** while the microphone is open — hence no speech
   synthesis and a very quiet chime.
6. **Nothing here was executed in the build environment.** The shell is blocked by a Windows
   permission problem on this workspace (`SetNamedSecurityInfoW failed (Win32 5)`), so the code
   and the tests were verified by reading, not by running — including three independent static
   passes. Those passes caught seven real defects, now fixed: the board's IIFE made the test
   harness unable to reach it; the spoken `yes`/`no` path was unreachable because nothing parked a
   pending confirmation; the overlay's YES button discarded the parked action; `player a
   concedes`/`玩家a认输` could not identify a player because alternatives were compared
   token-by-token; a negation swallowed the rest of the utterance; a refused pot was reported as a
   success; and the concede prompt showed "A" instead of the player's name. `node voice_test.js`,
   then `node snooker_rules_test.js`, is the first thing to run once a shell works — three test
   bugs of my own were found the same way (a red per visit, a foul credited to the wrong player,
   and a fallback path the harness could no longer reach).

## 5. Files

| File | Purpose |
| :--- | :--- |
| `snooker_scoreboard.html` | The board, with the voice layer added |
| `serve.py` · `serve.bat` | One-click local server so the microphone grant survives a reload |
| `voice_parser_test.html` | **Open this in a browser** — runs the parser cases, and can test the real file's parser (choose or paste it) with a drift report |
| `voice_test.js` | Parser contract + end-to-end board checks (`node voice_test.js`) |
| `test_harness.js` | Loads the board's script into `node:vm` with a DOM stub |
| `voice_parser_verify.js` | Separate contract runner (independent verifier's 83-case suite) |
| `snooker_rules_test.js` | Rules regression suite |
| `static_review_voice.md` | Independent static review of an earlier revision (historical) |

[w3c]: https://lists.w3.org/Archives/Public/public-webapps-github/2025Apr/0464.html
