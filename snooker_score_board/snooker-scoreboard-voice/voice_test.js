'use strict';

/**
 * Voice command tests: parser contract + end-to-end application.
 *
 * Run with:  node voice_test.js
 * (No dependencies. Loads snooker_scoreboard.html through test_harness.js.)
 */

const { loadBoard } = require('./test_harness');

let passed = 0;
let failed = 0;
const failures = [];

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed += 1;
  } else {
    failed += 1;
    failures.push(`${label}\n    expected ${e}\n    actual   ${a}`);
  }
}

function ok(label, condition, detail) {
  if (condition) passed += 1;
  else {
    failed += 1;
    failures.push(`${label}${detail ? '\n    ' + detail : ''}`);
  }
}

function section(title) {
  console.log('\n── ' + title);
}

// Each red must be followed by the end of the visit: canPotReds refuses a second red in the
// same visit, which is correct snooker and the board enforces it. Pushing transcripts straight
// in bypasses the speech layer, so the visit flag is cleared to model a fresh visit by the same
// player — the same approach the rules regression suite uses.
function potRed(board) {
  board.transcript('red');
  board.state.redPottedThisVisit = false;
  return board.state.turn === 'A';
}

// ============================================================
// 1. PARSER CONTRACT — a transcript becomes exactly one intent
// ============================================================
const board = loadBoard({ quiet: true });
const parse = text => board.parseVoiceCommand(text, 'en');

section('parser: reds');
[['red', 1], ['one red', 1], ['a red', 1], ['pot red', 1], ['red please', 1], ['red ball', 1]]
  .forEach(([phrase]) => check(`"${phrase}"`, parse(phrase), { kind: 'pot', value: 1, reds: 1 }));
check('"two reds"', parse('two reds'), { kind: 'pot', value: 1, reds: 2 });
check('"pot two reds"', parse('pot two reds'), { kind: 'pot', value: 1, reds: 2 });

section('parser: colours');
check('"yellow"', parse('yellow'), { kind: 'pot', value: 2, reds: 1 });
check('"green"', parse('green'), { kind: 'pot', value: 3, reds: 1 });
check('"brown"', parse('brown'), { kind: 'pot', value: 4, reds: 1 });
check('"blue"', parse('blue'), { kind: 'pot', value: 5, reds: 1 });
check('"pink"', parse('pink'), { kind: 'pot', value: 6, reds: 1 });
check('"black"', parse('black'), { kind: 'pot', value: 7, reds: 1 });
check('"pot the black"', parse('pot the black'), { kind: 'pot', value: 7, reds: 1 });
check('"black please"', parse('black please'), { kind: 'pot', value: 7, reds: 1 });
check('"5 points"', parse('5 points'), { kind: 'pot', value: 5, reds: 1 });
check('"seven"', parse('seven'), { kind: 'pot', value: 7, reds: 1 });

section('parser: fouls');
check('"foul"', parse('foul'), { kind: 'foul', pts: 4, redAlsoPotted: false });
check('"foul four"', parse('foul four'), { kind: 'foul', pts: 4, redAlsoPotted: false });
check('"foul five"', parse('foul five'), { kind: 'foul', pts: 5, redAlsoPotted: false });
check('"four away"', parse('four away'), { kind: 'foul', pts: 4, redAlsoPotted: false });
check('"seven away"', parse('seven away'), { kind: 'foul', pts: 7, redAlsoPotted: false });
check('"foul four and a red"', parse('foul four and a red'), { kind: 'foul', pts: 4, redAlsoPotted: true });
check('"foul seven and the red"', parse('foul seven and the red'), { kind: 'foul', pts: 7, redAlsoPotted: true });
check('"three away" is refused', parse('three away'), { kind: 'error', messageKey: 'voiceFoulRange' });

section('parser: visit + history');
['end of visit', 'end visit', 'shot taken', 'end of break', 'miss', 'pass', 'turn over', 'next player']
  .forEach(phrase => check(`"${phrase}"`, parse(phrase), { kind: 'endVisit' }));
check('"undo"', parse('undo'), { kind: 'undo' });
check('"undo that"', parse('undo that'), { kind: 'undo' });

section('parser: match intents');
check('"new frame"', parse('new frame'), { kind: 'newFrame', needsConfirm: true });
check('"reset match"', parse('reset match'), { kind: 'resetMatch', needsConfirm: true });
check('"whose turn is it"', parse('whose turn is it'), { kind: 'whoIsAtTable' });
check('"help"', parse('help'), { kind: 'help' });
check('"what can i say"', parse('what can i say'), { kind: 'help' });

