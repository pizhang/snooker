# Static review — voice layer of `snooker_scoreboard.html`

**Reviewer:** static analysis subagent (read/glob/grep only).
**Nothing was executed.** The shell is blocked in this workspace (`pwsh` → `SetNamedSecurityInfoW grantWrite` failure) and I did not retry it or work around it. No JavaScript engine was available, so **no file was parsed or run, no regex was evaluated, no test was run, and no `node voice_test.js` output exists**. Everything below is from reading the source and hand-evaluating it. Where I state a returned value, it is a hand trace, not an execution result.

**The file changed under me three times during this review** (the Lead is editing). Line numbers are therefore a moving target; **the quoted code is the authority**. The revision my numbers refer to is the last one I read: app ends `init();` at line 2932 inside a 2942-line file; `voice_test.js` 401 lines; `test_harness.js` 249 lines. Two things were fixed by the Lead while I was reading and are recorded as *fixed*, not as defects: the harness export scope bug and the missing `voiceHelpNoteLabel` key.

Files reviewed: `snooker_scoreboard.html` (read fully, 2906→2942 lines across revisions), `test_harness.js`, `voice_test.js`. I also glanced at `voice_parser_verify.js` for comparison (noted where relevant, not fully reviewed).

---

## (a) PARSE-TIME ERRORS

**None found.** I found no construct that would be a parse error. I verified this by reading every delimiter-bearing construct in the script, not by running a parser, so this is a strong reading-based claim rather than a machine-verified one.

Specific traps the task asked about, all **legal**:

1. **Regex literal containing `/` inside a character class** — `snooker_scoreboard.html:2265`:
   ```js
   .replace(/[-_/\\]+/g, ' ')
   ```
   An unescaped `/` inside `[...]` does **not** terminate a regex literal: the ECMAScript `RegularExpressionClassChar` production excludes only `]` and `\`. Well formed, no escaping needed.

2. **The negated-phrase pattern is not a regex literal at all** — `:2257`:
   ```js
   const re = new RegExp(`(?:${boundary}(?:${alternatives})${boundary})${gap}[^,.;，。；]*`, 'g');
   ```
   It is a template string handed to `new RegExp`; the `/` characters in the predecessor are gone entirely. Template substitution and the produced pattern `(?:…)\s+[^,.;，。；]*` are well formed.

3. **`voiceEscape`** — `:2212`: `String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')` — valid class, valid replacement.

4. **`penaltyShape`** — `:2315`: `/^\s*(\d+|one|…|ten)\s+(?:points?\s+)?away\b/` — the only unescaped `/` are the delimiters. Valid.

5. **Chinese patterns** — `:2279` `/[\s,，。！？、；：]/g`, `:2329` `/两[颗个]?红/` — valid (`?` on a class is legal).

6. **`function finish(approved)` declared inside the `try` block** — `:2506`. A block-level function declaration inside a `try` block is legal in strict mode (ES2015+ block-scoped function declaration), and `finish` is referenced only inside that same block (`:2519`, `:2520`, `:2522`, `:2526`). Not an error.

7. **Backticks** are balanced. 54 lines contain a backtick. Exactly six are single-backtick openers (`:1381`, `:1576`, `:1800`, `:2464`, `:2713`, `:2724`) paired with closers in LIFO order (`:1389`, `:1588`, `:1817`, `:2474`, `:2718`, `:2739`); every other backtick line carries exactly two. No stray/odd template literal.

8. **Cosmetic oddity, not an error** — `:2119` has two properties on one line:
   ```js
   no: ['no', …, 'dont'],                ball: {
   ```
   Inside an object literal this is valid. It is the merge (one line removed) that shifted the vocabulary block by −1 relative to an earlier revision.

Structural sanity: the IIFE opens at `:872` `(function() {`, closes at `:2934`-ish `})();` after `init();` (`:2932`), and the `<script>` block is `:871`–`:2936`. I read each block's delimiters and found no imbalance; I cannot machine-verify the whole-file brace/paren/bracket balance without a parser, and I do not claim to have done so.

---

## (b) DECLARATION-ORDER / TEMPORAL DEAD ZONE

**No TDZ hazard is reachable in the current file.** The IIFE's only top-level statement is `init();` as its last statement, so every `let`/`const` in the IIFE is initialised before any function that reads it can run.

Checked explicitly:

| binding | declared | read by | verdict |
|---|---|---|---|
| `voicePending` | `:2105` `let voicePending = null;` | `parseVoiceCommand` `:2288-2298`, `executeVoiceCommand` `:2416/2425/2437`, `voiceConfirm` `:2511/2532` | safe — all readers run after full evaluation (parse is only ever called from the runtime dispatch) |
| `voiceConfirmInFlight` | `:2106` | `voiceConfirm` `:2477/2526`, `startVoiceListening` `:2669` | safe |
| `voiceStatus` | `:2537` `let voiceStatus = { key: 'voiceOff', text: '' };` | `updateVoiceChip` `:2541` (read), `voiceSay*` | safe — declared before its first reader **and** before `init()` |
| `voiceSupported` | `:1201` `const voiceSupported = !!(…)` | `updateVoiceChip`, `toggleVoiceMute`, `showVoiceHelp`, `voiceConfirm` `:2483`, `bindVoice`, `init` | safe, declared early |
| `voiceChip` | `:1199` `const voiceChip = document.getElementById('voiceChip');` | `updateVoiceChip` `:2539` | safe, declared early |
| `voiceAwaitAnswer` (new) | `:2107` | `voiceConfirm` `:2483/2484`, `voiceHandleEnd` `:2697-2698` | safe |
| `voiceListening` `:2598`, `voiceMuted` `:2599`, `recognition` `:2597`, `voiceSessionActive/Handled`, `audioCtx` | all `let` in `:2597-2602` / `:2725` | `updateVoiceChip` `:2545/2548/2581`, `startVoiceListening`, `voiceChime` | safe **only because** nothing calls them before `init()` |

