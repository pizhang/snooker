#!/usr/bin/env node
/*
 * voice_parser_verify.js
 * ----------------------
 * INDEPENDENT verifier for the additive voice-command layer in snooker_scoreboard.html.
 *
 * Owner: teammate "verifier" (task-1). This file is the ONLY file this teammate writes.
 * It does NOT modify snooker_scoreboard.html.
 *
 * What it does
 *   1. Reads snooker_scoreboard.html as text.
 *   2. Locates the additive block between
 *        // ===== VOICE COMMANDS (additive) =====
 *      and
 *        // ===== VOICE COMMANDS END =====
 *   3. Extracts the <script> body that contains that block.
 *   4. Runs it inside node:vm with a DOM stub (plain Node, no npm install).
 *   5. Appends "globalThis.__parse = parseVoiceCommand;" so the parser is reachable.
 *   6. Runs an expectation table written from the SHARED TASK CONTRACT ONLY
 *      (not from the implementer's own tests) and prints PASS/FAIL per case.
 *
 * Usage: node voice_parser_verify.js [path\to\snooker_scoreboard.html]
 * Exit code: 0 = every case passed, 1 = at least one failure or a harness error.
 *
 * NOTE ON HONESTY: if this script is never executed, its output must not be quoted
 * as a test run. Static-only conclusions are derived by hand from the landed source
 * and are labelled "NOT EXECUTED".
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HEAD_MARKER = '// ===== VOICE COMMANDS (additive) =====';
const TAIL_MARKER = '// ===== VOICE COMMANDS END =====';
const EXPORT_LINE = 'globalThis.__parse = parseVoiceCommand;';
// EXPORT_AND_BRIDGE is injected INSIDE the board's IIFE, just before `})();`, because the
// board's declarations are closure-scoped and a second vm script in the same context cannot
// see them. `voicePending` is only reachable from code that lives in that closure too, so the
// pending accessors are attached to the exported function rather than to `globalThis`.
const EXPORT_AND_BRIDGE =
  EXPORT_LINE +
  'globalThis.__parse.pending = () => voicePending;' +
  'globalThis.__parse.setPending = v => { voicePending = v; };' +
  'globalThis.__parse.voidPending = () => { voicePending = null; };';

const htmlPath = path.resolve(
  process.argv[2] || path.join(__dirname, 'snooker_scoreboard.html')
);

// ---------------------------------------------------------------------------
// Extract the script body that contains the additive voice block.
// ---------------------------------------------------------------------------
function extractScriptBody(html) {
  if (!html.includes(HEAD_MARKER)) {
    throw new Error('HEAD marker not found: ' + JSON.stringify(HEAD_MARKER));
  }
  if (!html.includes(TAIL_MARKER)) {
    throw new Error('TAIL marker not found: ' + JSON.stringify(TAIL_MARKER));
  }
  const headAt = html.indexOf(HEAD_MARKER);
  const tailAt = html.indexOf(TAIL_MARKER);
  if (tailAt < headAt) {
    throw new Error('VOICE COMMANDS END appears before the additive block start');
  }

  // The enclosing <script> is the last "<script" opening before the block.
  const openTag = html.lastIndexOf('<script', headAt);
  if (openTag === -1) throw new Error('no <script> opening tag before the voice block');
  const bodyStart = html.indexOf('>', openTag);
  if (bodyStart === -1) throw new Error('malformed <script> opening tag');
  const closeTag = html.indexOf('</script>', tailAt);
  if (closeTag === -1) throw new Error('no </script> after the voice block');

  const body = html.slice(bodyStart + 1, closeTag);
  return {
    body,
    hasHead: true,
    hasTail: true,
    // Kept for the report: the slice that is contractually the additive layer.
    additiveBlock: html.slice(headAt, tailAt + TAIL_MARKER.length),
  };
}

// ---------------------------------------------------------------------------
// Minimal DOM stub. Deliberately permissive: the script runs init() at load
// time and touches DOM/localStorage, which is irrelevant to the parser.
// ---------------------------------------------------------------------------
function makeElement(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    nodeType: 1,
    style: {},
    dataset: {},
    children: [],
    childNodes: [],
    classList: {
      _set: new Set(),
      add() { for (const a of arguments) this._set.add(a); },
      remove() { for (const a of arguments) this._set.delete(a); },
      toggle() { return false; },
      contains(c) { return this._set.has(c); },
    },
    attributes: {},
    textContent: '',
    innerHTML: '',
    innerText: '',
    value: '',
    checked: false,
    disabled: false,
    title: '',
    lang: '',
    className: '',
    appendChild(c) { this.children.push(c); this.childNodes.push(c); return c; },
    insertBefore(c) { this.children.unshift(c); this.childNodes.unshift(c); return c; },
    removeChild(c) {
      const i = this.children.indexOf(c);
      if (i >= 0) this.children.splice(i, 1);
      const j = this.childNodes.indexOf(c);
      if (j >= 0) this.childNodes.splice(j, 1);
      return c;
    },
    remove() {},
    setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'id') this.id = String(v); },
    getAttribute(k) {
      if (k === 'data-lang') return this.attributes['data-lang'];
      return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null;
    },
    removeAttribute(k) { delete this.attributes[k]; },
    hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k); },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return true; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    focus() {},
    blur() {},
    click() {},
    getBoundingClientRect() {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 };
    },
    select() {},
    setSelectionRange() {},
    scrollIntoView() {},
    contains() { return false; },
    insertAdjacentHTML() {},
    replaceChildren() {},
    after() {},
    before() {},
    cloneNode() { return makeElement(this.tagName); },
  };
  return el;
}

function makeStorage() {
  const map = new Map();
  return {
    getItem(k) { return map.has(String(k)) ? map.get(String(k)) : null; },
    setItem(k, v) { map.set(String(k), String(v)); },
    removeItem(k) { map.delete(String(k)); },
    clear() { map.clear(); },
    key(i) { return Array.from(map.keys())[i] ?? null; },
    get length() { return map.size; },
  };
}

function makeDocument() {
  const byId = new Map();
  const doc = {
    title: '',
    body: makeElement('body'),
    head: makeElement('head'),
    documentElement: makeElement('html'),
    readyState: 'complete',
    createElement(tag) { return makeElement(tag); },
    createTextNode(t) { return { nodeType: 3, textContent: String(t) }; },
    createDocumentFragment() { return makeElement('fragment'); },
    getElementById(id) {
      const key = String(id);
      if (!byId.has(key)) {
        const el = makeElement('div');
        el.id = key;
        byId.set(key, el);
      }
      return byId.get(key);
    },
    querySelector(sel) {
      // .lang-chip array is built from querySelectorAll; getElementById covers ids.
      if (typeof sel === 'string' && sel.startsWith('#')) return this.getElementById(sel.slice(1));
      return null;
    },
    querySelectorAll() { return []; },
    getElementsByClassName() { return []; },
    getElementsByTagName() { return []; },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return true; },
    write() {},
    open() {},
    close() {},
    execCommand() { return true; },
  };
  return doc;
}

function makeSandbox() {
  const doc = makeDocument();
  const sandbox = {
    console: {
      log() {},
      warn() {},
      error() {},
      info() {},
      debug() {},
      table() {},
      trace() {},
      dir() {},
      assert() {},
      time() {},
      timeEnd() {},
      group() {},
      groupEnd() {},
    },
    document: doc,
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    navigator: { language: 'en-US', languages: ['en-US'], userAgent: 'verifier-node' },
    location: { href: 'file:///snooker_scoreboard.html', hash: '', search: '', protocol: 'file:' },
    screen: { width: 1280, height: 800 },
    innerWidth: 1280,
    innerHeight: 800,
    devicePixelRatio: 1,
    performance: { now: () => Date.now() },
    requestAnimationFrame(cb) { return setTimeout(() => cb(Date.now()), 0); },
    cancelAnimationFrame(id) { clearTimeout(id); },
    setTimeout,
    clearTimeout,
    setInterval() { return 0; },
    clearInterval() {},
    alert() {},
    confirm() { return true; },
    prompt() { return null; },
    matchMedia() {
      return { matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} };
    },
    speechSynthesis: {
      speak() {}, cancel() {}, getVoices() { return []; },
      addEventListener() {}, removeEventListener() {},
    },
    SpeechSynthesisUtterance: function (text) { this.text = text; },
    webkitSpeechRecognition: function () {
      this.start = function () {};
      this.stop = function () {};
      this.abort = function () {};
      this.addEventListener = function () {};
      this.removeEventListener = function () {};
    },
    getComputedStyle() {
      return { getPropertyValue() { return ''; } };
    },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return true; },
    focus() {},
    XMLHttpRequest: function () {
      this.open = function () {};
      this.send = function () {};
      this.setRequestHeader = function () {};
    },
    fetch() { return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); },
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.top = sandbox;
  sandbox.parent = sandbox;
  return sandbox;
}

// ---------------------------------------------------------------------------
// Load the parser from the landed HTML.
// ---------------------------------------------------------------------------
function loadParser(html) {
  const { body, additiveBlock } = extractScriptBody(html);
  const parseFnSource = additiveBlock.match(
    /function\s+parseVoiceCommand\s*\(([^)]*)\)/
  );

  const sandbox = makeSandbox();
  const context = vm.createContext(sandbox);

  // The board is one IIFE, so its declarations are not visible from a second script in the
  // same context. The export must therefore be injected INSIDE the closure, just before the
  // closing `})();`. Appending it after the IIFE can never resolve parseVoiceCommand.
  const closing = body.match(/\n([ \t]*)init\(\);\s*\}\)\(\);\s*$/);
  const instrumented = closing
    ? body.replace(closing[0], `\n${closing[1]}init();\n${closing[1]}${EXPORT_AND_BRIDGE}\n${closing[1]}})();\n`)
    : body;

  let bootError = null;
  try {
    vm.runInContext(instrumented, context, {
      filename: 'snooker_scoreboard.inline.js',
      timeout: 20000,
    });
  } catch (err) {
    // A boot crash is reported separately; the parser may still be exported if
    // the throw happened inside init() after the export line. Try the parser.
    bootError = err;
  }

  let parse = null;
  let pendingBridge = null;
  if (typeof sandbox.__parse === 'function') {
    parse = sandbox.__parse;
    // The bridge was injected inside the closure by EXPORT_AND_BRIDGE, so these accessors
    // real closure variables. Running a second vm script here could not do that.
    if (typeof parse.pending === 'function' && typeof parse.setPending === 'function') {
      pendingBridge = { get: parse.pending, set: parse.setPending };
    }
  } else {
    // Fallback: evaluate only the additive block (isolated from page boot). The block is not
    // wrapped in the page IIFE, so appending the bridge after it does work here.
    try {
      const isolated = vm.createContext(makeSandbox());
      vm.runInContext(additiveBlock + '\n;' + EXPORT_AND_BRIDGE + '\n', isolated, {
        filename: 'voice_block_only.js',
        timeout: 20000,
      });
      if (typeof isolated.__parse === 'function') {
        parse = isolated.__parse;
        if (typeof parse.pending === 'function' && typeof parse.setPending === 'function') {
          pendingBridge = { get: parse.pending, set: parse.setPending };
        }
      }
    } catch (err2) {
      if (!bootError) bootError = err2;
    }
  }

  return { parse, pendingBridge, bootError, parseFnSource, additiveBlock, bodyLength: body.length };
}

// ---------------------------------------------------------------------------
// Expectation helpers.
// Contract objects may omit unspecified fields; only listed fields are checked.
// An explicitly expected `null` REQUIRES the actual value to be null/undefined.
// ---------------------------------------------------------------------------
function stable(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stable);
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = stable(value[key]);
  return out;
}

function show(value) {
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(stable(value));
  } catch (err) {
    return String(value);
  }
}

function describeMismatch(actual, expected) {
  const problems = [];
  if (actual === null || typeof actual !== 'object') {
    return ['expected an object, got ' + show(actual)];
  }
  const keys = Object.keys(expected);
  for (const key of keys) {
    const want = expected[key];
    const got = actual[key];
    if (want === null) {
      if (got !== null && got !== undefined) {
        problems.push('field "' + key + '": expected null, got ' + show(got));
      }
      continue;
    }
    if (want !== null && typeof want === 'object') {
      const sub = describeMismatch(got, want);
      for (const s of sub) problems.push('field "' + key + '".' + s);
      continue;
    }
    if (got !== want) {
      problems.push('field "' + key + '": expected ' + show(want) + ', got ' + show(got));
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// TEST TABLE — written from the shared task contract only.
// ---------------------------------------------------------------------------
// expect: object with the required field values, or null meaning "must return null".
// forbidden: field values that must NOT match (used for "not blue, yellow").
const CASES = [
  // ---- pot: red (value 1, reds 1) ----
  { id: 'pot.red', t: 'red', expect: { kind: 'pot', value: 1, reds: 1 } },
  { id: 'pot.one-red', t: 'one red', expect: { kind: 'pot', value: 1, reds: 1 } },
  { id: 'pot.a-red', t: 'a red', expect: { kind: 'pot', value: 1, reds: 1 } },
  { id: 'pot.pot-red', t: 'pot red', expect: { kind: 'pot', value: 1, reds: 1 } },
  { id: 'pot.red-please', t: 'red please', expect: { kind: 'pot', value: 1, reds: 1 } },

  // ---- pot: two reds ----
  { id: 'pot.two-reds', t: 'two reds', expect: { kind: 'pot', value: 1, reds: 2 } },

  // ---- pot: colours 2..7 ----
  { id: 'pot.yellow', t: 'yellow', expect: { kind: 'pot', value: 2 } },
  { id: 'pot.green', t: 'green', expect: { kind: 'pot', value: 3 } },
  { id: 'pot.brown', t: 'brown', expect: { kind: 'pot', value: 4 } },
  { id: 'pot.blue', t: 'blue', expect: { kind: 'pot', value: 5 } },
  { id: 'pot.pink', t: 'pink', expect: { kind: 'pot', value: 6 } },
  { id: 'pot.black', t: 'black', expect: { kind: 'pot', value: 7 } },
  { id: 'pot.the-black', t: 'pot the black', expect: { kind: 'pot', value: 7 } },
  { id: 'pot.black-please', t: 'black please', expect: { kind: 'pot', value: 7 } },
  { id: 'pot.5-points', t: '5 points', expect: { kind: 'pot', value: 5 } },
  { id: 'pot.seven', t: 'seven', expect: { kind: 'pot', value: 7 } },

  // ---- foul ----
  { id: 'foul.plain', t: 'foul', expect: { kind: 'foul', pts: 4, redAlsoPotted: false } },
  { id: 'foul.foul-four', t: 'foul four', expect: { kind: 'foul', pts: 4, redAlsoPotted: false } },
  { id: 'foul.four-away', t: 'four away', expect: { kind: 'foul', pts: 4, redAlsoPotted: false } },
  { id: 'foul.four-and-red', t: 'foul four and a red', expect: { kind: 'foul', pts: 4, redAlsoPotted: true } },
  { id: 'foul.four-and-the-red', t: 'four and the red', expect: { kind: 'foul', pts: 4, redAlsoPotted: true } },

  // ---- endVisit ----
  { id: 'end.end-of-visit', t: 'end of visit', expect: { kind: 'endVisit' } },
  { id: 'end.end-visit', t: 'end visit', expect: { kind: 'endVisit' } },
  { id: 'end.shot-taken', t: 'shot taken', expect: { kind: 'endVisit' } },
  { id: 'end.end-of-break', t: 'end of break', expect: { kind: 'endVisit' } },
  { id: 'end.miss', t: 'miss', expect: { kind: 'endVisit' } },
  { id: 'end.pass', t: 'pass', expect: { kind: 'endVisit' } },
  { id: 'end.turn-over', t: 'turn over', expect: { kind: 'endVisit' } },
  { id: 'end.next-player', t: 'next player', expect: { kind: 'endVisit' } },

  // ---- undo ----
  { id: 'undo.plain', t: 'undo', expect: { kind: 'undo' } },
  { id: 'undo.that', t: 'undo that', expect: { kind: 'undo' } },

  // ---- confirm-gated frame/match ----
  { id: 'frame.new', t: 'new frame', expect: { kind: 'newFrame', needsConfirm: true } },
  { id: 'match.reset', t: 'reset match', expect: { kind: 'resetMatch', needsConfirm: true } },

  // ---- concede ----
  { id: 'concede.player-a', t: 'player a concedes', expect: { kind: 'concede', who: 'A' } },
  { id: 'concede.a', t: 'a concedes', expect: { kind: 'concede', who: 'A' } },
  { id: 'concede.i', t: 'i concede', expect: { kind: 'concede', who: null } }, // who = null when no player named

  // ---- whose turn ----
  { id: 'turn.whose', t: 'whose turn', expect: { kind: 'whoIsAtTable' } },
  { id: 'turn.whose-is-it', t: 'whose turn is it', expect: { kind: 'whoIsAtTable' } },

  // ---- help ----
  { id: 'help.plain', t: 'help', expect: { kind: 'help' } },
  { id: 'help.what-can-i-say', t: 'what can i say', expect: { kind: 'help' } },

  // ---- garbage must be null ----
  { id: 'null.empty', t: '', expect: null },
  { id: 'null.banana', t: 'banana', expect: null },
  { id: 'null.weather', t: 'the weather is nice', expect: null },
  { id: 'null.digits', t: '12345', expect: null },

  // ---- negation: must NOT be blue; yellow or null both acceptable ----
  {
    id: 'negation.not-blue-yellow',
    t: 'not blue, yellow',
    expect: { kind: 'pot' },
    constraint: (actual) => {
      if (actual && actual.value === 5) {
        return 'returned blue (value 5) for "not blue, yellow" — negation not honoured';
      }
      return null;
    },
    note: 'acceptable: value 2 (yellow) or null',
  },

  // ---- Chinese (lang = 'zh') ----
  { id: 'zh.red', t: '红球', lang: 'zh', expect: { kind: 'pot', value: 1, reds: 1 } },
  { id: 'zh.two-reds', t: '两颗红球', lang: 'zh', expect: { kind: 'pot', value: 1, reds: 2 } },
  { id: 'zh.black', t: '黑球', lang: 'zh', expect: { kind: 'pot', value: 7 } },
  { id: 'zh.brown', t: '咖啡球', lang: 'zh', expect: { kind: 'pot', value: 4 } },
  { id: 'zh.foul', t: '犯规', lang: 'zh', expect: { kind: 'foul' } },
  { id: 'zh.end-visit', t: '本轮结束', lang: 'zh', expect: { kind: 'endVisit' } },
  { id: 'zh.undo', t: '撤销', lang: 'zh', expect: { kind: 'undo' } },
  { id: 'zh.new-frame', t: '新一局', lang: 'zh', expect: { kind: 'newFrame', needsConfirm: true } },

  // ---- round 2: newly contracted behaviour ----
  { id: 'concede.player-b', t: 'player b concedes', expect: { kind: 'concede', who: 'B' } },
  { id: 'concede.player-b-resigns', t: 'player b resigns', expect: { kind: 'concede', who: 'B' } },
  { id: 'foul.seven-away', t: 'seven away', expect: { kind: 'foul', pts: 7, redAlsoPotted: false } },
  { id: 'foul.five-away', t: 'five away', expect: { kind: 'foul', pts: 5, redAlsoPotted: false } },
  { id: 'foul.foul-seven-red', t: 'foul seven and the red', expect: { kind: 'foul', pts: 7, redAlsoPotted: true } },
  { id: 'null.no-red', t: 'no red', expect: null },
  { id: 'null.oh-no', t: 'oh no', expect: null },
  { id: 'lang.speak-chinese', t: 'speak chinese', expect: { kind: 'setLanguage', lang: 'zh' } },
  { id: 'lang.speak-english', t: 'speak english', expect: { kind: 'setLanguage', lang: 'en' } },

  // ---- pending-confirmation branch (voicePending injected by the runner) ----
  {
    id: 'pending.yes-confirms',
    t: 'yes',
    pending: { kind: 'newFrame', needsConfirm: true },
    expect: { kind: 'confirm', intent: { kind: 'newFrame', needsConfirm: true } },
    expectPendingAfter: null,
  },
  {
    id: 'pending.no-cancels',
    t: 'no',
    pending: { kind: 'resetMatch', needsConfirm: true },
    expect: { kind: 'cancel' },
    expectPendingAfter: null,
  },
  {
    id: 'pending.no-red-is-a-command',
    t: 'no red',
    pending: { kind: 'newFrame', needsConfirm: true },
    expect: { kind: 'pot', value: 1, reds: 1 },
  },
  {
    id: 'pending.zh-confirm',
    t: '确认',
    lang: 'zh',
    pending: { kind: 'newFrame', needsConfirm: true },
    expect: { kind: 'confirm', intent: { kind: 'newFrame', needsConfirm: true } },
  },
  {
    id: 'pending.zh-cancel',
    t: '取消',
    lang: 'zh',
    pending: { kind: 'newFrame', needsConfirm: true },
    expect: { kind: 'cancel' },
  },

  // ---- round 3 / task-2 item 1: negation stripping ----
  { id: 'neg2.not-black-red', t: 'not the black, red', expect: { kind: 'pot', value: 1, reds: 1 } },
  { id: 'neg2.dont-pot-black', t: "don't pot the black", expect: null },
  { id: 'neg2.zh-buyao-black', t: '不要打黑球', lang: 'zh', expect: null },
  { id: 'neg2.zh-bie-black', t: '别打黑球', lang: 'zh', expect: null },
  // Clause-break interaction: the (?!stops) lookahead blocks the match at the negation, so the
  // negation survives and the later clause is lost. Documented as a suspected defect.
  { id: 'neg2.not-blue-then-yellow', t: 'not blue then yellow', expect: { kind: 'pot', value: 2, reds: 1 } },

  // ---- round 3 / task-2 item 2: player identification ----
  { id: 'who.player-one', t: 'player one concedes', expect: { kind: 'concede', who: 'A' } },
  { id: 'who.concede-alone', t: 'concede', expect: { kind: 'concede', who: null } },
  { id: 'who.zh-a', t: '玩家a认输', lang: 'zh', expect: { kind: 'concede', who: 'A' } },
  { id: 'who.zh-b', t: '玩家b认输', lang: 'zh', expect: { kind: 'concede', who: 'B' } },
  // Both players named: must never guess (null is checked, not a specific id)
  {
    id: 'who.both-named',
    t: 'player a or player b concedes',
    expect: { kind: 'concede', who: null },
  },

  // ---- round 4 / task-3 item 1: position-based negation ----
  { id: 'neg3.not-red-but-black', t: 'not red but black', expect: { kind: 'pot', value: 7, reds: 1 } },
  { id: 'neg3.not-black', t: 'not black', expect: null },
  { id: 'neg3.not-blue', t: 'not blue', expect: null },
  { id: 'neg3.no-pink', t: 'no pink', expect: null },
  { id: 'neg3.never-mind-black', t: 'never mind the black', expect: null },
  { id: 'neg3.not-yellow-then-blue', t: 'not yellow then blue', expect: { kind: 'pot', value: 5, reds: 1 } },
  { id: 'neg3.not-black-and-then-black', t: 'not black and then black', expect: null },
  { id: 'neg3.zh-bu-space-red', t: '不 红球', lang: 'zh', expect: null },
  { id: 'neg3.zh-red-then-black', t: '红球然后黑球', lang: 'zh', expect: { kind: 'pot', value: 1, reds: 1 } },
];

// ---------------------------------------------------------------------------
// STATIC PRE-CHECK. Used only when Node cannot be run at all (this workspace's
// pwsh is blocked). It is NOT a substitute for execution: it can prove a file
// is unrunnable, but it cannot prove any contract case passes.
// ---------------------------------------------------------------------------
function staticLint(html) {
  const findings = [];

  findings.push({
    level: html.includes(HEAD_MARKER) && html.includes(TAIL_MARKER) ? 'ok' : 'error',
    text:
      'markers: HEAD=' +
      html.includes(HEAD_MARKER) +
      ' TAIL=' +
      html.includes(TAIL_MARKER),
  });

  const versionMatch = html.match(/APP_VERSION\s*=\s*'([^']+)'/);
  findings.push({ level: 'info', text: 'APP_VERSION=' + (versionMatch ? versionMatch[1] : '?') });

  const parseVoiceMatch = html.match(/function\s+parseVoiceCommand\s*\(([^)]*)\)/);
  findings.push({
    level: parseVoiceMatch ? 'ok' : 'error',
    text: 'parseVoiceCommand declaration: ' + (parseVoiceMatch ? 'present' : 'MISSING'),
  });

  // Any non-ASCII arrow standing in for "=>" or a conditional is a parse-time break.
  const lines = html.split(/\r?\n/);
  const inScript = (i) => {
    const before = lines.slice(0, i).join('\n');
    return before.lastIndexOf('<script') > before.lastIndexOf('</script>');
  };
  lines.forEach((line, i) => {
    if (!inScript(i)) return;
    // Arrows inside comments are harmless — only flag executable code.
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    const m = line.match(/[\u2192\u21d2\u27f6\u2794\u279c\u27a1]/);
    if (m) {
      findings.push({
        level: 'error',
        text:
          'non-JS arrow "' +
          m[0] +
          '" (U+' +
          m[0].codePointAt(0).toString(16).toUpperCase() +
          ') at line ' +
          (i + 1) +
          ' -> SyntaxError, whole <script> fails to parse: ' +
          line.trim(),
      });
    }
  });

  // Free identifiers that are never declared anywhere in the file.
  const suspicious = ['voicePending', 'parsedWho', 'whoType', 'vWho'];
  for (const name of suspicious) {
    const re = new RegExp('\\b' + name + '\\b', 'g');
    const uses = (html.match(re) || []).length;
    const declared =
      new RegExp('(?:const|let|var|function)\\s+' + name + '\\b').test(html) ||
      new RegExp('(?:const|let|var)\\s+\\{[^}]*\\b' + name + '\\b').test(html);
    if (uses > 0 && !declared) {
      findings.push({
        level: 'error',
        text:
          'identifier "' +
          name +
          '" used ' +
          uses +
          'x but never declared -> ReferenceError at runtime on that path',
      });
    }
  }

  // Dead confirmation state: voicePending is read by parseVoiceCommand. It is only reachable
  // if some code path parks a non-null action in it.
  if (/voicePending\s*=\s*parkedAction/.test(html)) {
    findings.push({
      level: 'info',
      text: 'voicePending is parked by voiceAsk(...) -> the pending-confirmation branch is reachable',
    });
  } else {
    const pendingAssign = html.match(/voicePending\s*=\s*[^;\n]+/g) || [];
    const pendingNonNull = pendingAssign.filter(a => !/=\s*null\s*;?\s*$/.test(a.trim()));
    if (pendingAssign.length > 0 && pendingNonNull.length === 0) {
      findings.push({
        level: 'error',
        text:
          'voicePending is only ever assigned null (' +
          pendingAssign.length +
          ' assignment(s)) -> the pending-confirmation branch of parseVoiceCommand is unreachable in the app; it can only be tested by injecting state',
      });
    }
  }

  // Cross-scope call: a helper defined at script scope using a closure-local name.
  const voiceFindAt = html.indexOf('function voiceFindPlayer');
  if (voiceFindAt !== -1) {
    const body = html.slice(voiceFindAt, voiceFindAt + 1200);
    if (/(?:^|[^A-Za-z0-9_$])has\s*\(/.test(body.split('\n').slice(1).join('\n'))) {
      findings.push({
        level: 'error',
        text:
          'voiceFindPlayer() calls has(...) which is a local const inside parseVoiceCommand -> ReferenceError if reached',
      });
    }
    if (!/return\b/.test(body.split('// ===== VOICE COMMANDS END')[0])) {
      findings.push({ level: 'error', text: 'voiceFindPlayer() has no return statement' });
    }
  }

  // Round 4: the confirm gate must be able to skip itself for a parked (already confirmed)
  // intent, and the overlay must be removed before it throws on a broken DOM.
  if (/intent\.confirmed/.test(html) && /confirmed:\s*true/.test(html)) {
    findings.push({
      level: 'info',
      text: 'parked intents carry confirmed:true and the gate skips them -> no re-ask loop',
    });
  } else if (/function voiceAsk/.test(html)) {
    findings.push({
      level: 'error',
      text: 'voiceAsk exists but no parked intent carries confirmed:true -> an approved action can re-enter the gate',
    });
  }
  if (/function voiceRunPending/.test(html)) {
    findings.push({ level: 'info', text: 'voiceRunPending() runs and clears the park exactly once' });
  }
  if (/removeChild\(overlay\)[\s\S]{0,200}throw new Error\('voice confirm overlay is incomplete'\)/.test(html)) {
    findings.push({ level: 'info', text: 'voiceConfirm removes the overlay before throwing' });
  } else if (/voice confirm overlay is incomplete/.test(html)) {
    findings.push({ level: 'error', text: 'voiceConfirm throws without removing the overlay first' });
  }

  // Drift check: voice_parser_test.html embeds a copy of the parser. A copy that has drifted
  // gives false confidence, so compare the two shared helpers function-by-function.
  try {
    const testPath = path.join(path.dirname(htmlPath), 'voice_parser_test.html');
    if (fs.existsSync(testPath)) {
      const page = fs.readFileSync(testPath, 'utf8');
      const strip = (s) =>
        s
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/[^\n]*/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      const grab = (src, name) => {
        const at = src.indexOf('function ' + name + '(');
        if (at === -1) return null;
        let depth = 0;
        let started = false;
        for (let i = at; i < src.length; i += 1) {
          const ch = src[i];
          if (ch === '{') {
            depth += 1;
            started = true;
          } else if (ch === '}') {
            depth -= 1;
            if (started && depth === 0) return src.slice(at, i + 1);
          }
        }
        return null;
      };
      for (const fn of ['voiceDropNegated', 'voiceFindPlayer', 'voiceNormalize', 'voiceZhNumber']) {
        const a = grab(html, fn);
        const b = grab(page, fn);
        if (!a || !b) {
          findings.push({ level: 'warn', text: 'drift check: ' + fn + ' not found in both files' });
        } else if (strip(a) !== strip(b)) {
          findings.push({
            level: 'error',
            text: 'DRIFT: voice_parser_test.html/' + fn + '() differs from snooker_scoreboard.html',
          });
        } else {
          findings.push({ level: 'info', text: 'drift check: ' + fn + '() matches the test page' });
        }
      }
      // Name resolution is the one place the page cannot simply call the same helper: it
      // stubs the concede intent, so flag it for human review rather than failing silently.
      if (/kind:\s*'concede',\s*who:\s*null/.test(page) && !/who:\s*voiceFindPlayer/.test(page)) {
        findings.push({
          level: 'warn',
          text:
            'voice_parser_test.html hardcodes {kind:"concede", who:null} while the app calls voiceFindPlayer -> the page cannot catch concede-name regressions (NAME_CASES covers voiceFindPlayer in isolation)',
        });
      }
    }
  } catch (err) {
    findings.push({ level: 'warn', text: 'drift check skipped: ' + err.message });
  }

  const errors = findings.filter((f) => f.level === 'error');
  console.log('=== STATIC PRE-CHECK (cannot substitute for execution) ===');
  for (const f of findings) console.log('[' + f.level.toUpperCase() + '] ' + f.text);
  console.log('static pre-check errors: ' + errors.length);
  console.log('');
  return { findings, errors };
}