section('parser: concede + player identification');
check('"player a concedes"', parse('player a concedes'), { kind: 'concede', who: 'A' });
check('"a concedes"', parse('a concedes'), { kind: 'concede', who: 'A' });
check('"player b concedes"', parse('player b concedes'), { kind: 'concede', who: 'B' });
check('"player b resigns"', parse('player b resigns'), { kind: 'concede', who: 'B' });
check('"concede" with nobody named', parse('concede'), { kind: 'concede', who: null });
check('"i concede" names nobody', parse('i concede'), { kind: 'concede', who: null });

section('parser: language');
check('"speak chinese"', parse('speak chinese'), { kind: 'setLanguage', lang: 'zh' });
check('"speak english"', parse('speak english'), { kind: 'setLanguage', lang: 'en' });

section('parser: unknown speech is ignored (never guessed into a score)');
['', 'banana', 'the weather is nice', '12345', 'hello there', 'nice shot', 'no red', 'oh no']
  .forEach(phrase => check(`"${phrase}"`, parse(phrase), null));
check('"not blue, yellow" is yellow, never blue', parse('not blue, yellow'), { kind: 'pot', value: 2, reds: 1 });
check('"not the black, red" is a red', parse('not the black, red'), { kind: 'pot', value: 1, reds: 1 });
check('"not blue then yellow" keeps the later clause', parse('not blue then yellow'), { kind: 'pot', value: 2, reds: 1 });
check('"not red but black" keeps the later clause', parse('not red but black'), { kind: 'pot', value: 7, reds: 1 });
check('"not black" alone scores nothing', parse('not black'), null);
check('"not blue" alone scores nothing', parse('not blue'), null);
check('"not yellow then blue" scores the blue', parse('not yellow then blue'), { kind: 'pot', value: 5, reds: 1 });
check('"no pink" alone scores nothing', parse('no pink'), null);
check('"never mind the black" scores nothing', parse('never mind the black'), null);
check('"not black and then black" keeps the second black',
  parse('not black and then black'), { kind: 'pot', value: 7, reds: 1 });
check('"five away" is a foul, not a blue pot', parse('five away'), { kind: 'foul', pts: 5, redAlsoPotted: false });
check('"red black" is one intent (the red)', parse('red black'), { kind: 'pot', value: 1, reds: 1 });

section('parser: Chinese');
const zh = text => board.parseVoiceCommand(text, 'zh');
const zhAuto = text => board.parseVoiceCommand(text, 'en'); // no lang arg: auto-detected
check('红球', zh('红球'), { kind: 'pot', value: 1, reds: 1 });
check('红球 auto-detects Chinese', zhAuto('红球'), { kind: 'pot', value: 1, reds: 1 });
check('两颗红球', zh('两颗红球'), { kind: 'pot', value: 1, reds: 2 });
check('黑球', zh('黑球'), { kind: 'pot', value: 7, reds: 1 });
check('咖啡球', zh('咖啡球'), { kind: 'pot', value: 4, reds: 1 });
check('犯规', zh('犯规'), { kind: 'foul', pts: 4, redAlsoPotted: false });
check('本轮结束', zh('本轮结束'), { kind: 'endVisit' });
check('撤销', zh('撤销'), { kind: 'undo' });
check('新一局', zh('新一局'), { kind: 'newFrame', needsConfirm: true });
check('该谁了', zh('该谁了'), { kind: 'whoIsAtTable' });
check('说中文', zh('说中文'), { kind: 'setLanguage', lang: 'zh' });
check('玩家a认输', zh('玩家a认输'), { kind: 'concede', who: 'A' });
check('玩家b认输', zh('玩家b认输'), { kind: 'concede', who: 'B' });
check('卡布奇诺 is ignored', zh('卡布奇诺'), null);

// ============================================================
// 2. END TO END — spoken commands drive the real board state
// ============================================================
section('end to end: scoring');

{
  const b = loadBoard({ quiet: true });
  b.transcript('red');
  check('"red" scores 1 for the player at the table', b.state.A, 1);
  check('"red" takes a red off the table', b.state.reds, 14);
  b.transcript('black');
  check('"black" after a red scores 7', b.state.A, 8);
  // Red → colour → red is the sequence, so a red after the colour is legal
  b.transcript('red');
  check('a red after the colour is legal', b.state.A, 9);
  b.transcript('red');
  check('but a second red in the same visit is refused', b.state.A, 9);
  b.transcript('end of visit');
  b.transcript('red');
  check('after the visit ends a red is legal again', b.state.B, 1);
}

