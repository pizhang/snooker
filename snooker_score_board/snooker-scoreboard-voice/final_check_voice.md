# Static check of the four just-landed voice changes (v1.6.0)

**I executed nothing.** No shell, no Node, no browser, no test harness. This workspace's `pwsh` is
blocked (`SetNamedSecurityInfoW failed (Win32 5)`), and this session is a read-only review. Every
statement below is a hand trace of the source as read through the file/grep tools. Line numbers are
from `snooker_scoreboard.html` at the revision I read (3019 lines, voice block 2091–2893).
`final_check_voice.md` is the only file I created; the HTML was not modified.

Everything below is conditional on the file being syntactically valid. I read the whole voice block
(2091–2893) line by line and saw no unbalanced construct, but I did not run a parser (see §6).

Scenario state used for the confirm traces (chosen so that "the action ran" is observable):

```
A=10, B=5, turn='A', breaker='A', framesA=0, framesB=0, reds=10, phase='reds',
frameOver=false, redPottedThisVisit=false, colorsPotted=[false×6], history=[1 entry]
nameA='Player A', nameB='Player B', lang='en'
voicePending=null, voiceConfirmInFlight=null, voiceAwaitAnswer=false
voiceMuted=false, voiceSupported=true, voiceListening=true   (mic-live cases)
```
Would-have-run markers: `newFrame()` → framesA=1, A=B=0, breaker/turn='B', reds=15, history=[];
`concedeFrame('A')` → framesB=1, frameOver=true, phase='over'; `resetMatch()` → all zeroed (and it
first raises its own `confirm()` because history is non-empty, :1988-1990).

---

## 1. Item 1 — `voiceDropNegated(text, negations, clauseBreaks)` (:2251-2283)

### 1.1 The two regexes exactly as constructed

Both packs take the same path (:2252-2274). Escaping (`voiceEscape`, :2216) touches only
`. * + ? ^ $ { } ( ) | [ ] \` — spaces and the apostrophe survive untouched.

**en** — `negations` = `["don't","dont","do not","not","no","never"]`, sorted by length desc
(stable): `do not | don't | never | dont | not | no`.
`clauseBreaks` = `[' but ',' then ',' and then ']`; every one of them is letters+spaces, so
`/^[a-z ]+$/i` (:2260) puts all three in `spaced` and none in `tight`. The spaces are **kept**
(:2260 is a filter only, `.map(voiceEscape)` does not trim), and :2264 wraps them in `\s+` as well.
`ascii` = true → `boundary='\b'`, `gap='\s+'` (:2268-2270).

```
re(en) = /(?:\b(?:do not|don't|never|dont|not|no)\b)\s+[\s,，]*[\s\S]*?(\s+(?: and then | then | but )\s+)/i
```

**zh** — `negations` = `['不要','别','没有','没','不']` → sorted `不要 | 没有 | 别 | 没 | 不`.
`clauseBreaks` = `['，','。','但','然后','而且']`; `/^[a-z ]+$/i` is false for all five → all in
`tight`; `spaced` empty. `ascii` false → `boundary=''`, `gap='\s*'`.

```
re(zh) = /(?:(?:不要|没有|别|没|不))\s*[\s,，]*[\s\S]*?((?:，|。|但|然后|而且))/i
```

`tail` (:2266) has **no `?`** — the clause break is mandatory.

Note the pipeline point that governs everything: `parseVoiceCommand` calls `voiceNormalize` first
(:2299), which replaces `[!?;,]` with a space and then collapses `\s+` to a single space (:2288-2290),
and for a Chinese transcript `text.replace(/[\s,，。！？、；：]/g,'')` (:2304). So by the time
`voiceDropNegated` runs, **there is never a double space in `text`**.

### 1.2 The decisive observation

`re(en)`'s tail expands to `\s+` + `' and then '`/`' then '`/`' but '` + `\s+`. The alternatives
already begin and end with a space, so the pattern requires **two** whitespace characters on each
side of the keyword. `voiceNormalize` guarantees exactly one. Therefore, through
`parseVoiceCommand`, **the en branch of `voiceDropNegated` can never match anything** — it is a
provable no-op for every English transcript (the only way to make it match is to call it directly
with hand-doubled spaces, §1.5-contrast).

The zh branch is different: its alternatives (`但/然后/而且`) carry no spaces, so the tail matches
whenever one of those characters appears. It does *not* match when the negated clause is the last /
only clause, because the tail is mandatory.

