# Snooker Score Board

### v1.6.0

- Added optional offline voice control using local English and Chinese Vosk Docker services.
- The scoreboard stays usable when Docker or the local Vosk service is unavailable.

- Improved potting history with sequential two-digit numbering, player names, ball colors and icons, and a visible scrollbar for longer histories.

### Offline voice setup

The main `snooker_scoreboard.html` uses local Vosk containers for offline voice recognition. Docker
Desktop must be installed and running with its **WSL 2** engine enabled. WSL 2 must be installed
(on Windows, `wsl --install` from an Administrator PowerShell installs it), and Docker Desktop must
show that its engine is running before starting the services.

The English and Chinese recognition models use several GiB of memory each. As a practical guide,
on this PC the loaded English model used about 4 GiB and the Chinese model about 3 GiB; startup can
need more memory temporarily. **16 GiB of system RAM is recommended to run both together.** On a
16 GiB PC, allow WSL up to 10 GiB and 4 GiB of swap if both models are needed. Create or update
`%UserProfile%\.wslconfig` with:

```ini
[wsl2]
memory=10GB
swap=4GB
```

Apply WSL memory changes with `wsl --shutdown`, then reopen Docker Desktop. This stops the WSL VM
and Docker containers. If the PC has less memory, run only the language you need at a time to reduce
memory use. Language selection on the scoreboard chooses which port it connects to; it does not
automatically start or stop Docker containers.

Open PowerShell and run the following from the folder containing this README and `compose.yaml`:
The path below assumes the repository is under `Documents\GitHub`; adjust it if you cloned it
elsewhere.

```powershell
Set-Location (Join-Path $env:USERPROFILE 'Documents\GitHub\snooker\snooker_score_board')
docker compose up -d
docker compose ps
```

The first start downloads both model images; subsequent starts reuse them. Wait for the containers
to show `Up` before turning on voice. To serve the main HTML page, open a second PowerShell window:

```powershell
Set-Location (Join-Path $env:USERPROFILE 'Documents\GitHub\snooker\snooker_score_board')
python -m http.server 8360 --bind 127.0.0.1
```

Open <http://127.0.0.1:8360/snooker_scoreboard.html>. Allow microphone access and use the same URL
and browser profile on future visits so the permission is remembered. Click **🎙️ Voice** to connect
to the recognizer for the currently selected UI language. Audio is sent to the Vosk container on
this PC only. The English service listens on `127.0.0.1:2700`; Chinese listens on `127.0.0.1:2701`.

#### Docker Compose commands

Run these commands from the scoreboard folder. If PowerShell is in another folder, first use the
`Set-Location` command shown above; otherwise Compose may report that it cannot find a configuration
file.

```powershell
# Start both services
docker compose up -d

# Run English only
docker compose stop vosk-zh
docker compose up -d vosk-en

# Run Chinese only
docker compose stop vosk-en
docker compose up -d vosk-zh

# Check which services are running
docker compose ps

# View recent service output
docker compose logs --tail 30

# Stop and remove both containers (downloaded images are kept)
docker compose down
```

Starting one service does not stop the other automatically; use the matching `stop` command when
switching languages to save memory. If voice reports unavailable just after starting a service,
wait for its model to finish loading, then turn voice on again. The scoreboard's manual controls
remain usable when Docker or Vosk is unavailable.

Voice commands are matched against the recognized phrase, so speak one of the exact commands below.
Select **EN** or **中文** on the scoreboard to match the language you are speaking; the selected
language chooses both the recognizer and its command list. English matching ignores capitalization
and surrounding or repeated spaces, and ignores a leading `the` if Vosk adds one to the transcript.
Chinese commands do not contain spaces.

| Action | English commands | 简体中文命令 |
| :--- | :--- | :--- |
| Pot one red | `pot red`, `score red`, `pot one red`; “score read” is also accepted | `打红球`, `打进红球` |
| Pot two reds | `pot two reds`, `score two reds` | `打两颗红球`, `打进两颗红球` |
| Pot yellow | `pot yellow`, `score yellow` | `打黄球` |
| Pot green | `pot green`, `score green` | `打绿球` |
| Pot brown | `pot brown`, `score brown` | `打咖啡球`, `打棕球` |
| Pot blue | `pot blue`, `score blue` | `打蓝球` |
| Pot pink | `pot pink`, `score pink` | `打粉球` |
| Pot black | `pot black`, `score black` | `打黑球` |
| End the visit / pass the turn | `end visit`, `shot taken` | `本轮结束`, `结束本轮` |
| Undo the last action | `undo` | `撤销` |
| Record a foul | `foul` | `犯规` |
| Start a new frame | `new frame` | `新一局` |
| Reset the match | `reset match` | `重置比赛` |

Pot commands are checked against the current snooker rules before they change the score. New-frame
and reset actions retain confirmation. If the recognized words differ from the listed command, the
scoreboard will report it as unknown rather than guessing. Commands that are not currently legal
(for example, potting a color when a red is on) are rejected.

If voice is off or the containers are not running, all existing touch controls continue to work.

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