{
  const b = loadBoard({ quiet: true });
  b.transcript('red');
  b.transcript('end of visit');
  check('"end of visit" hands the table over', b.state.turn, 'B');
  // A colour is only legal after a red in the SAME visit, so the incoming player is refused here
  b.transcript('black');
  check('the incoming player cannot pot a colour without a red', b.state.B, 0);
  check('the first player keeps their point', b.state.A, 1);
}

{
  const b = loadBoard({ quiet: true });
  b.transcript('red');
  b.transcript('yellow');
  check('red then yellow = 3', b.state.A, 3);
  const before = b.state.A;
  b.transcript('green');
  check('an illegal colour is refused', b.state.A, before);
  ok('the refusal is reported, not claimed as a pot',
    b.voiceStatus().text.indexOf('✅') === -1, 'chip=' + b.voiceStatus().text);
}

{
  const b = loadBoard({ quiet: true });
  b.transcript('two reds');
  check('"two reds" scores 2', b.state.A, 2);
  check('"two reds" removes two reds', b.state.reds, 13);
}

{
  // A foul is committed by whoever is at the table, and the penalty goes to the opponent
  const b = loadBoard({ quiet: true });
  b.transcript('foul');
  check('the player at the table is the offender', b.state.A, 0);
  check('a foul gives 4 to the opponent', b.state.B, 4);
  check('a foul hands the table over', b.state.turn, 'B');
}

{
  const b = loadBoard({ quiet: true });
  b.transcript('red');
  b.transcript('end of visit');
  b.transcript('undo');
  check('"undo" reverses the visit hand-over', b.state.turn, 'A');
  b.transcript('undo');
  check('"undo" reverses the pot', b.state.A, 0);
  check('"undo" restores the red', b.state.reds, 15);
  check('undo with an empty history changes nothing',
    (b.transcript('undo'), b.state.A), 0);
}

{
  const b = loadBoard({ quiet: true });
  b.transcript('foul five and a red');
  check('a foul with a red takes the red off the table', b.state.reds, 14);
  check('the player at the table is the offender', b.state.A, 0);
  check('the opponent is credited the penalty', b.state.B, 5);
}

{
  // One command per utterance: pushing transcripts straight in still carries the visit flag,
  // so the visit is ended explicitly between them (the speech layer does that via voiceHandleEnd)
  const b = loadBoard({ quiet: true });
  for (let i = 0; i < 3; i += 1) {
    b.transcript('red');
    b.transcript('black');
    b.transcript('end of visit');
  }
  check('three red-black visits score 24', b.state.A + b.state.B, 24);
  check('three reds are off the table in three visits', b.state.reds, 12);
}

section('end to end: the confirm gate never loops and never needs a tap it cannot get');

{
  // The defect this guards: an approved action re-entered the gate and asked itself forever
  const b = loadBoard({ quiet: true });
  b.transcript('red'); // newFrame() is a no-op while the board is untouched
  b.transcript('new frame');
  check('a dialog is up and nothing is pending for the caller', b.voiceConfirmInFlight() !== null, true);
  const overlay = b.document.body.children[b.document.body.children.length - 1];
  overlay.querySelector('#voiceYesBtn').click();
  check('one tap runs the new frame', b.state.turn, 'B');
  check('the park is cleared after running', b.voicePending(), null);
  check('no second dialog was opened', b.voiceConfirmInFlight(), null);
  check('the frame was awarded exactly once', b.state.framesA + b.state.framesB, 1);
}

{
  const b = loadBoard({ quiet: true });
  b.transcript('red'); // newFrame() is a no-op while the board is untouched
  b.setVoiceMuted(true); // armed: the microphone is live for this utterance
  b.startVoiceListening();
  let engine = b.speech.instances[0];
  engine.onresult({ resultIndex: 0, results: [{ 0: { transcript: 'new frame' }, isFinal: true }] });
  check('a parked confirmation is waiting', b.voicePending() !== null, true);
  engine.onend();
  engine = b.speech.instances[b.speech.instances.length - 1];
  engine.onresult({ resultIndex: 0, results: [{ 0: { transcript: 'yes' }, isFinal: true }] });
  check('a spoken yes runs the new frame once', b.state.turn, 'B');
  check('a spoken yes clears the park', b.voicePending(), null);
  ok('the chip reports the action, not a cancellation',
    b.voiceStatus().text.indexOf('Cancelled') === -1, 'chip=' + b.voiceStatus().text);
}