The **latent hazard** worth knowing: `updateVoiceChip` (`:2538`) is a hoisted function declaration that reads `voiceMuted` (`:2599`) and `voiceListening` (`:2598`), both of which are `let`-declared *after* it in source order. It is called from `render()` — `:1476` `if (voiceChip) updateVoiceChip();` — which is called from `loadState()` (`:2793` area) and `init()` (`:2932`). Because `init()` is the final top-level statement, those `let`s are already initialised. **The exact call path that would break:** if any `render()`/`bindVoice()`/`updateVoiceChip()` call were hoisted above line `:2599` (for example a stray `render();` at the end of the voice block, or moving the voice `let`s below `init()`), it would throw `ReferenceError: Cannot access 'voiceMuted' before initialization`. This is a fragility, not a current defect.

---

## (c) UNDEFINED / DUPLICATE IDENTIFIERS

Every identifier in the voice block is **defined exactly once**; no call resolves to an undefined name. Verified by grepping each requested name for `function <name>`:

`voiceEscape:2211`, `voiceHasPhrase:2216`, `voiceAnyNumber:2222`, `voiceZhNumber:2233`, `voiceDropNegated:2246`, `voiceNormalize:2261`, `voiceFindPlayer:2362`, `voicePotLabel:2381`, `executeVoiceCommand:2386`, `voiceConfirm:2476`, `voiceSetChip:2539`, `voiceSay:2544`, `voiceSayError:2551`, `voiceSayHeard:2558`, `voiceSayUnknown:…`, `updateVoiceChip:2538`, `voiceSpeechCtor:…`, `voiceBuildRecognition:…`, `voiceHandleResult:…`, `voiceRouteTranscript:…`, `startVoiceListening:…`, `voiceHandleEnd:2689`, `stopVoiceListening:2703`, `toggleVoiceMute:2711`, `voiceChime:…`, `showVoiceHelp:…`, `bindVoice:…`. Each appears exactly once as a definition; no duplicates.

Notes:

- **`voiceSupportedNow` and `voiceResolveConfirm` no longer exist anywhere in the file** (they were present in an earlier revision I read and have since been removed). They are neither defined nor referenced, so they are not defects — just confirming they are gone, since the task asked about them.
- **`executionAllowed` is referenced only inside a comment and is defined nowhere** — `:2413`:
  ```js
  // executionAllowed(), which the affirmative answer calls.
  ```
  Grep for `executionAllowed` returns that one line. It is a comment, so it cannot throw, but it documents a mechanism that does not exist in the code — and that missing mechanism is exactly defect **F1** below.
- **`voiceLastTranscript` is written but never read** (dead variable): `let voiceLastTranscript = '';` plus assignments in `voiceHandleResult` and `voiceRouteTranscript`; no read anywhere. Harmless, deletable.
- **`onYes` is assigned three times and never read/called** — `:2416`, `:2425`, `:2437`; grep for `onYes` returns only those three lines. This is defect **F1**.

---

## (d) I18N GAPS

**No gaps and no duplicates.** Both language blocks define the same key set, and every key used by `t('…')` in the script and every `data-i18n` / `data-i18n-title` value in the markup exists in **both** `I18N.en` and `I18N.zh`.

- Markup keys (all present in both): `title`(735), `onTable`(738), `frameOverBadge`(751), `twoReds`(769, 802 — `data-i18n-title`), `startPlay`(781), `shotTaken`(787), `foul`(788), `undo`(822), `concede`(823), `newFrame`(824), `resetMatch`(825), `dbgPhase`(830), `dbgReds`(834), `dbgColors`(838), `dbgFrameOver`(842), `dbgTurn`(846), `dbgScoreA`(850), `dbgScoreB`(854), `footer`(860), `voiceToggleTitle`(865 — `data-i18n-title`), `voiceOff`(866).
- Script keys: `docTitle`, `defaultNameA/B`, `phaseReds`, `phaseAnyColor`, `phaseNextColor`, `phaseOver`, `phaseRespottedBlack`, `phaseShort`, `colors`, `ballOn`, `redOn`, `anyColorOn`, `pointsTo`, `minimum`, `redAlsoPotted`, `redPottedOn`, `redStaysDown`, `noRedsLeft`, `apply`, `applyWithRed`, `cancel`, `none`, `yes`, `no`, `version`, `toPlay`, `enterName`, `concedeTitle`, `concedePrompt`, `resetMatchConfirm`, `voice`, `voiceOff/On`, `voiceToggleTitle`, `voiceListening`, `voiceHeard`, `voiceUnknown`, `voiceNeedConfirm`, `voiceUnsupported`, `voiceWhoIsAtTable`, `voiceHelpTitle/Hint/Close/NoteLabel`, `voiceCmd*` (11 keys via `VOICE_HELP_KEYS` `:2197-2209`), `voiceTwoReds`, `voiceApplied*` (8), `voiceNothingToUndo`, `voiceNeedConceder`, `voiceFoulRange`, `voiceFrameOver`, `voiceCancelled`, `voiceSayYesNo`, `voiceAskNewFrame/ResetMatch/Concede`, `voiceError`, `voiceHelpBrowserOk/Missing`.
- `voiceHelpNoteLabel` (used at `:2772`) is now defined in **both** blocks (`:985` `'Note'`, `:1083` `'说明'`) — this was missing in the first revision I read and the Lead fixed it mid-review.
- No key appears twice inside either block (I listed every `^\s{16}<ident>:` key in `:911-1004` and `:1009-1103` and compared the two sets — identical, no repeats).