### 1.3 Per-transcript trace (exact strings)

"after normalize" is what `parseVoiceCommand` hands to `voiceDropNegated`; "after dropNegated" is the
exact string the function returns; "parse" is the final `parseVoiceCommand` result.

| # | transcript | after normalize (+ zh strip) | after `voiceDropNegated` | final parse | expected | verdict |
|---|---|---|---|---|---|---|
| en-1 | `not blue, yellow` | `not blue yellow` | `not blue yellow` (unchanged) | `{kind:'pot', value:2, reds:1}` | pot 2 | ✅ number right, **reason wrong** |
| en-2 | `not blue then yellow` | `not blue then yellow` | `not blue then yellow` (unchanged) | `{kind:'pot', value:2, reds:1}` | pot 2 | ✅ number right, **reason wrong** |
| en-3 | `not red but black` | `not red but black` | `not red but black` (unchanged) | `{kind:'pot', value:1, reds:1}` | pot 7 | ❌ **D1** negated red scores, black lost |
| en-4 | `not black` | `not black` | `not black` (unchanged) | `{kind:'pot', value:7, reds:1}` | null | ❌ **D2** negated black scores 7 |
| en-5 | `no red` | `no red` | `no red` (unchanged) | `{kind:'pot', value:1, reds:1}` | null | ❌ **D2** negated red scores 1 |
| en-6 | `oh no` | `oh no` | `oh no` (unchanged) | `null` | null | ✅ (but only because `voiceAnyNumber` reads `oh`→0 at :2233/:2361-2366) |
| en-7 | `don't pot the black` | `don't pot the black` | `don't pot the black` (unchanged) | `{kind:'pot', value:7, reds:1}` | null | ❌ **D2** negated black scores 7 |
| en-8 | `never mind the black` | `never mind the black` | `never mind the black` (unchanged) | `{kind:'pot', value:7, reds:1}` | null | ❌ **D2** negated black scores 7 |
| zh-1 | `不要打黑球` | `不要打黑球` | `不要打黑球` (unchanged) | `{kind:'pot', value:7, reds:1}` | null | ❌ **D2** (zh, no clause break) |
| zh-2 | `别打黑球` | `别打黑球` | `别打黑球` (unchanged) | `{kind:'pot', value:7, reds:1}` | null | ❌ **D2** (zh, no clause break) |
| zh-3 | `不 红球` | `不红球` (space stripped at :2304) | `不红球` (unchanged) | `{kind:'pot', value:1, reds:1}` | null | ❌ **D2** (zh, no clause break; `redSingular` at :2355) |
| zh-4 | `红球然后黑球` | `红球然后黑球` | `红球然后黑球` (unchanged — no negation present at all) | `{kind:'pot', value:1, reds:1}` | (not stated) | ✅ pot red; `redSingular` (:2355) is checked before colours (:2357); the black is silently dropped by the one-intent contract |

Why en-1/en-2 only *look* correct: nothing was stripped. `blue` is still in the text; the colour
scan at :2357 is `[2,3,4,5,6,7].find(...)`, i.e. **ascending value**, so `yellow`(2) is reached before
`blue`(5) and wins the race. Falsifying counterexamples (same code path, not in the requested list):

* `not blue` → unchanged → `colored` finds `blue` → `{kind:'pot', value:5, reds:1}` — the negated
  ball scores 5.
* `no pink` → `{kind:'pot', value:6, reds:1}`.
* `not yellow then blue` → unchanged → `colored` finds `yellow` first → `{kind:'pot', value:2, reds:1}`
  — the **negated** ball scores, *even though a clause break is present*. So the "later clause
  survives" premise fails in the opposite direction too.
* zh, with a break: `不打红球然后黑球` → re(zh) matches `不打红球然后` and the callback returns the
  captured `然后`, so the returned string is `然后黑球` → `{kind:'pot', value:7, reds:1}`. The zh
  mechanism does work when a break exists; the en one cannot ever fire.

### 1.4 The three direct questions