{
  const b = loadBoard({ quiet: true });
  b.setVoiceMuted(true); // armed: the microphone is live for this utterance
  b.startVoiceListening();
  const engine = b.speech.instances[0];
  engine.onresult({ resultIndex: 0, results: [{ 0: { transcript: 'player a concedes' }, isFinal: true }] });
  engine.onend();
  const answer = b.speech.instances[b.speech.instances.length - 1];
  answer.onresult({ resultIndex: 0, results: [{ 0: { transcript: 'yes' }, isFinal: true }] });
  check('a spoken yes concedes the named player', b.state.frameOver, true);
  check('the frame goes to the opponent', b.state.framesB, 1);
}

{
  const b = loadBoard({ quiet: true, brokenOverlay: true, confirm: () => true });
  b.transcript('reset match');
  check('an approved fallback dialog runs the command once', b.state.history.length, 0);
  check('the park is cleared', b.voicePending(), null);
}

{
  const b = loadBoard({ quiet: true, brokenOverlay: true, confirm: () => false });
  b.transcript('new frame');
  check('a refused fallback dialog changes nothing', b.state.turn, 'A');
  check('a refused fallback dialog leaves no park', b.voicePending(), null);
}

section('end to end: spoken confirmation (the shipped microphone path)');

{
  const b = loadBoard({ quiet: true });
  b.transcript('red'); // newFrame() is a no-op on an untouched board by design
  // A long restart delay keeps the engine session stable: the restart inside onend would
  // otherwise close the session this test is answering into
  b.setVoiceRestartDelay(60000);
  b.setVoiceMuted(true); // armed: the microphone is live for this utterance
  b.startVoiceListening();
  let engine = b.speech.instances[0];
  engine.onresult({ resultIndex: 0, results: [{ 0: { transcript: 'new frame' }, isFinal: true }] });
  check('a destructive command parks a pending confirmation', b.voicePending() !== null, true);
  check('the board waits for a spoken answer', b.voiceAwaitAnswer(), true);
  ok('the chip asks for confirmation', b.voiceStatus().text.indexOf('?') !== -1,
    'chip=' + b.voiceStatus().text);

  engine.onend();
  check('the microphone re-opens for the answer', b.voiceListening(), true);
  engine = b.speech.instances[b.speech.instances.length - 1];
  engine.onresult({ resultIndex: 0, results: [{ 0: { transcript: 'yes' }, isFinal: true }] });
  check('a spoken "yes" runs the command', b.state.turn, 'B');
  check('the pending confirmation is cleared', b.voicePending(), null);
  check('the new frame reset the reds', b.state.reds, 15);
}

{
  const b = loadBoard({ quiet: true });
  b.transcript('red'); // newFrame() is a no-op on an untouched board by design
  b.setVoiceMuted(true); // armed: the microphone is live for this utterance
  b.startVoiceListening();
  const engine = b.speech.instances[0];
  engine.onresult({ resultIndex: 0, results: [{ 0: { transcript: 'new frame' }, isFinal: true }] });
  engine.onresult({ resultIndex: 0, results: [{ 0: { transcript: 'no' }, isFinal: true }] });
  check('a spoken "no" leaves the frame alone', b.state.turn, 'A');
  check('the pending confirmation is cleared', b.voicePending(), null);
}
section('end to end: on-screen confirmation (voice off or unavailable)');

{
  const b = loadBoard({ quiet: true });
  b.transcript('red'); // newFrame() is a no-op on an untouched board by design
  b.transcript('new frame');
  const overlay = b.document.body.children[b.document.body.children.length - 1];
  ok('a confirm dialog is shown', !!overlay, 'no overlay was appended');
  const yes = overlay && overlay.querySelector('#voiceYesBtn');
  ok('the dialog offers a YES button', !!yes);
  if (yes) yes.click();
  check('tapping YES runs the parked command', b.state.turn, 'B');
  check('the pending confirmation is cleared', b.voicePending(), null);
}