Two behavioural notes, not gaps: `t()` (`:1110-1115`) falls back to `I18N.en[key]` and then returns the **key literal** on a miss, so a future gap renders as raw `voiceSomething`. And `voicePotLabel` (`:2382`) gets a colour name for a red via `t('colors').red`, i.e. it relies on `t('colors')` returning the nested object rather than a string — it works in both languages today, but it is fragile.

---

## (e) TRANSCRIPT TRACE — `parseVoiceCommand(transcript, langOverride)`

Hand-traced, not executed. State at trace time: `nameA 'Player A'`, `nameB 'Player B'`, `turn 'A'`, `reds 15`, `phase 'reds'`, empty history, `lang` resolved to `'en'`, `voicePending === null` (the app itself never sets it — see F1).

| # | transcript | returned object | correct? |
|---|---|---|---|
| 1 | `"red"` | `{ kind:'pot', value:1, reds:1 }` | ✅ |
| 2 | `"two reds"` | `{ kind:'pot', value:1, reds:2 }` | ✅ (matches the 2-reds button semantics) |
| 3 | `"black"` | `{ kind:'pot', value:7, reds:1 }` | ✅ |
| 4 | `"5 points"` | `{ kind:'pot', value:5, reds:1 }` | ✅ blue; the foul check runs first but no foul word/shape matches |
| 5 | `"foul"` | `{ kind:'foul', pts:4, redAlsoPotted:false }` | ✅ |
| 6 | `"foul five and a red"` | `{ kind:'foul', pts:5, redAlsoPotted:true }` | ✅ (`andRed` matches `"and a red"`) |
| 7 | `"four away"` | `{ kind:'foul', pts:4, redAlsoPotted:false }` | ✅ |
| 8 | `"three away"` | `{ kind:'error', messageKey:'voiceFoulRange' }` | ✅ refuses an impossible 3-point foul; executor shows "Say a foul between 4 and 7 points" |
| 9 | `"end of visit"` | `{ kind:'endVisit' }` | ✅ |
| 10 | `"undo"` | `{ kind:'undo' }` | ✅ |
| 11 | `"new frame"` | `{ kind:'newFrame', needsConfirm:true }` | ✅ parse; ❌ the action can never run (F1/F3) |
| 12 | `"reset match"` | `{ kind:'resetMatch', needsConfirm:true }` | ✅ parse; ❌ same |
| 13 | `"player a concedes"` | `{ kind:'concede', who:null }` | ❌ **DEFECT D1** — should be `who:'A'`; executor answers "❓ Who concedes?" forever |
| 14 | `"player b concedes"` | `{ kind:'concede', who:'B' }` | ✅ (only works because the bare token `b` survives the filler filter) |
| 15 | `"i concede"` | `{ kind:'concede', who:null }` | ✅ by design (the board cannot know who "I" is; executor asks) |
| 16 | `"whose turn is it"` | `{ kind:'whoIsAtTable' }` | ✅ |
| 17 | `"help"` | `{ kind:'help' }` | ✅ |
| 18 | `"not blue, yellow"` | **`null`** | ❌ **DEFECT D2** — the code comment at `:2301` promises "leaves only yellow", the test at `voice_test.js:100` expects `{pot,2,1}` |
| 19 | `"no red"` | `null` | ✅ (nothing scores) — but see the test contradiction in (g) |
| 20 | `"banana"` | `null` | ✅ ignored, never guessed into a score |
| 21 | `"red black"` | `{ kind:'pot', value:1, reds:1 }` | ⚠️ see below |
| 22 | `红球` (zh) | `{ kind:'pot', value:1, reds:1 }` | ✅ |
| 23 | `两颗红球` (zh) | `{ kind:'pot', value:1, reds:2 }` | ✅ |
| 24 | `黑球` (zh) | `{ kind:'pot', value:7, reds:1 }` | ✅ |
| 25 | `犯规` (zh) | `{ kind:'foul', pts:4, redAlsoPotted:false }` | ✅ |
| 26 | `本轮结束` (zh) | `{ kind:'endVisit' }` | ✅ |
| 27 | `撤销` (zh) | `{ kind:'undo' }` | ✅ |
| 28 | `新一局` (zh) | `{ kind:'newFrame', needsConfirm:true }` | ✅ parse; ❌ same as #11 |
| 29 | `玩家a认输` (zh) | `{ kind:'concede', who:null }` | ❌ **DEFECT D1** (Chinese variant) |