* **`args.slice(1, args.length - 2)`** — **correct**. `String.prototype.replace(re, fn)` calls `fn`
  with `(match, p1…pN, offset, string)` (plus a named-groups object only if the regex has named
  groups; it does not). Here N=1 (`tail`), so `args.length = 4` and `slice(1,2)` is exactly
  `[p1]`. In the degenerate `parts.length === 0` case (`tail === ''`, no group at all)
  `args.length = 3` and `slice(1,1) === []`, so `groups.find(...)` is `undefined` and the callback
  returns `' '` — still well defined. `groups.find(g => g) || ' '` also correctly tolerates an empty
  capture (`''`), though an empty capture cannot occur because the mandatory tail is non-empty.
* **`boundary`/`gap` declared before use** — **yes**: `boundary` :2269, `gap` :2270, both consumed by
  the `new RegExp` at :2271-2274. `parts` :2263 and `tail` :2266 are likewise declared before use.
  No TDZ issue.
* **Later clause wrongly killed / negated ball still scoring** — both, see en-3 (later clause lost to
  the negated `red` at the `redSingular` check), en-4/5/7/8 and zh-1/2/3 (negated ball scores), plus
  the four counterexamples above.

### 1.5 Contrast that isolates the cause (hand trace, not executed)

Calling the function directly with doubled spaces — the only input shape the en tail accepts —
`voiceDropNegated("not yellow  then  blue", en…)`: `\s+` takes one space, `' then '` takes the second
plus `then` plus one of the following spaces, the final `\s+` takes the last one; group 1 is
`"  then  "`; the replacement yields `"  then  blue"` → collapse/trim → `"then blue"` → pot 5 (blue).
So the logic is right and the *literal* `\s+(?: and then | then | but )\s+` (spaces inside the
alternatives **and** `\s+` around them) is the whole bug. `voiceNormalize`'s `\s+ → ' '` (:2290) makes
that input unreachable in the real pipeline.