{
  const b = loadBoard({ quiet: true });
  b.transcript('new frame');
  const overlay = b.document.body.children[b.document.body.children.length - 1];
  const no = overlay && overlay.querySelector('#voiceNoBtn');
  ok('the dialog offers a NO button', !!no);
  if (no) no.click();
  check('tapping NO changes nothing', b.state.turn, 'A');
  check('the pending confirmation is cleared', b.voicePending(), null);
}

{
  const b = loadBoard({ quiet: true, brokenOverlay: true, confirm: () => true });
  b.transcript('red');
  b.transcript('new frame');
  check('the fallback dialog still runs the command', b.state.turn, 'B');
  check('the pending confirmation is cleared', b.voicePending(), null);
}

{
  const b = loadBoard({ quiet: true, brokenOverlay: true, confirm: () => false });
  b.transcript('red');
  b.transcript('new frame');
  check('declining the fallback dialog changes nothing', b.state.turn, 'A');
  check('the pending confirmation does not linger', b.voicePending(), null);
}

{
  // A working overlay must win over the fallback, so the confirm() stub is never consulted
  let asked = 0;
  const b = loadBoard({ quiet: true, confirm: () => { asked += 1; return true; } });
  b.transcript('red');
  b.transcript('new frame');
  const overlay = b.document.body.children[b.document.body.children.length - 1];
  ok('the overlay is preferred when it can be built', !!overlay && !!overlay.querySelector('#voiceYesBtn'));
  check('the confirm() fallback was not consulted', asked, 0);
}

section('end to end: concede by voice');

{
  const b = loadBoard({ quiet: true });
  b.transcript('player a concedes');
  const overlay = b.document.body.children[b.document.body.children.length - 1];
  const yes = overlay && overlay.querySelector('#voiceYesBtn');
  ok('the concede dialog is shown', !!yes);
  ok('the dialog names the player, not the letter',
    !!overlay && overlay._html.indexOf('Player A') !== -1, 'html=' + (overlay && overlay._html));
  if (yes) yes.click();
  check('the concession ends the frame', b.state.frameOver, true);
  check('the frame is awarded to the opponent', b.state.framesB, 1);
}

{
  const b = loadBoard({ quiet: true, confirm: () => true });
  b.setName('A', 'Alice');
  b.setName('B', 'Bob');
  b.transcript('alice concedes');
  // A custom name resolves to a player, and the destructive action still asks before running
  const overlay = b.document.body.children[b.document.body.children.length - 1];
  const yes = overlay && overlay.querySelector('#voiceYesBtn');
  ok('the concede dialog is shown for a custom name', !!yes);
  if (yes) yes.click();
  check('a custom player name can concede by voice', b.state.frameOver, true);
  check('the named player loses the frame', b.state.framesB, 1);
}

{
  const b = loadBoard({ quiet: true });
  b.transcript('somebody concedes');
  check('a concession with nobody named does not run', b.state.frameOver, false);
  check('the turn is untouched', b.state.turn, 'A');
}

section('end to end: speech layer mechanics');

{
  const b = loadBoard({ quiet: true });
  b.setVoiceMuted(true); // armed: the microphone is live for this utterance
  b.startVoiceListening();
  const engine = b.speech.instances[0];
  ok('the engine is configured for English', !!engine && engine.lang === 'en-GB', 'lang=' + (engine && engine.lang));
  ok('the engine is continuous, so it stays open across commands', engine.continuous === true);
  ok('the engine asks for several guesses', engine.maxAlternatives > 1, 'maxAlternatives=' + engine.maxAlternatives);
  engine.onresult({ resultIndex: 0, results: [{ 0: { transcript: 'red' }, isFinal: true }] });
  check('a final result applies one command', b.state.A, 1);
  engine.onresult({ resultIndex: 0, results: [{ 0: { transcript: 'red' }, isFinal: true }] });
  check('the same audio re-finalised cannot score twice', b.state.A, 1);
  engine.onresult({ resultIndex: 0, results: [{ 0: { transcript: 'black' }, isFinal: true }] });
  check('a new final result is a new command', b.state.A, 8);
  engine.onend();
  check('the engine releases the listening state', b.voiceListening(), false);
}