Extra cases I traced because they expose the same root causes:

| transcript | returned | note |
|---|---|---|
| `"no pot"` | `null` | ❌ **D2** — `'no pot'` is a *documented* endVisit phrase (`:2138`) and is listed in the help, but `voiceDropNegated` deletes it before matching |
| `没进` (zh) | `null` | ❌ **D2** — documented at `:2179` and in the Chinese help string `:1075` (`'本轮结束 · 换人 · 没进'`), unreachable |
| `"yellow not blue"` | `{ kind:'pot', value:2, reds:1 }` | ✅ works because the negation is last |
| `"oh no"` | `null` | ✅ (`'oh'` → `VOICE_NUM_WORDS.oh === 0` → falls out with `return null`) |
| `"red black"` | `{ kind:'pot', value:1, reds:1 }` | ⚠️ |

**`"red black"` in detail (no double score):** the red check is deliberately ordered before the colours (`:2327-2330`), so the utterance returns a single red intent. `executeVoiceCommand` applies exactly that: `addPoints(state.turn, 1, 1)` → +1 and `reds 15→14`; the black is **silently discarded with no feedback** (the chip says `✅ Red to Player A`). So: **it cannot double-score and cannot score for the wrong player** (see (f)), but a user who says "red black" meaning red-then-black gets 1 point instead of 8 and no warning. Same class of silent truncation for any two-ball utterance ("two reds and a black", "black red"). Whether that is acceptable depends on the stated "at most one intent per utterance" contract (`:2270-2271`); it is at minimum a UX trap and is untested.

**No transcript in the set can double-score or score for the wrong player.** Every scoring branch funnels through `addPoints(state.turn, …)` (`:2393`) or `applyFoul` (which derives the opponent from `state.turn`, `:1881`), and `addPoints` (`:1636-1639`) re-checks `player !== state.turn` and returns. `voiceSessionHandled` (`:2629-2632`) also guarantees one command per listening session, so a duplicated `onresult` cannot score twice.

### How D1 happens (exact evidence)

`voiceFindPlayer` (`:2362-2377`) normalises the state names and the transcript, splits the transcript into **single whitespace tokens**, removes every token that appears in `playerKeyword`+`fillers`, and then asks whether a **whole alternative string** equals one of those tokens:

```js
const filler = pack.playerKeyword.concat(pack.fillers);
const tokens = voiceNormalize(transcript)
    .split(zhPack ? /[\s,，。；：]+/ : /\s+/)
    .filter(Boolean);
const cleaned = tokens.filter(token => filler.indexOf(token) === -1);

if (nameB && cleaned.indexOf(nameB) !== -1) return 'B';
if (nameA && cleaned.indexOf(nameA) !== -1) return 'A';
if (pack.playerOther.some(word => cleaned.indexOf(word) !== -1)) return 'B';
if (pack.playerSelf.some(word => cleaned.indexOf(word) !== -1)) return 'A';
return null;
```

- `playerSelf` is `['player a', 'player one', 'player 1', 'a', 'first player']` (`:2152`). Four of the five are multi-token strings that can never equal a single token; the fifth, `'a'`, is itself in `fillers` (`:2155` `fillers: ['please', 'the', 'a', 'an', …]`) so it is stripped from `cleaned` before the test. **The `playerSelf` branch is dead code.**
- `'player a concedes'` → tokens `['player','a','concedes']` → `'player'` ∈ `playerKeyword`, `'a'` ∈ `fillers` → `cleaned = ['concedes']` → `nameA` (`'player a'`) is not a token → `playerSelf` cannot match → **`null`**.
- `'a concedes'` → `cleaned = ['concedes']` → **`null`**.
- The default names are affected too: `nameA` normalises to `'player a'`, also multi-token, so with default names **only B can ever be identified**.
- Chinese: tokens are split on `/[\s,，。；：]+/`, and Chinese has no spaces, so `'玩家a认输'` is **one token**, which equals none of `playerSelf`'s entries (`:2191` `['玩家a','玩家一','玩家甲','a方','甲方','我']`) → **`null`**. Any Chinese phrase that embeds a name inside a longer utterance fails the same way (only a transcript that is *exactly* `我` would match).
- **Working case:** a single-token custom name (`'alice concedes'` → `nameA 'alice'` is a token → `'A'`), and `'player b concedes'` (the bare token `b` is in `playerOther` and is not a filler).

Executor consequence (`:2434`): `if (!intent.who) return voiceSayError('voiceNeedConceder');` — so "player a concedes" and 玩家a认输 produce "❓ Who concedes? Say a player name", and following that instruction with "player a" parses to `null` → "❓ 'player a'". The user is stuck in a loop. Only B (or a custom one-word name) can concede by voice.

### How D2 happens (exact evidence)

```js
:2261  function voiceNormalize(text) {
:2262      return String(text == null ? '' : text)
:2263          .toLowerCase()
:2264          .replace(/[!?;,.]/g, ' ')      // <-- the comma is destroyed here
...
:2302      text = voiceDropNegated(text, pack.negations);
```