*Fix directions (not implemented, not verified — and a one-line fix is not enough):*
(1) drop the spaces inside the en alternatives, i.e. `\s+(?:and then|then|but)\s+`;
(2) the mandatory `tail` still breaks every "negation with no later clause" case (`not black`,
`no red`, `don't pot the black`, `never mind the black`, all three zh cases) — those need an explicit
fallback. Making `tail` optional is *not* sufficient on its own: with `(…)?` the lazy
`[\s\S]*?` prefers the empty tail, so `not red but black` would strip only `not ` and still return
pot red, and `not blue, yellow` (comma already gone) would strip to nothing → `null` — which the
Lead's table calls pot 2 (the older harness `voice_parser_verify.js:468-480` accepted value 2 **or**
null). A token-based rule ("remove the negated ball noun, keep the rest; if the whole utterance was
negated, return '' so :2327 returns null") satisfies all eight en rows at once.

---

## 2. Item 2 — `voiceFindPlayer` (:2388-2410) + `voiceSaysPhrase` (:2415-2422)

**They agree.** `voiceFindPlayer` builds `normalized` once, `tokens = normalized.split(...)` once,
`haystack = ' ' + normalized + ' '` once, and funnels *every* candidate (custom names and the four
label lists) through the single closure `says = phrases => voiceSaysPhrase(phrases, haystack, tokens)`
(:2393) — argument order matches the signature `voiceSaysPhrase(phrases, haystack, tokens)`. There is
no second, divergent matcher. The single-word vs multi-word rule lives only in :2419-2420.

**Call site is the post-negation text and `zhPack`** — `:2373`
`return { kind: 'concede', who: voiceFindPlayer(text, zhPack) };`. `text` is the variable reassigned
by `voiceDropNegated` at :2326 (and already zh-stripped at :2304), not `raw`; `zhPack` is the boolean
from :2302. The prompt name is also right: `voiceAsk('voiceAskConcede', voiceNameOf(intent.who), …)`
(:2486) with `voiceNameOf` :2430-2432 → "Player A concedes the frame?" (:1004).

**Real zh defect found here (D3).** :2304 deletes **all whitespace** from a Chinese transcript before
`voiceFindPlayer` runs, and :2419-2420 can only match a space-free phrase via
`tokens.indexOf(clean)` or `haystack.indexOf(' ' + clean + ' ')`. For `玩家a认输`:

* `normalized = 玩家a认输`, `tokens = ['玩家a认输']` (the split class `/[\s,，。；：]+/` finds nothing),
  `haystack = ' 玩家a认输 '`.
* custom name: `state.nameA = '玩家 A'` → `voiceNormalize` → `玩家 a` → contains a space → multi-word
  branch → `haystack.indexOf(' 玩家 a ')` → `-1`.
* label `玩家a` → no space → `tokens.indexOf('玩家a')` → `-1` **and** `haystack.indexOf(' 玩家a ')`
  → `-1` (the required trailing space was stripped). Same for `玩家一/玩家甲/a方/甲方/我` and all of
  `playerOther`.

→ `voiceFindPlayer` returns `null` for a contiguous zh concede utterance, so :2485 fires
`voiceSayError('voiceNeedConceder')` and zh users can never concede by voice (the 🏳️ button still
works). This is deterministic: any spacing the recogniser inserts is removed at :2304 before the
matcher sees it. It contradicts `voice_parser_verify.js:551` (`who.zh-a` expects `'A'`) and the code
comment at :2412-2414. English is unaffected: `player a concedes` → `tokens=['player','a','concedes']`,
label `player a` contains a space → `haystack.indexOf(' player a ')` matches → `who='A'`.

Minor observation: `pack` (:2297) follows `langOverride` while `zhPack` (:2302) follows the script,
so a Han transcript with `lang==='en'` is parsed with the en vocabulary but identified with the zh
labels. Rarely reachable (the en action lists contain no Han words), noted for completeness.

---

## 3. Item 3 — the confirm gate, all nine traces

Code under test: park `voiceAsk` :2523-2542, `voiceRunPending` :2545-2550, `voiceConfirm`
:2553-2607, dispatch `case 'newFrame'/'resetMatch'/'concede'` :2471-2489 and `case 'confirm'`
:2505-2506, pending branch :2312-2323, routing :2708-2719, mic re-open :2774-2777.

**The structural problem (D4, and the reason 4 of the 9 traces fail).** The three destructive cases
*always* call `voiceAsk`, and both approval helpers re-dispatch the parked intent through
`executeVoiceCommand` (`voiceRunPending` :2549, and the caller tail :2475/2481/2489). Since the parked
intent keeps its kind (`{kind:'newFrame',…}` / `{kind:'concede',…}`), `case 'newFrame'` /
`case 'concede'` runs again and calls `voiceAsk` **again**. Nothing records that the confirmation
already happened: `needsConfirm` appears at :2371/:2372/:2472/:2478 and is never read by
`executeVoiceCommand`; there is no `confirmed` flag, and grep shows no other consumer of
`voicePending`. So the gate re-arms itself on every approval, and `newFrame()` / `resetMatch()` /
`concedeFrame()` are never reached from the voice path at all (they are only reachable from the
buttons :2968-2970 and the keyboard :2987-2988).

| case | how the ask was entered | user answer | action runs? | cancelled? | `voicePending` at the end | state change |
|---|---|---|---|---|---|---|
| a | mic live → park (mic branch) | spoken "yes" | **no** — "yes" re-parks and re-asks | no (only the chip *says* Cancelled) | `{kind:'newFrame',needsConfirm:true}` | none |
| b | mic live → park | spoken "no" | no | **yes** (:2319→:2502-2503) | `null` | none |
| c | overlay (mic off) | tap YES | **no** — re-parks and opens a **second** identical overlay | no | `{kind:'newFrame',needsConfirm:true}` | none |
| d | overlay | tap NO | no | **yes** (:2582-2583) | `null` | none |
| e | overlay | tap backdrop | no | **yes** (same `finish(false)`, :2593-2595) | `null` | none |
| f | overlay impossible → `window.confirm` | confirm() true | **no** — re-asks recursively | no | stale park (never cleared) | none; unbounded recursion |
| g | overlay impossible → `window.confirm` | confirm() false | no | **yes** (chip) | **stale park left set** (D5) | none |
| h | mic live → park, then unrelated command | "red" | parked action discarded silently | implicitly yes (:2322) | `null` | red potted: A 10→11, reds 10→9, `redPottedThisVisit=true` |
| i | mic live → park (`who='A'`) | spoken "yes" | **no** — same re-ask loop as (a) | no | `{kind:'concede',who:'A'}` | none (`frameOver` stays false, framesB stays 0) |

Per-trace detail:

**(a)** `new frame` → :2371 intent → :2471 case → `voiceAsk` → :2527 condition true (listening) →
:2524 parks, :2529 `voiceAwaitAnswer=true`, :2530 chip = "Start a new frame? Confirm?"; :2531
`voiceConfirmInFlight` is `null` → returns **false** → :2473 `voiceSay('✋ Cancelled')` overwrites the
question, so the user never sees it. `newFrame()` is not called: A stays 10, framesA stays 0.
For the caller this `false` means "not approved", but the action is *still parked* — the return value
conflates "waiting for a spoken answer" with "cancelled" (D6). On `onend`, :2774-2777 sees
`voiceAwaitAnswer` and re-opens the mic. Then `yes` → :2313-2317 snapshots the pending and clears it →
`{kind:'confirm', intent:{kind:'newFrame'}}` → :2506 `executeVoiceCommand(intent.intent)` →
:2471 `case 'newFrame'` → `voiceAsk` again → mic branch again (the answer session is still
`voiceListening === true` at routing time; `voiceAwaitAnswer` was reset at :2775) → parks again,
returns false → chip "✋ Cancelled" again. **The frame is never started and the question repeats
forever.** No double execution (the tail at :2475 is unreachable because the `if` body returns).

**(b)** as (a) up to the park, then `no` → :2318-2321 clears the pending and returns
`{kind:'cancel'}` → :2502-2503 chip "✋ Cancelled". Exactly one outcome: cancel, no state change.
A later "yes" is not intercepted (`voicePending === null`) and parses to `null` → unknown.

**(c)** ask with the mic off: :2527 false → :2541 `voiceConfirm` → overlay built and appended
(:2558-2571), `finish` defined (:2574), listeners bound (:2591-2595), `voiceConfirmInFlight = finish`
(:2598), chip = prompt (:2599), returns false (:2602) → the caller immediately overwrites the chip
with "✋ Cancelled" again (the prompt is visible in the overlay, not the chip). Tap YES → `finish(true)`
→ `answered=true`, overlay removed, `voiceConfirmInFlight=null` (:2574-2578) → `voiceRunPending()`
(:2580) → clears `voicePending` (:2546-2547) → `executeVoiceCommand({kind:'newFrame'})` → :2471
`case 'newFrame'` → `voiceAsk` → mic condition false (muted) → `voiceConfirm` → **a second identical
overlay is created** and `voiceConfirmInFlight = finish2`, returns false → chip "✋ Cancelled". So YES
never applies the frame and every YES opens another dialog. `voicePending` ends up parked again.
No double execution: `voiceRunPending` clears before executing and `answered` guards the rest.

**(d)** `finish(false)` → overlay removed, `voiceConfirmInFlight=null`, :2582 `voicePending = null`,
:2583 chip "✋ Cancelled". Exactly cancel; the action can never run later because the only reference to
it lived in `voicePending`.

**(e)** identical to (d): the backdrop listener (:2593-2595) is `if (e.target === overlay) finish(false)`.
(A click on the box but not on a button is `e.target !== overlay` → nothing happens; the dialog stays.)

**(f)** `voiceConfirm`'s `try` throws (stipulated) → :2603-2606 catch → `window.confirm(prompt)`
returns true → `voiceAsk` returns **true** → the case tail :2475 `executeVoiceCommand(voicePending)`
→ :2471 `case 'newFrame'` → `voiceAsk` → :2524 re-parks (a fresh object) → `voiceConfirm` → throws →
`window.confirm(prompt)` **again** → true → tail again → … Each level re-parks and re-confirms; no
level ever reaches `newFrame()`, so the action still never runs and `voicePending` is never cleared.
Practically the user sees the same confirm box repeatedly; a single Cancel at any depth returns false
for that level and unwinds the whole chain (each outer level just returns that `false`), leaving the
chip "✋ Cancelled". If the user keeps accepting, the recursion is unbounded (no TCO in browsers) and
eventually raises `RangeError: Maximum call stack size exceeded` out of `voiceHandleResult`. Note also
that a throw *after* `appendChild` (the `!yesBtn || !noBtn` check at :2590, before the listeners are
attached) would leave an inert `foul-overlay` in the DOM that nothing ever removes, because
`voiceConfirmInFlight` was not set.

**(g)** catch → `window.confirm` false → :2605 returns false → `voiceAsk` false → caller chip
"✋ Cancelled". Exactly cancel, no state change — **but `voicePending` is left set**, because
`voiceAsk` parked it at :2524 and neither the catch nor the caller clears it (D5). Failure scenario: a
later stray "yes" is consumed by the pending branch (:2313-2317) and re-enters the destructive case →
`voiceAsk` → another `window.confirm` ("Start a new frame? Confirm?" long after the user cancelled);
a later "no" prints "✋ Cancelled" for nothing. The action still cannot run.

**(h)** the park leaves `voiceAwaitAnswer=true`, so the mic re-opens after `new frame` even before the
answer. `red` → :2712 `voiceConfirmInFlight` is null → :2312 pending branch: `red` is in neither
yes-no list → :2322 `voicePending = null` → normal parse → :2355 `{kind:'pot', value:1, reds:1}` →
:2444 `canPotReds(1)` true → :2448 `addPoints('A',1,1)` → :1681 A 10→11, reds 10→9, flag true → :2449
`11 !== 10` so no false refusal → chip "✅ Red to Player A". Exactly one thing happens; the parked
`newFrame` is discarded **silently** (no "cancelled" feedback) — the pending branch clears it before
it knows whether the utterance is a command or garbage. No double run, no state corruption.

**(i)** `player a concedes` → :2373 `voiceFindPlayer` → `who='A'` (name `Player A` → `player a`, or the
`playerSelf` label; both paths find `' player a '` in `' player a concedes '`) → :2483-2489 → `who`
truthy → `voiceAsk('voiceAskConcede','Player A',{kind:'concede',who:'A'})` → mic branch → park + chip
overwritten with "✋ Cancelled". State: framesB=0, `frameOver=false`. Then `yes` → confirm → :2506 →
:2483 `case 'concede'` → `frameOver` false, `who` truthy → `voiceAsk` again → park + "✋ Cancelled".
`concedeFrame('A')` is never called, so framesB stays 0 and `frameOver` stays false. Same loop as (a).

**Double-execution analysis (explicitly requested).** No path runs the parked action twice, and no
path runs it after a NO:

* `finish(true)` → `voiceRunPending()` clears `voicePending` *before* `executeVoiceCommand` (:2546-2549),
  and `answered` (:2575) makes a second `finish` on the same overlay a no-op, so the yes-button and
  the backdrop cannot both apply the same parked object. `finish(false)` likewise.
* The caller's tail (:2475/2481/2489) is reached **only** when `voiceAsk` returns true, and the only
  true return is the `window.confirm` fallback (:2605), where no overlay and no `finish` exists. So
  "finish(true) *and* the tail" cannot co-occur. (Because the tail re-dispatches through the gate, it
  would not double-apply even if it did: the gate intercepts before any state change.)
* At most one overlay exists at a time: a new ask closes the previous one through
  `voiceConfirmInFlight(false)` (:2533) or `voiceRouteTranscript` (:2712), and `finish` removes its
  own overlay first. So no stale `finish` can fire after a NO.
* NO paths clear `voicePending` ((b) :2319, (d)/(e) :2582, (h) :2322), and the parked object is
  reachable only through `voicePending`; `case 'confirm'` snapshots the intent only on a yes. So
  "runs after NO" is impossible.
* The *real* abnormality is the opposite of double execution: **the action never runs at all**
  (D4) — the only observable effects of YES are another dialog / another park, and the only observable
  effect of the initial park is a chip that says "✋ Cancelled".

**Reachability caveat for (c)-(g).** With `voiceMuted` true no transcript is ever routed
(`startVoiceListening` returns at :2740; `voiceHandleResult` needs an active session), and with the
mic live `voiceAsk` always takes the mic branch, so the overlay/`confirm()` branch is reachable in
practice only through a race (the user mutes while a final result is already in flight) or by calling
`executeVoiceCommand` directly. The traces above hold however the ask was entered.

---

## 4. Item 4 — `case 'pot'` (:2439-2451)

* **The pre-check cannot refuse a legal pot.** :2443-2445 calls exactly the guards `addPoints` will
  call with the same arguments (`canPotReds(count)` :1254-1260, `canPotColor(value)` :1266-1303, used
  again at :1656-1660), and nothing mutates `state` in between. So `allowed === false` implies
  `addPoints` would also return without scoring, and `allowed === true` implies `addPoints` proceeds.
  The only "legal pot" definition available here *is* those guards, so no false refusal.
* **The re-check cannot misreport a legal pot.** :2447 reads `before = state[state.turn]`, :2448 calls
  `addPoints(state.turn, …)`, :2449 compares. `delta` in `addPoints` is always ≥ 1 for anything that
  passes validation: reds → `count = Math.max(1, parseInt(redCount,10) || 1)` (:1652) so ≥ 1; colours
  → `parsed ∈ [2,7]` (:1659) so ≥ 2. `state[player] += delta` at :1681 is unconditional once
  validation passes, and the only path that adds and then subtracts again (the `nextIdx !== colorIndex`
  branch at :1718-1724) is unreachable when `canPotColor` passed: phase `colors` requires
  `value === getNextColorValue()` (so `nextIdx === colorIndex`), and phase `respotted-black` requires
  `value === 7`, where `startRespottedBlack` sets `colorsPotted=[T,T,T,T,T,F]` (:1308) so
  `getNextColorIndex() === 5 === getColorIndex(7)`. Therefore **there is no legal pot that leaves
  `state[state.turn]` unchanged** — not a 0-point pot, not the two-red pot:
  `canPotReds(2)` needs `state.reds >= 2` (:1257), then `count=2`, `delta=2`, so a two-red pot moves
  the score by 2 and `2 !== before` (:2449 passes). Also `addPoints` never assigns `state.turn`, so
  both reads of `state[state.turn]` are the same player (a turn change would have been the only way to
  compare two different players' scores). The pre-check/re-check are redundant but harmless.
* Consequence: **Item 4 checks out**; a legal pot is reported as applied, and a refused pot is
  reported as refused.

---

## 5. Defect list (only verified-by-reading items)

| id | severity | defect | evidence | failure scenario |
|---|---|---|---|---|
| **D4** | high | An approved destructive voice command **never executes**. The parked intent keeps its kind, and every approval path re-dispatches it through `executeVoiceCommand`, which re-enters the same `voiceAsk` gate. Nothing marks the intent as already confirmed (`needsConfirm` is written at :2371/:2372/:2472/:2478 and never read; no `confirmed` flag; `voicePending` has no other consumer). | :2471-2489, :2505-2506, :2545-2550, :2523-2542; grep of `needsConfirm`/`voicePending` | Say "new frame" then "yes" (mic live): the frame is not started and the question repeats indefinitely; tap YES on the dialog: a second identical dialog appears and the frame is still not started. "player a concedes" then "yes" likewise never concedes. `newFrame()`/`resetMatch()`/`concedeFrame()` remain reachable only from the buttons :2968-2970 and keys :2987-2988, so the *board* is not broken, only the voice-driven destructive commands. |
| **D1** | high | The en branch of `voiceDropNegated` is a no-op: `\s+` + already-space-padded alternatives + `\s+` requires a double space, and `voiceNormalize` collapses runs of whitespace before the call. Later-clause handling therefore never happens for English. | :2260-2261, :2264-2266, :2271-2274, :2288-2290 | "not red but black" → pot red 1 (expected black 7): the negated `red` wins at the `redSingular` check :2355, before the colour scan :2357. |
| **D2** | high | Because `tail` is mandatory (:2266, no `?`), a negated clause with no following clause break is not stripped at all, so the negated ball still scores. | :2266, :2272, :2326-2327 | "not black" → pot black 7; "no red" → pot red 1; "don't pot the black" → pot 7; "never mind the black" → pot 7; 不要打黑球 → pot 7; 别打黑球 → pot 7; 不 红球 → pot red 1. Also, with a break present: "not yellow then blue" → pot yellow 2 (the negated ball). None of these are refused; they score. |
| **D3** | medium | For Chinese, `voiceFindPlayer` can never identify a player inside a contiguous utterance: :2304 removes all whitespace before the call, and :2419-2420 needs either an exact token or `' phrase '` in the haystack. | :2304, :2391-2392, :2419-2420, :2373, :2485 | 玩家a认输 → `who === null` → `voiceSayError('voiceNeedConceder')`; the zh concede command is unusable (button still works). Deterministic: recogniser spacing is stripped at :2304 first. Contradicts `voice_parser_verify.js:551` and the comment at :2412-2414. |
| **D6** | medium | `voiceAsk`'s `false` return conflates "parked, waiting for the spoken answer" with "not approved", so all three destructive cases immediately print **"✋ Cancelled"** over the just-posted question chip (`voiceSetChip` at :2530/:2599 is overwritten at :2473/:2479/:2487). | :2523-2542 vs :2472-2473, :2478-2479, :2486-2487 | Say "new frame" with the mic live: the chip says Cancelled while the board is actually waiting for "yes"/"no" (on the overlay path the question survives only inside the dialog). Misleads the user into believing the command was dropped. |
| **D5** | low | The `window.confirm` fallback never clears `voicePending` (neither the true branch :2605 nor the case tails), so a stale park survives. | :2524, :2603-2606, :2475/2481/2489 | (g) confirm→Cancel: the next stray "yes" re-enters the destructive case and raises "Start a new frame? Confirm?" again; a stray "no" prints "✋ Cancelled" for nothing. Same staleness after (f). |
| **D7** | low | A throw *after* `document.body.appendChild(overlay)` (:2571) but before the listeners (:2591-2595) — i.e. the `!yesBtn || !noBtn` check at :2590 — leaves an inert `foul-overlay` in the DOM; `voiceConfirmInFlight` was never set, so no later ask removes it. | :2558-2606 | A malformed/stripped dialog leaves a stuck modal covering the board. Low probability (the ids are in the literal `innerHTML`). |

---

## 6. Could not determine statically

1. **Whether the file parses / runs.** I read the code, I did not execute a parser or a runtime. All
   of the above assumes the file is syntactically valid at this revision.
2. **Real-throw behaviour for (f)/(g).** The task stipulated "no usable overlay (createElement
   throws)". I traced the coded `catch` (:2603-2606) for that hypothesis; whether
   `createElement`/`appendChild`/`querySelector` can actually throw in a target browser, and how often
   the :2590 branch is hit, is not determinable from the source.
3. **Web Speech API session details.** I assumed the code's own contract: one routed command per
   session (`voiceSessionHandled` :2701-2705) and `onresult` before `onend` (so `voiceListening` is
   still true while a transcript is routed, which is what makes `voiceAsk` take the mic branch on the
   answer utterance). Whether an engine can deliver a final result after `stopVoiceListening()`
   (the only realistic route into the overlay branch from speech) depends on the browser.
4. **Whether an ask can be reached with the mic off at all** (see the reachability caveat in §3). If
   it cannot in practice, traces (c)-(g) are hypothetical paths, not live ones.
5. **Registry/harness expectations are not evidence.** `voice_parser_verify.js` (e.g. `null.no-red`
   :498 vs `pending.no-red-is-a-command` :519, which expect opposite results for the same transcript;
   `neg2.not-black-red` :540; `who.zh-a` :551) I read only as a statement of intent. I could not run it,
   and two of its rows contradict each other at this revision.
6. **I did not verify the en/zh i18n text beyond the keys quoted** (:968, :996-1004, :1085-1103), and I
   did not review anything outside the voice block except the callees named in the task
   (`canPotReds`, `canPotColor`, `addPoints`, `newFrame`, `concedeFrame`, `voiceNameOf`, `t`).

---

## 7. Bottom line

* **Item 1 (`voiceDropNegated`): broken.** The en tail can never match (double-whitespace
  requirement against `voiceNormalize`'s single-space collapse), and a mandatory tail means any
  negation without a following clause break is ignored. 3 of the 8 en expectations (en-3/4/5) and all
  three zh "expected null" cases fail; en-7/en-8 fail too; en-1/en-2 pass only because the colour scan
  at :2357 is ascending and `yellow`(2) beats `blue`(5) — the negation is not honoured in any of these
  cases. `args.slice(1, args.length - 2)` is correct, and `boundary`/`gap` are declared before use.
* **Item 2 (`voiceFindPlayer`/`voiceSaysPhrase`): they agree, and the call site uses post-negation
  `text` + `zhPack`.** But the zh path (D3) can never resolve a player because :2304 strips the
  whitespace the matcher needs.
* **Item 3 (confirm gate): no double-execution and no run-after-NO anywhere, but the gate blocks the
  action it exists to authorise (D4)** — every YES/confirm re-asks instead of applying, so (a), (c),
  (f) and (i) produce neither a run nor a cancel; (b), (d), (e), (g) cancel correctly; (h) silently
  discards the park and pots the red. D6 (the "Cancelled" chip on the park path) and D5 (stale park
  after the `confirm()` fallback) are part of the same area.
* **Item 4 (`case 'pot'`): correct.** The pre-check and the "score moved" re-check are redundant but
  cannot refuse or misreport a legal pot: every legal pot adds ≥ 1, including a two-red pot (+2), and
  `addPoints` never changes `state.turn`.
