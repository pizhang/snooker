'use strict';

/**
 * Rules regression tests.
 *
 * Run with:  node snooker_rules_test.js
 *
 * Previously this file hard-coded `c:/Users/aldog/Documents/GitHub/PowerShellScripts/...` and
 * stubbed a DOM that predates the turn arrows, start-play chips and voice chip, so it crashed
 * before reaching its assertion. It now loads the board through test_harness.js, which mirrors
 * the DOM surface the board actually uses.
 */

const { loadBoard } = require('./test_harness');

let passed = 0;
let failed = 0;
const failures = [];

function ok(label, condition, detail) {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    failures.push(`${label}${detail ? '\n    ' + detail : ''}`);
  }
}

const button = (board, player, value, reds) => board.ballButtons.find(b =>
  b.getAttribute('data-player') === player &&
  b.getAttribute('data-value') === String(value) &&
  Number(b.getAttribute('data-reds') || 1) === (reds || 1));

const enabled = (board, player, value, reds) => {
  const btn = button(board, player, value, reds);
  if (!btn) throw new Error(`missing button ${player} ${value}`);
  return btn.disabled === false;
};

// Pot all 15 reds for Player A. A visit ends after a red, so the same player cannot pot two
// reds in one visit; each red here is a fresh visit by A.
function potFifteenReds(board) {
  for (let i = 0; i < 15; i += 1) {
    board.clickBall('A', 1);
    board.state.redPottedThisVisit = false;
    board.state.turn = 'A';
  }
  board.render();
}

// ------------------------------------------------------------
// Red → colour sequence
// ------------------------------------------------------------
{
  const b = loadBoard({ quiet: true });
  potFifteenReds(b);

  ok('15 reds leave no reds on the table', b.state.reds === 0);
  ok('the last red opens the "any colour" phase', b.state.phase === 'last-red');
  ok('the red button is now disabled', enabled(b, 'A', 1, 1) === false);
  ok('any colour is legal after the last red', enabled(b, 'A', 3) === true);

  b.clickBall('A', 7);
  ok('a colour after the last red moves to the colours phase', b.state.phase === 'colors');
  ok('the potted colour is re-spotted and stays on', b.state.colorsPotted[5] === false);
  ok('only the next colour in order is legal', enabled(b, 'A', 2) === true && enabled(b, 'A', 3) === false);
}

// ------------------------------------------------------------
// Colours only become available after a red
// ------------------------------------------------------------
{
  const b = loadBoard({ quiet: true });
  ok('no colour before a red', enabled(b, 'A', 7) === false);
  b.clickBall('A', 1);
  ok('a red opens the colours', enabled(b, 'A', 7) === true);
  b.clickBall('A', 7);
  ok('potting the colour closes them again', enabled(b, 'A', 7) === false);
  ok('a second red is legal again', enabled(b, 'A', 1, 1) === true);
}

// ------------------------------------------------------------
// Two reds in one stroke
// ------------------------------------------------------------
{
  const b = loadBoard({ quiet: true });
  b.clickBall('A', 1, 2);
  ok('two reds score 2 points', b.state.A === 2);
  ok('two reds take two off the table', b.state.reds === 13);
  ok('the red is then closed for this visit', enabled(b, 'A', 1, 1) === false);

  const b2 = loadBoard({ quiet: true });
  b2.state.reds = 1;
  b2.render();
  ok('the two-red button disables itself with one red left', enabled(b2, 'A', 1, 2) === false);
}

// ------------------------------------------------------------
// Turn enforcement
// ------------------------------------------------------------
{
  const b = loadBoard({ quiet: true });
  b.clickBall('B', 1);
  ok('a tap on the other player scores nothing', b.state.B === 0);
  ok('the other player cannot end the visit from their card', b.state.turn === 'A');
  b.clickBall('A', 1);
  ok('the player at the table scores', b.state.A === 1);
}