```js
:2246  function voiceDropNegated(text, negations) {
:2247      const alternatives = negations.slice().sort((a, b) => b.length - a.length).map(voiceEscape).join('|');
...
:2256      const re = new RegExp(`(?:${boundary}(?:${alternatives})${boundary})${gap}[^,.;，。；]*`, 'g');
:2257      return text.replace(re, ' ');
:2258  }
```

The pattern is **greedy to the end of the string**: `[^,.;，。；]*` stops only at `,` `.` `;` `，` `。` `；` — and `voiceNormalize` has already replaced every `!?;,.` with a space *before* `voiceDropNegated` runs, so in practice the class is unbounded. Concretely for `"not blue, yellow"`: normalisation yields `"not blue yellow"`, the regex matches from `not` to the end, the result is `" "`, and `:2303 if (!text.trim()) return null;` returns **null**. Any negation therefore deletes the whole remainder of the utterance:

- `"not blue, yellow"` → `null` (should be yellow) — test `:100` fails.
- `"no pot"` → `null` (the phrase is in `endVisit` `:2138`).
- Chinese is worse: `ascii` is false so `gap` is `\\s*`, and `没` is a negation (`:2193`) while `没进` is a documented endVisit phrase (`:2179`) → `没进` → `null`. Same for any zh command containing 不/没/别.

The file's own comment at `:2301` documents the intended behaviour ("A negated word never scores: 'not blue, yellow' leaves only yellow") and it does not match the code. Fix direction: strip negated words as *tokens* rather than "word + everything after it", or bound the class with a token separator that survives normalisation.

---

## (f) EXECUTOR SAFETY

**Clean part (confirmed):** no branch of `executeVoiceCommand` (`:2386-2467`) writes to `state` directly. Every mutating branch delegates to an existing guarded action:

| intent | call | line |
|---|---|---|
| `pot` | `addPoints(state.turn, intent.value, intent.reds)` | `:2393` |
| `endVisit` | `takeShot()` (guarded by `canTakeShot()` first) | `:2397-2398` |
| `foul` | `applyFoul(intent.pts, intent.redAlsoPotted)` | `:2403` |
| `undo` | `undo()` (guarded by `state.history.length`) | `:2408` |
| `newFrame` | `onYes: runFrame` → `newFrame()` | `:2415` (dead — F1) |
| `resetMatch` | `onYes: runReset` → `resetMatch()` | `:2424` (dead — F1) |
| `concede` | `onYes: runConcede` → `concedeFrame(who)` | `:2436` (dead — F1) |
| `setLanguage` | `setLanguage(intent.lang)` | `:2445` |
| `whoIsAtTable` / `help` | read-only / `showVoiceHelp()` | `:2448-2453` |

`voiceSay`/`voiceSayError`/`voiceSayHeard`/`voiceSayUnknown`/`voiceSetChip` mutate only the module-local `voiceStatus` and DOM text — never `state`.

**`intent.who === null` is safe:** `:2434` guards it (`if (!intent.who) return voiceSayError('voiceNeedConceder');`), so `concedeFrame(null)` is unreachable from the voice path. (Latent robustness note only: `concedeFrame` itself has no validation — `:1608 const winner = conceder === 'A' ? 'B' : 'A';` would award the frame to A for any unexpected argument. No current caller can do that: the voice path is guarded, and `showConcedeDialog` passes `data-concede` ∈ {`A`,`B`}.)

### F1 — BLOCKING: the destructive actions are unreachable. `onYes` is never called.

```js
:2414  case 'newFrame': {
:2415      const runFrame = () => { newFrame(); voiceSay(t('voiceAppliedNewFrame')); };
:2416      voicePending = { kind: 'newFrame', needsConfirm: true, onYes: runFrame };
:2417      if (!voiceConfirm('voiceAskNewFrame', null, () => { voicePending = null; })) {
:2418          return voiceSay(t('voiceCancelled'));
:2419      }
:2420      return executeVoiceCommand(voicePending);
:2421  }
```
```js
:2458  case 'confirm':
:2459      return executeVoiceCommand(intent.intent);
```

`onYes` is written at `:2416`, `:2425`, `:2437` and **read nowhere** (grep: three matches, all assignments). The `confirm` case re-executes the *same* destructive intent, which parks itself again and calls `voiceConfirm` again instead of running the parked closure. In the live-mic path `voiceConfirm` always returns `false` (`:2483-2486`), so the sequence is:

1. Say "new frame" → `voicePending` parked with `runFrame`; `voiceConfirm` sets `voiceAwaitAnswer = true`, puts the prompt in the chip, returns `false`; the caller immediately overwrites the chip with `✋ Cancelled` (`:2418`).
2. `voiceHandleEnd` (`:2697-2700`) re-opens the microphone for the answer.
3. Say "yes" → parser returns `{kind:'confirm', intent: parked}` and clears `voicePending`.
4. Executor → `case 'confirm'` → `executeVoiceCommand(parked)` → `case 'newFrame'` → **parks a fresh `voicePending` and asks again**. `newFrame()` is never called; `voicePending` is not null at the end.

So a user can say "yes" forever and the frame never starts; `resetMatch` and `concede` behave identically. This is precisely the `executionAllowed()` the comment at `:2413` refers to, and it does not exist. Minimal fix: in `case 'confirm'`, run the parked callback — `const p = intent.intent; if (p && typeof p.onYes === 'function') return p.onYes();`.