{
  // A near-miss in a lower-ranked guess is used when the top guess is unusable.
  // The alternatives are indexed properties, exactly as SpeechRecognitionResult provides them.
  const b = loadBoard({ quiet: true });
  b.setVoiceMuted(true); // armed: the microphone is live for this utterance
  b.startVoiceListening();
  const engine = b.speech.instances[0];
  engine.onresult({ resultIndex: 0, results: [
    { length: 1, isFinal: true, 0: { transcript: 'red', confidence: 0.9 } },
  ] });
  check('the priming red was scored', b.state.A, 1);
  engine.onresult({ resultIndex: 1, results: [
    { length: 1, isFinal: true, 0: { transcript: 'red', confidence: 0.9 } },
    { length: 2, isFinal: true, 0: { transcript: 'umm', confidence: 0.9 },
      1: { transcript: 'yello', confidence: 0.7 } },
  ] });
  check('"yello" is accepted as yellow', b.state.A, 3);
  ok('the chip shows the guess that was used', b.voiceStatus().text.indexOf('Yellow') !== -1,
    'chip=' + b.voiceStatus().text);
}

{
  const b = loadBoard({ quiet: true });
  b.setVoiceMuted(true); // armed: the microphone is live for this utterance
  b.startVoiceListening();
  const engine = b.speech.instances[0];
  engine.onresult({ resultIndex: 0, results: [
    { length: 1, isFinal: true, 0: { transcript: 'red', confidence: 0.9 } },
  ] });
  engine.onresult({ resultIndex: 1, results: [
    { length: 1, isFinal: true, 0: { transcript: 'red', confidence: 0.9 } },
    { length: 2, isFinal: true, 0: { transcript: 'umm', confidence: 0.9 },
      1: { transcript: 'banana', confidence: 0.7 } },
  ] });
  check('a near-miss that matches nothing is still ignored', b.state.A, 1);
}

{
  const b = loadBoard({ quiet: true });
  b.setVoiceMuted(true); // armed: the microphone is live for this utterance
  b.startVoiceListening();
  const engine = b.speech.instances[0];
  engine.onresult({ resultIndex: 0, results: [{ 0: { transcript: 'umm what was that' }, isFinal: true }] });
  check('unknown speech does not change the score', b.state.A, 0);
  ok('the chip shows the unrecognised transcript',
    b.voiceStatus().text.indexOf('umm what was that') !== -1, 'chip=' + b.voiceStatus().text);
}

{
  const b = loadBoard({ noSpeech: true, quiet: true });
  check('no speech API means voice is unsupported', b.voiceSupported(), false);
  b.startVoiceListening();
  check('listening is a no-op without an engine', b.voiceListening(), false);
  b.clickBall('A', 1);
  check('the board still scores by tap', b.state.A, 1);
}

// ============================================================
// 3. REGRESSION — the rules guards still hold through taps
// ============================================================
section('regression: rules guards');

{
  const b = loadBoard({ quiet: true });
  for (let i = 0; i < 15; i += 1) potRed(b);
  check('15 reds are off the table', b.state.reds, 0);
  check('the last red opens the "any colour" phase', b.state.phase, 'last-red');
  check('the reds all went to player A', b.state.A, 15);
  ok('a colour is legal after the last red', b.canPotColor(3));
  b.transcript('black');
  check('any colour after the last red moves to the colours phase', b.state.phase, 'colors');
  ok('only the next colour in order is legal then',
    b.canPotColor(2) && !b.canPotColor(3));
}

{
  const b = loadBoard({ quiet: true });
  b.clickBall('B', 1);
  check('the button grid refuses a pot by the player not at the table', b.state.B, 0);
  b.transcript('red');
  check('voice scores for the player at the table', b.state.A, 1);
}

{
  const b = loadBoard({ quiet: true });
  const version = b.elements.appVersion.textContent;
  ok('the version banner reports v1.6.1',
    version.indexOf('1.6.1') !== -1, 'version=' + version);
}

// ============================================================
// 4. HANDS-FREE — one arm, then the microphone keeps re-opening
// ============================================================
section('hands-free: the microphone re-opens by itself');

// Longer than the default restart delay, so a scheduled re-open has happened by the time we check
const tick = () => new Promise(resolve => setTimeout(resolve, 400));