// ------------------------------------------------------------
// Fouls
// ------------------------------------------------------------
{
  const b = loadBoard({ quiet: true });
  b.applyFoul(4, false);
  ok('a 4-point foul goes to the opponent', b.state.B === 4);
  ok('a foul hands the table over', b.state.turn === 'B');
  b.undo();
  ok('undo reverses the penalty', b.state.B === 0);
  ok('undo restores the turn', b.state.turn === 'A');
}

{
  const b = loadBoard({ quiet: true });
  b.applyFoul(5, true);
  ok('a foul with a red takes one red off the table', b.state.reds === 14);
  b.undo();
  ok('undo restores the red as well as the points', b.state.reds === 15 && b.state.B === 0);
}

{
  const b = loadBoard({ quiet: true });
  b.state.reds = 1;
  b.render();
  b.applyFoul(4, true);
  ok('a foul on the last red opens the "any colour" phase', b.state.phase === 'last-red');
}

// ------------------------------------------------------------
// Colours phase runs to Black and ends the frame
// ------------------------------------------------------------
{
  const b = loadBoard({ quiet: true });
  potFifteenReds(b);
  b.clickBall('A', 7); // the colour after the last red, re-spotted
  ok('the colours phase starts at yellow', b.state.phase === 'colors' && b.state.colorsPotted[0] === false);
  [2, 3, 4, 5, 6, 7].forEach(value => b.clickBall('A', value));
  ok('the frame ends after the Black', b.state.frameOver === true && b.state.phase === 'over');
  ok('all buttons are disabled once the frame is over', enabled(b, 'A', 1, 1) === false);
  ok('the score stays on screen', b.state.A === 15 + 7 + 27);
}

// ------------------------------------------------------------
// Level scores after the Black → re-spotted Black
// ------------------------------------------------------------
{
  const b = loadBoard({ quiet: true });
  b.state.reds = 0;
  b.state.colorsPotted = [true, true, true, true, true, false];
  b.state.phase = 'colors';
  b.state.A = 7;
  b.state.B = 0;
  b.render();
  b.clickBall('A', 7); // A reaches 14 with a clear lead — the frame ends
  ok('black only and a clear lead ends the frame', b.state.frameOver === true);

  const b2 = loadBoard({ quiet: true });
  b2.state.reds = 0;
  b2.state.colorsPotted = [true, true, true, true, true, false];
  b2.state.phase = 'colors';
  b2.state.A = 0;
  b2.state.B = 7; // potting the Black makes it 7–7
  b2.render();
  b2.clickBall('A', 7);
  ok('level scores after the Black re-spot the Black', b2.state.phase === 'respotted-black');
  ok('the re-spotted black hands over to the other player', b2.state.turn === 'B');
  ok('the frame is not over yet', b2.state.frameOver === false);
  b2.clickBall('B', 7);
  ok('the re-spotted Black ends the frame', b2.state.frameOver === true);
}

// ------------------------------------------------------------
// Frame alternation and undo snapshots
// ------------------------------------------------------------
{
  const b = loadBoard({ quiet: true });
  ok('player A breaks the first frame', b.state.turn === 'A');
  b.transcript('red');
  b.newFrame();
  ok('the break alternates to B', b.state.turn === 'B');
  ok('the frame was awarded to the higher score', b.state.framesA === 1);
  ok('the new frame resets the score', b.state.A === 0 && b.state.reds === 15);

  const b2 = loadBoard({ quiet: true });
  b2.transcript('red');
  b2.transcript('black');
  b2.undo();
  ok('undo reverses only the last pot', b2.state.A === 1);
  b2.undo();
  ok('undo can walk back to the start', b2.state.A === 0 && b2.state.reds === 15);
  const before = b2.state.history.length;
  b2.undo();
  ok('undo on an empty history is a no-op', b2.state.history.length === before);
}

// ------------------------------------------------------------
// Report
// ------------------------------------------------------------
console.log('='.repeat(52));
if (failed === 0) {
  console.log(`All ${passed} rules regression checks passed.`);
} else {
  console.log(`${passed} passed, ${failed} FAILED:\n`);
  failures.forEach(f => console.log('  ✗ ' + f));
}
console.log('='.repeat(52));
process.exit(failed === 0 ? 0 : 1);