This also explains failing test `voice_test.js:272` ("a spoken yes runs the command") and `:273` ("the pending confirmation is cleared").

### F2 — the overlay's YES button does nothing.

```js
:2506  function finish(approved) {
:2507      if (answered) return false;
:2508      answered = true;
:2509      if (overlay.parentNode) document.body.removeChild(overlay);
:2510      voiceConfirmInFlight = null;
:2511      voicePending = null;
:2512      if (!approved && typeof onCancel === 'function') onCancel();
:2513      return approved;
:2514  }
...
:2519  yesBtn.addEventListener('click', () => finish(true));
:2520  noBtn.addEventListener('click', () => finish(false));
```

`finish` returns the answer to an event listener that discards it (`() => finish(true)`), so `approved === true` has **no effect other than closing the overlay and destroying the parked intent** (`voicePending = null` at `:2511`). Tapping YES therefore guarantees the command will never run — even a subsequent spoken "yes" is dead, because `voicePending` was cleared. Fix: have `finish(true)` invoke the parked `onYes` (or a stored resume callback) instead of just returning.

### F3 — the `window.confirm` fallback always loses the intent.

```js
:2489  try {
...            // overlay built, Yes/No wired, voiceConfirmInFlight = finish
:2530      return false;
:2531  } catch (e) {
:2532      voicePending = null;
:2533      return !!(typeof window !== 'undefined' && window.confirm && window.confirm(prompt));
:2534  }
```

The catch nulls `voicePending` **before** returning the answer, but the caller relies on it afterwards:

```js
:2417      if (!voiceConfirm('voiceAskNewFrame', null, () => { voicePending = null; })) { return voiceSay(t('voiceCancelled')); }
:2420      return executeVoiceCommand(voicePending);         // <-- always null on the fallback path
```

`executeVoiceCommand(null)` returns `false` at `:2387`. So when the overlay cannot be built (which is *always* in the test harness, where `innerHTML` is never parsed into children) an accepted `confirm()` silently does nothing. Failure scenario: browser has no speech API, `window.confirm` returns true → user expects a new frame, gets nothing and no message. Fix: capture the intent (e.g. `const parked = voicePending;`) before clearing, or don't clear it in the catch, or make `voiceConfirm` responsible for running `onYes` when the dialog is accepted.

### F4 — the chip says "Cancelled" while it is still asking.

`:2485 voiceSetChip('result', prompt);` is immediately followed, in the caller, by `:2418 return voiceSay(t('voiceCancelled'));` on every destructive intent. So the user sees the question flash and then "✋ Cancelled" while the board is in fact waiting for "yes". Misleading feedback (medium severity, easy fix: don't overwrite the chip when `voiceAwaitAnswer` is true).

### F5 — the pot branch reports success without checking whether anything happened.

```js
:2391  case 'pot':
:2392      if (state.frameOver) return voiceSayError('voiceFrameOver');
:2393      addPoints(state.turn, intent.value, intent.reds);
:2394      return voiceSay(t('voiceAppliedPot', voicePotLabel(intent.value, intent.reds), atTable()));
```

`addPoints` (`:1636-1763`) returns `undefined` on **every** path, including all its refusals (`if (player !== state.turn) return;`, `if (!canPotReds(count)) return;`, `if (!canPotColor(parsed)) return;`). The state machine stays correct (no illegal score), but the chip claims success. Concrete scenario: at the start of a frame (no red potted) say "blue" → `canPotColor(5)` is false in phase `reds` with `redPottedThisVisit === false` → nothing is scored, yet the chip reads `✅ Blue to Player A`. Same for "two reds" when only one red is left. Fix: make `addPoints` return a boolean and branch the chip text on it. (The identical pattern exists for `foul`/`applyFoul`, but the parser pre-validates 4–7 and the frame-over case is checked first, so it is much less reachable.)

### F6 — minor: the concede prompt shows a letter, not a name.

`:2438 voiceConfirm('voiceAskConcede', who, …)` passes `'A'`/`'B'`, and `:2478 const question = t(questionKey, who ? who : '');` interpolates it into `` `${name} concedes the frame?` `` (`:1003`) → the user is asked **"A concedes the frame?"** while every other voice message uses the player's name (`atTable()`, `:2388`). Pass `state.nameA`/`state.nameB` instead.

---

## (g) TEST HARNESS / TEST FIDELITY

### Fixed during review (no longer a defect, but worth recording)

The revision I first read exported the internals with a **second, independent vm program**:

```js
// old test_harness.js
vm.runInContext(script, context);
vm.runInContext('globalThis.__board = { parseVoiceCommand, …, state, I18N };', context);
```

That could never work — a closed-over function scope is not visible to another Program in the same context (only the global object is, and the board never assigns to `window`/`globalThis`; the only `window.` uses are reads at `:1202`, `:2533`, `:2570`, `:2694`). `parseVoiceCommand` would be an unresolvable reference → `ReferenceError` out of `loadBoard` → **the entire suite (and `snooker_rules_test.js`, which uses the same harness) would die at the first `loadBoard` call with zero checks run.** The current harness fixes this correctly by injecting the export *inside* the IIFE:

```js
// test_harness.js:97-116
// The board is one IIFE, so its declarations are NOT reachable from a later vm program.
// The export line therefore has to be injected INSIDE the closure, just before it closes.
const injection = script.match(/\n(\s*)init\(\);\s*\}\)\(\);/);
script = script.replace(injection[0], `\n${injection[1]}init();\n${EXPORT}${injection[1]}})();`);
```
plus `:216-217 const board = context.__board; if (!board) throw new Error('The board script did not expose __board …');`.