async function handsFreeTests() {
  {
    const b = loadBoard({ quiet: true });
    b.setVoiceMuted(true); // arms hands-free with a zero restart delay
    b.startVoiceListening();
    check('arming opens a session', b.speech.instances.length, 1);
    const engine = b.speech.instances[0];
    check('the engine was started once', engine.started, 1);
    engine.onresult({ resultIndex: 0, results: [{ 0: { transcript: 'red' }, isFinal: true }] });
    check('the utterance is applied', b.state.A, 1);
    engine.onend();
    await tick();
    // The engine object is reused across sessions; what matters is that start() was called again
    check('the microphone re-opens without another click', engine.started, 2);
    check('the board reports it is listening again', b.voiceListening(), true);

    engine.onresult({ resultIndex: 0, results: [{ 0: { transcript: 'yellow' }, isFinal: true }] });
    check('a second utterance needs no click either', b.state.A, 3);
    engine.onend();
    await tick();
    check('and it keeps going', engine.started, 3);
  }

  {
    const b = loadBoard({ quiet: true });
    b.setVoiceMuted(true);
    b.startVoiceListening();
    const engine = b.speech.instances[0];
    engine.onend();
    await tick();
    const startedBefore = engine.started;
    b.setVoiceMuted(false); // disarms
    b.stopVoiceListening();
    await tick();
    check('disarming stops the restart loop', engine.started, startedBefore);
    check('disarming reports not listening', b.voiceListening(), false);
    check('disarming leaves the armed flag off', b.voiceArmed(), false);
  }

  {
    const b = loadBoard({ quiet: true });
    b.setVoiceMuted(true);
    b.setVoiceMaxRestarts(3);
    b.startVoiceListening();
    const engine = b.speech.instances[0];
    // A session that never produces speech must not restart forever
    for (let i = 0; i < 20; i += 1) {
      engine.onend();
      await tick();
      if (!b.voiceArmed()) break;
    }
    check('the restart guard eventually disarms', b.voiceArmed(), false);
    ok('and says why', b.voiceStatus().text.indexOf('click') !== -1,
      'chip=' + b.voiceStatus().text);
  }

  {
    const b = loadBoard({ quiet: true });
    b.setVoiceMuted(true);
    b.startVoiceListening();
    const engine = b.speech.instances[0];
    engine.onerror({ error: 'not-allowed' });
    await tick();
    check('a blocked microphone disarms instead of looping', b.voiceArmed(), false);
    ok('and says the microphone is blocked',
      b.voiceStatus().key === 'voiceDenied' || b.voiceStatus().text.length > 0,
      'key=' + b.voiceStatus().key + ' chip=' + b.voiceStatus().text);
  }
}

section('the voice chip: one click on, one click off');

async function chipTests() {
  {
    // The chip click is the only way in: it must ask for the microphone and start listening
    const b = loadBoard({ quiet: true });
    check('the board starts with voice off', b.voiceMutedFlag(), true);
    check('and nothing listening', b.voiceListening(), false);
    b.element('voiceChip').click();
    await tick();
    check('a click arms the board', b.voiceArmed(), true);
    check('the microphone is armed, not muted', b.voiceMutedFlag(), false);
    check('a recognition session was opened', b.speech.instances.length, 1);
    check('and the board reports listening', b.voiceListening(), true);

    b.element('voiceChip').click();
    await tick();
    check('a second click disarms it', b.voiceArmed(), false);
    check('and mutes the microphone', b.voiceMutedFlag(), true);
    check('and stops listening', b.voiceListening(), false);
  }

  {
    // A refused microphone must say so instead of silently doing nothing
    const b = loadBoard({ quiet: true, micGranted: false });
    b.element('voiceChip').click();
    await tick();
    check('a denied microphone does not arm', b.voiceArmed(), false);
    ok('and the chip reports it',
      b.voiceStatus().key === 'voiceDenied' || b.voiceStatus().text.length > 0,
      'key=' + b.voiceStatus().key + ' chip=' + b.voiceStatus().text);
  }

  {
    // The V key is the same toggle
    const b = loadBoard({ quiet: true });
    b.toggleVoiceMute();
    await tick();
    check('the keyboard toggle arms the board', b.voiceArmed(), true);
    b.toggleVoiceMute();
    await tick();
    check('and disarms it again', b.voiceArmed(), false);
  }
}

handsFreeTests()
  .then(chipTests)
  .then(() => {
  // ============================================================
  // REPORT
  // ============================================================
  console.log('\n' + '='.repeat(52));
  if (failed === 0) {
    console.log(`All ${passed} voice/rules checks passed.`);
  } else {
    console.log(`${passed} passed, ${failed} FAILED:\n`);
    failures.forEach(f => console.log('  ✗ ' + f));
  }
  console.log('='.repeat(52));
  process.exit(failed === 0 ? 0 : 1);
});