// ---------------------------------------------------------------------------
// Run.
// ---------------------------------------------------------------------------
function main() {
  const results = [];
  let html;
  try {
    html = fs.readFileSync(htmlPath, 'utf8');
  } catch (err) {
    console.error('HARNESS ERROR: cannot read ' + htmlPath + ': ' + err.message);
    process.exit(2);
  }

  const lint = staticLint(html);

  let loaded;
  try {
    loaded = loadParser(html);
  } catch (err) {
    console.error('HARNESS ERROR: ' + err.message);
    console.error('\nThe additive voice block is not present/parseable in the HTML,');
    console.error('so NO contract case could be executed. This is NOT a test failure.');
    if (err.message.includes('marker not found')) {
      console.error('\nDetected source state:');
      console.error('  HEAD marker present: ' + html.includes(HEAD_MARKER));
      console.error('  TAIL marker present: ' + html.includes(TAIL_MARKER));
      console.error('  parseVoiceCommand present: ' + /function\s+parseVoiceCommand/.test(html));
    }
    process.exit(2);
  }

  console.log('=== voice_parser_verify.js ===');
  console.log('HTML      : ' + htmlPath);
  console.log('script len: ' + loaded.bodyLength + ' chars');
  console.log(
    'parser    : ' +
      (loaded.parse ? 'reachable via parseVoiceCommand' : 'NOT FOUND / NOT EXPORTED')
  );
  if (loaded.parseFnSource) {
    console.log('signature : parseVoiceCommand(' + loaded.parseFnSource[1] + ')');
  }
  if (loaded.bootError) {
    console.log(
      'boot note : script threw during page boot (DOM stub limitation) -> ' +
        loaded.bootError.message
    );
  }
  console.log('');

  if (!loaded.parse) {
    console.log('CANNOT EXECUTE: parseVoiceCommand was not reachable.');
    console.log('Every contract case below is UNVERIFIED.');
    process.exit(2);
  }

  for (const c of CASES) {
    const label = c.lang ? c.t + " [lang='" + c.lang + "']" : c.t;
    let actual;
    let threw = null;
    let pendingNote = '';
    // Cases that need a pending intent are only meaningful if the bridge exists.
    if (c.pending !== undefined) {
      if (!loaded.pendingBridge) {
        results.push({
          id: c.id,
          label,
          ok: true,
          skipped: true,
          actual: 'SKIPPED',
          detail: 'voicePending bridge unavailable — could not inject pending state',
        });
        console.log(
          'SKIP ' + c.id.padEnd(28) + ' "' + label + '"  (voicePending bridge unavailable)'
        );
        continue;
      }
      loaded.pendingBridge.set(c.pending);
    }
    try {
      actual = c.lang ? loaded.parse(c.t, c.lang) : loaded.parse(c.t);
    } catch (err) {
      threw = err;
    }
    if (c.pending !== undefined && loaded.pendingBridge) {
      const after = loaded.pendingBridge.get();
      if (c.expectPendingAfter !== undefined) {
        if (after !== c.expectPendingAfter) {
          pendingNote =
            '; voicePending after = ' + show(after) + ' (expected ' + show(c.expectPendingAfter) + ')';
        }
      } else {
        pendingNote = '; voicePending after = ' + show(after);
      }
    }

    let ok;
    let detail = '';
    if (threw) {
      ok = false;
      detail = 'THREW ' + threw.name + ': ' + threw.message;
    } else if (c.expect === null) {
      ok = actual === null || actual === undefined;
      if (!ok) detail = 'expected null, got ' + show(actual);
    } else {
      const problems = describeMismatch(actual, c.expect);
      ok = problems.length === 0;
      if (!ok) detail = problems.join('; ');
      if (ok && typeof c.constraint === 'function') {
        const violation = c.constraint(actual);
        if (violation) {
          ok = false;
          detail = violation;
        }
      }
    }

    if (pendingNote) {
      if (pendingNote.indexOf('(expected') !== -1) {
        ok = false;
      }
      if (!ok) detail = (detail ? detail + '; ' : '') + pendingNote.replace(/^; /, '');
      else detail = pendingNote.replace(/^; /, '');
    }

    results.push({
      id: c.id,
      label,
      ok,
      actual: threw ? 'THREW ' + threw.message : actual,
      detail,
    });
    const verdict = ok ? 'PASS' : 'FAIL';
    console.log(
      verdict.padEnd(4) +
        ' ' +
        c.id.padEnd(28) +
        ' "' +
        label +
        '"' +
        (c.note ? '  (' + c.note + ')' : '')
    );
    console.log('       actual: ' + (threw ? 'THREW ' + threw.message : show(actual)));
    if (!ok) console.log('       reason: ' + detail);
    else if (pendingNote) console.log('       note: ' + detail);
  }

  const skipped = results.filter((r) => r.skipped);
  const failed = results.filter((r) => !r.ok && !r.skipped);
  const passed = results.length - skipped.length - failed.length;
  console.log('');
  console.log(
    'SUMMARY: ' +
      passed +
      '/' +
      (results.length - skipped.length) +
      ' PASS, ' +
      failed.length +
      ' FAIL' +
      (skipped.length ? ', ' + skipped.length + ' SKIPPED' : '')
  );
  if (failed.length) {
    console.log('FAILING CASES:');
    for (const f of failed) {
      console.log('  - ' + f.id + ' ("' + f.label + '") actual=' + show(f.actual) + ' :: ' + f.detail);
    }
  }
  process.exit(failed.length ? 1 : 0);
}

main();