Two consequences worth knowing: (i) the injection is tied to the exact shape `\n<indent>init();\n<indent>})();` at the end of the script — if the Lead adds any statement after `init();`, the harness will throw loudly (good) rather than silently mis-testing; (ii) `voice_parser_verify.js:288` still appends its `EXPORT_LINE` **after** `})();`, so that script's primary path has the same scope bug and can only work through its isolated-additive-block fallback (`:323`), where `state` is undefined — its concede cases would throw. I did not run it; flagging by reading only.

### Assertions that will FAIL, and why

**Genuine app defects surfacing as failures (fix the app):**

| test | line | expected | what actually happens |
|---|---|---|---|
| `'"player a concedes"'` | 86 | `{concede, who:'A'}` | `who:null` → defect **D1** |
| `'"a concedes"'` | 87 | `{concede, who:'A'}` | `who:null` → **D1** |
| `'"not blue, yellow" is yellow, never blue'` | 100 | `{pot,2,1}` | `null` → **D2** |
| `玩家a认输` | 116 | `{concede, who:'A'}` | `who:null` → **D1** (zh tokenising) |
| `'accepting starts the new frame'` | 197 | `A === 0` | **F3** — the catch nulls `voicePending`, then `executeVoiceCommand(null)` → still `1` |
| `'the new frame hands the break to the other player'` | 198 | `turn === 'B'` | consequence of F3 |
| `'15 reds are back'` | 199 | `reds === 15` | consequence of F3 |
| `'"reset match" clears the score'` | 206 | `A === 0` | **F3** |
| `'a concession ends the frame'` | 212 | `frameOver === true` | **F3** |
| `'the concession awards it to the opponent'` | 213 | `framesA === 1` | **F3** |
| `'the named player is the one who concedes'` | 219 | `framesB === 1` | **D1 + F3** |
| `'an accepted "new frame" runs through the gate'` | 256 | `turn === 'B'` | **F1** — `case 'confirm'` re-parks and re-asks |
| `'a spoken "yes" runs the command'` | 272 | `turn === 'B'` | **F1** |
| `'the pending confirmation is cleared'` | 273 | `null` | **F1** — the intent is re-parked, not consumed |
| `'with voice off, accepting runs the command'` | 300 | `turn === 'B'` | **F3** |

**Test-side problems the tests must fix (the app is behaving as designed / as written):**

| test | line | why it is a false failure |
|---|---|---|
| `'a foul gives 4 to the opponent'` | 159 | The test says `end of visit` first, which hands the table to B (`takeShot` → `handOverTo`, `:1558-1561`). The fouler is therefore B, so `applyFoul` awards 4 to **A** and hands back to A (`:1881`, `:1912`). The expectation `B === 4` contradicts the test's own setup. Same for `'a foul hands the table over'` (160, expects `'B'`, actual `'A'`). |
| `'"no red" is a command, not an answer'` | 244-245 | Internally inconsistent with line 101: the same transcript cannot be both `null` (101) and `{pot,1,1}` (244). With the current parser both are `null` because `voiceDropNegated` removes the whole string. The pending flag does not change that (`:2288-2298` only intercepts whole-utterance yes/no). |
| `'a spoken "no" leaves the frame alone'` | 283 | Passes, but vacuously: the test fires two `onresult` calls in one session and `voiceHandleResult` drops the second (`:2629 if (!finalText || voiceSessionHandled) return;`). The `'no'` is never parsed. |
| `'the pending confirmation is cleared'` (after "no") | 284 | Fails for the same reason: the `'no'` never reached the parser, so `voicePending` is still parked. With `engine.onend()` between the two utterances (`voiceHandleEnd` → `voiceAwaitAnswer` → `startVoiceListening`, `:2697-2700`) it would parse and pass. |
| `'the chip shows the unrecognised transcript'` | 336-337 | Two harness/test-side reasons: (i) the test now correctly calls `setVoiceMuted(false)`, but `updateVoiceChip` prefers the listening branch — `:2581 } else if (voiceListening) { text = t('voiceListening'); …` — and the session is still open because the test never calls `engine.onend()`; (ii) `voiceSayUnknown` *has* written the transcript into `voiceStatus.text`, it is just outranked. Call `engine.onend()` before asserting (or prefer `voiceStatus.text` for the `result`/`error` states). |
| `'after 15 reds the colours stage begins'` | 366 | The test taps the same red button 15 times (`for (let i = 0; i < 15; i += 1) b.clickBall('A', 1);`). `canPotReds` refuses a second consecutive red while `redPottedThisVisit` is true (`:1252-1258`, `if (state.redPottedThisVisit) return false;`), so only the first tap applies: `reds === 14`, phase stays `'reds'`. The app is right; the loop must interleave colours. |
| `'any colour is legal in last-red'` | 370 | Consequence of the same loop: the frame never reaches `last-red`, so the black is potted in the red phase and phase stays `'reds'`. |

