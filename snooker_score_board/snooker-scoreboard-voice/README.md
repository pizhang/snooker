# Snooker Score Board

### v1.6.1

- **Voice commands are hands-free.** Click the 🎙️ chip once and the board keeps listening — the
  microphone re-opens itself after every command — until you click it again or press **V**.
  Commands work in English and 中文, and destructive ones ask first (by voice or on a dialog).
- v1.6.0 — voice control (superseded: an optional local Whisper engine was tried and removed in
  v1.6.1 in favour of the browser's recogniser, which needs no install).
- v1.5.0 — improved potting history with sequential two-digit numbering, player names, ball
  colors and icons, and a visible scrollbar for longer histories.

### Languages

The board ships in **English** and **简体中文 (Simplified Chinese)**. Use the **EN / 中文**
switch in the footer to change it — the choice is saved in `localStorage`, and a browser
whose language starts with `zh` opens in Chinese by default.

- Every UI string is translated from the `I18N` dictionary at the top of the script:
  title, phase indicator, ball-on text, foul dialog, buttons, debug panel and the version
  line. The `<html lang>` and the document title follow the language too.
- Default player names follow the language (**Player A / Player B** ↔ **玩家 A / 玩家 B**),
  but only while they are untouched — a name you typed yourself is never overwritten.
- To add another language: copy the `en` block inside `I18N`, translate the values, and add
  a chip with a matching `data-lang` to the `#langSwitch` element in the markup.

### How the rules now work:

**Phase 1: Reds on table (reds > 0)**
- ✅ **Red button** is enabled (and glows red) — only on the **active player's** card
- ✅ **Color buttons** are only enabled **after** a red is potted (they glow gold when allowed)
- ❌ After a color is potted, all color buttons become disabled again until the next red is potted
- This enforces the **Red → Color → Red → Color** sequence
- ✅ **Two reds in one stroke** — the **🔴🔴 2** button scores 2 points and takes two reds off
  the table. It disables itself when fewer than two reds are left, and like a single red it
  makes a color available next.

**Phase 2a: Last red potted (reds = 0, before any color)**
- ❌ Red button is disabled
- ✅ **Any** color can be potted — all color buttons are enabled
- That color is **re-spotted**, so it stays on the table and does **not** gray out
- If the visit ends without potting a color, the colors phase starts at Yellow

**Phase 2b: Colors only**
- ✅ Only the **next color in order** is enabled (Yellow → Green → Brown → Blue → Pink → Black)
- The next color ball **glows gold** and the button also glows gold
- After **Black** is potted, the frame ends

**Phase 3: Frame Over**
- All buttons disabled
- "🏁 FRAME OVER" badge appears
- Click "New Frame" to award the frame to the higher score and start the next one

---

### End of frame with the Black (WPBSA §2 Def 1(d), §3 R4)

- **Black is the only ball left** → the **first pot or foul ends the frame**. A foul that does not
  level the scores ends it immediately (the penalty points still count).
- **Scores level after the Black** → **re-spotted black**: the phase indicator shows
  "⚫ Re-spotted black — draw lots!", the Black goes back on the table and the frame continues.
  The players draw lots for who plays first — the board hands over to the other player, and you can
  correct it with the **START PLAY** chips. The next **pot or foul** ends the frame.
- **🏳️ Concede** — an accepted concession ends the frame and awards it to the opponent straight
  away (the scores stay on screen and the concession can be reversed with **Undo**).
- **The breaker alternates every frame** (§3 R3(b)): if A broke off this frame, B breaks off the next.
  Picking the starter with the chips before the frame begins also sets that alternation.

---

### Shared controls (between the two players)

The middle column sits between the two player cards and always acts on the player whose
turn it is — so there is only one of each control.

- **START PLAY** — two chips labeled with the player names. Tap one to choose who breaks
  the frame. The chip for the player at the table is highlighted gold, and tapping the
  other chip hands the table over (handy if the wrong player was credited).
- **🎯 Shot Taken** — available for the whole frame. Press it whenever the visit ends,
  whether the player potted or **missed** (a miss after a red + color, or a miss on the
  first red of a visit). It is a single tap with **no confirmation** — the table is handed
  over immediately, so use **Undo** if you tap it by mistake.
- **⚖️ Foul** — the player at the table is the offender. The dialog adds the penalty
  points to their opponent, ends the visit and hands the table over. See below for the
  options inside the dialog.

### Foul dialog

The dialog shows the **ball on** and the **minimum penalty**, pre-selects that minimum,
and lets you raise it before applying:

| Situation | How to record it |
| :--- | :--- |
| Cue ball in pocket during the reds (4 min) | Foul → **Apply 4** |
| Foul involving a color during the reds (e.g. hit the black first) | Foul → tap **5 / 6 / 7** → Apply |
| Cue ball in pocket during the colors stage | Minimum is the value of the color on (blue on → min 5, pink on → 6, black on → 7); lower values are disabled |
| Cue ball in pocket, and a red went in too | Foul → tap **🔴 Red also potted** → Apply — the red stays down (one less red on the table) |
| A red goes in while a color was on | Same option: **🔴 Red also potted** |
| Foul on the last red (red goes down on the foul) | **🔴 Red also potted** — the incoming player then gets a color of their choice, then the colors in order |

The toggle is disabled when no reds are left on the table, the dialog is cancelled with
**Cancel** or a tap on the backdrop, and **Undo** restores the red as well as the points.

### Whose turn is it?

A pulsing gold arrow sits on the outside of the player who is at the table — ▶ on the
left of Player A, ◀ on the right of Player B. It moves as soon as the visit ends, whether
that happens through **Shot Taken**, **Foul**, or tapping the other **START PLAY** chip.

Only the player at the table can score: their ball buttons light up, while the opponent's
seven buttons stay disabled and dimmed until the table is handed over. This is enforced in
the code as well (`addPoints` ignores any pot that is not made by `state.turn`), so a stray
tap can never score for the wrong player.

### Action row

| Button | What it does |
| :--- | :--- |
| **↩️ Undo** | Reverses the last pot, foul or concession (restores scores, reds, frames and the turn) |
| **🏳️ Concede** | Ends the frame and awards it to the opponent — asks which player concedes first |
| **🔄 New Frame** | Awards the finished frame to the higher score (unless it was already conceded) and starts the next one, with the breaker alternating |
| **🏆 Reset Match** | Clears frames, scores and names |

---

### Visual indicators:

| Indicator | Meaning |
| :--- | :--- |
| 🔴 **Red button glows red** | You can pot a red |
| 🟡 **Color button glows gold** | You can pot this color (either after a red, or in the colors phase) |
| Color ball **pulsing red** | Last red just potted — any color may be potted (and is re-spotted) |
| Color ball **glowing gold** | This is the next color that must be potted (colors phase) |
| **"🔴 Reds"** indicator | There are still reds on the table |
| **"🏁 FRAME OVER"** | The frame has ended |

---

### Example gameplay:

1. **Pot Red (1)** → Red counter decreases; the same player stays at the table
2. **Pot Yellow (2)** → Yellow is re-spotted; the same player continues
3. **Can't pot Green (3)** → Button is grayed out (need to pot a red first)
4. **Pot Red (1)** → color buttons become available again
5. **Pot Green (3)** → Allowed again!

After all 15 reds are potted:
6. **Any color** is allowed for one shot (whichever you pot is re-spotted) — e.g. Black
7. Then **only Yellow (2)** is enabled → pot it
8. ...continues in order until Black (7)
9. **Frame ends!** 🏁

Hand the table over with **🎯 Shot Taken** (or a foul) — potting balls alone does not change the turn.

---

## Voice commands

The **🎙️ Voice** chip sits in the footer next to the language switch. **Click it once and it stays
listening** — every command is picked up hands-free from then on, until you click the chip again or
press **V**. A right-click on the chip (or **?**) opens the phrase sheet, and every command is still
**one Undo away**.

The first time you arm it, the browser asks for microphone access once; it remembers the answer, so
you should not see that prompt again for this page. While the board is armed the microphone is
genuinely open (the recogniser re-opens itself after every utterance), so your browser keeps its
recording indicator on — that is expected, and clicking the chip stops it.

#### Opening the page so the prompt stops repeating

If you open `snooker_scoreboard.html` straight from disk (`file://`), Chrome treats the page as an
opaque origin and cannot keep the microphone grant, so it asks again on every reload. Serve the
folder from a fixed local address instead:

```bash
python serve.py          # serves this folder, picks a free port, opens the browser
serve.bat                # same thing on Windows, one double-click
python -m http.server 8360
```

Then use `http://127.0.0.1:8360/snooker_scoreboard.html`: one grant, remembered from then on. The
chip says so when it notices it was opened from a file.

**If nothing is recognised**, check the browser's own microphone permission first
(`chrome://settings/content/microphone`) and which input device Windows has selected. The chip tells
you what was heard (`❓ Heard "…" — no command matched it` when the transcript arrived but was not a
command, and nothing at all when no audio arrived). The board uses the browser's speech recogniser
only; there is no local engine and no server-side configuration.

| Say | What the board does |
| :--- | :--- |
| `red` · `one red` · `two reds` | Pots a red (or two reds for 2 points) for the player at the table |
| `yellow` `green` `brown` `blue` `pink` `black` | Pots that colour — only if the rules allow it right now |
| `5 points` · `seven` | The same, by ball value |
| `end of visit` · `shot taken` · `miss` · `pass` · `next player` | Ends the visit and hands the table over |
| `foul` · `foul five` · `foul five and a red` · `four away` | Opens the same penalty the ⚖️ Foul button applies |
| `undo` | Reverses the last pot, foul or concession |
| `new frame` · `reset match` | **Asks first** — mic on: answer `yes` / `no`; mic off: tap **YES** on the dialog |
| `player a concedes` · `player b concedes` | **Asks first**, then awards the frame to the opponent |
| `whose turn is it` | Reads back who is at the table |
| `help` · `what can i say` | Opens the phrase sheet |
| `speak chinese` · `speak english` | Switches language, including the recogniser |

Chinese works the same way: `红球`, `两颗红球`, `黑球`, `咖啡球`, `犯规`, `本轮结束`, `撤销`,
`新一局`, `该谁了`, `玩家A认输`, `说中文`.

### How it behaves

- **Voice is not a second scoring path.** A transcript is parsed into one intent and dispatched
  through exactly the same guarded functions the buttons call, so the turn check and every phase
  rule still apply: a stray utterance can never score for the wrong player and never leaves the
  state machine in an illegal phase.
- **Nothing is guessed.** Unrecognised speech is ignored — the chip shows what it heard with a ❓
  and no score changes. Destructive commands (**new frame**, **reset match**, **concede**) always
  ask before they are applied: with the microphone on, the board says "… Confirm?" in the chip,
  re-opens the microphone, and the next `yes` or `no` decides (or `确认` / `取消` in Chinese); with
  it off, the same question appears as a dialog whose **YES** runs the action. Words in the table
  above that also exist as buttons — **foul**, **undo**, **concede** — behave exactly like those
  buttons; the foul dialog is only opened by the button.
- **One command per utterance.** The recogniser can return several results for one sentence; the
  board applies the first final one and ignores the rest of that recognition session, so "red" is
  scored once. The next utterance is a fresh session, opened automatically.
- **Speech recognition is a browser feature.** Chrome and Edge implement it; Firefox does not, and
  there the chip reports that voice is unavailable and the board works exactly as before. Chrome
  and Edge send the recorded audio to their vendor's speech service to transcribe it, so this is
  not an offline feature — the design notes cover the alternatives if that matters.
- **The microphone stays on while armed.** Hands-free means the recogniser is kept alive by
  re-opening its session after each utterance, so the browser's recording indicator does not blink
  off between commands. Click the chip (or press **V**) to stop.

### Tests

```bash
node snooker_rules_test.js   # rules regression (needs a working shell)
node voice_test.js           # voice parser contract + end-to-end board checks
```

Both load `snooker_scoreboard.html` through `test_harness.js`, which runs the board's script in a
`node:vm` context with a DOM stub — no browser and no npm install required.

**[voice_parser_test.html](voice_parser_test.html)** runs the parser cases directly in the browser and
prints a pass/fail table — no shell needed. It embeds a copy of the parser, and it can also test the
real one: choose or paste `snooker_scoreboard.html` in the page and it extracts the parser from that
file, runs every case against it, and prints a drift report showing where the embedded copy has
fallen behind. `node voice_test.js` is still the suite that covers the board wiring (turn checks,
undo, the recogniser, the dialogs).