**False greens the Lead should not trust:**

1. **The overlay path is never exercised.** The stub's `createElement` stores `innerHTML` as a plain string and `querySelector` only walks real `children` (`test_harness.js` `_find`), so `overlay.querySelector('#voiceYesBtn')` returns `null`, `:2518` throws `'voice confirm overlay is incomplete'`, and `voiceConfirm` falls through to `window.confirm` (`:2533`) — a path a real browser never takes, because there the buttons exist and `return false` is reached instead. Tests 182-228 and 287-301 therefore pass while testing the *fallback*, not the shipped overlay. (`showVoiceHelp` survives the same stub because it null-guards its close button — `if (closeBtn) …`.)
2. **`confirmed === 1` proves nothing about the browser.** Because of (1), `'"new frame" asks before it runs'` (187) and `'"new frame" asks'` (196) count `window.confirm` calls; in Chrome/Edge the same utterance never calls `window.confirm` at all.
3. **`'declining changes nothing'` / `'the pending confirmation does not linger'`** (188, 294) pass partly because the catch *destroys* `voicePending` (F3) — they would need re-checking once F3 is fixed.
4. **`engine.onresult` is invoked directly**, so no test proves the board actually started listening. `FakeRecognition` counts `started`/`stopped`/`aborted` (`test_harness.js`), but no assertion checks `engine.started`. Test 316 (`'a final result applies one command'`) would "pass" even if the mic were never started.
5. **`'the button grid refuses a pot by the player not at the table'`** (378) passes for the wrong reason: the stub's `click()` dispatches the listener even for a `disabled` button (a real browser would not fire it). The app's own turn guard inside `addPoints` is what refuses the pot, so the assertion is not testing the disabled attribute.
6. No test covers the `voiceHelpNoteLabel` help sheet, the chime, `toggleVoiceMute`, `stopVoiceListening`, the `no-speech`/`aborted` error paths, or the second-utterance-in-one-session rule for a *destructive* command (only for pot).

---

## (h) WHAT I COULD NOT DETERMINE STATICALLY

1. **Nothing was executed.** No JS engine, no parser, no test runner, no `node`. So: whole-file brace/paren/bracket balance, the exact set of parse errors (there should be none), every regex's runtime behaviour, and every test outcome are **hand-derived**. The transcript table in (e) is a careful manual trace; a single runtime `node voice_test.js` would confirm or refute the whole (g) list in seconds once the shell works.
2. **The file was changing while I read it** (I saw three revisions; `init();` moved 2902 → 2932, `voice_test.js` 325 → 355 → 401 lines). Anything I cite may already be edited. Locate findings by quoted code, not by line number.
3. **Browser-only behaviour** I cannot observe: whether Chrome/Edge fires `onend` promptly after a final result (this is load-bearing for the "re-open the mic for the answer" design and for F1's usability), whether repeated `recognition.start()` calls are throttled/`InvalidStateError`, and whether the `window.confirm` fallback path is ever reachable in a real browser.
4. **`voice_parser_verify.js`** — I read only parts (its export/scope handling and sandbox). I did not verify whether its fallback actually runs, so my remark about `state` being undefined there is a reading-based inference, not a verified failure.
5. **Intent vs. contract questions I cannot settle by reading:** whether dropping the second ball in `"red black"` is acceptable under the "one intent per utterance" design, and whether the chip should show the heard transcript or "Listening…" while a session is open. Both are reported as consequences, not as clear-cut bugs.

---

## VERDICT

**Nothing is wrong with the syntax or the module structure** — no parse errors, no TDZ hazard, no undefined or duplicated identifier, no i18n gap, and the executor's discipline (every mutation through a guarded action, never touching `state` directly) is genuinely good. The harness's fatal scope bug was fixed by the Lead mid-review.

**What is genuinely broken:**

1. **F1 (blocking):** `onYes` is dead code and `case 'confirm'` re-asks instead of acting, so **no destructive voice command can ever run** — "new frame", "reset match" and "concede" are unreachable by voice, and "yes" loops forever. This is the single highest-value fix.
2. **F3:** the `window.confirm` fallback clears the parked intent before using it, so an accepted dialog does nothing.
3. **F2:** tapping YES in the confirmation overlay does nothing (and destroys the pending intent).
4. **D1:** `voiceFindPlayer`'s token matching makes `"player a concedes"`, `"a concedes"` and `玩家a认输` identify nobody; with default names, only B can concede by voice.
5. **D2:** `voiceDropNegated` deletes everything after a negation, so `"not blue, yellow"` → `null` and the documented `"no pot"` / `没进` commands are unreachable.
6. **F5/F4/F6:** the pot branch claims success when the guarded action refused; the chip says "Cancelled" while still asking; the concede prompt shows a letter instead of a name.
7. **Test suite:** with the harness fixed, **22 assertions fail — 15 of them for real app defects** (86, 87, 100, 116, 197, 198, 199, 206, 212, 213, 219, 256, 272, 273, 300) **and 7 for test-authoring reasons** (159, 160, 244, 284, 336-337, 366, 370), plus one vacuous pass (283) and the false greens in (g) that should be tightened before anyone trusts a green run.
