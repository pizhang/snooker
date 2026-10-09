'use strict';

/**
 * Harness for snooker_scoreboard.html regression tests.
 *
 * The board is one self-contained HTML file whose <script> keeps everything inside an IIFE,
 * so tests load that script into a node:vm context with a small DOM stub and then drive the
 * board exactly the way a browser does: element.onclick(), getElementById(), localStorage.
 *
 * Nothing here is test-specific: the stub implements the DOM surface the board actually uses.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BOARD_FILE = path.join(__dirname, 'snooker_scoreboard.html');

function createClassList() {
  const set = new Set();
  return {
    add: (...names) => names.forEach(n => set.add(n)),
    remove: (...names) => names.forEach(n => set.delete(n)),
    toggle(name, force) {
      const on = force === undefined ? !set.has(name) : !!force;
      if (on) set.add(name); else set.delete(name);
      return on;
    },
    contains: name => set.has(name),
    toString: () => Array.from(set).join(' '),
  };
}

function createElement(id) {
  const el = {
    id,
    tagName: 'DIV',
    _html: '',
    textContent: '',
    className: '',
    title: '',
    disabled: false,
    style: {},
    value: '',
    parentNode: null,
    children: [],
    dataset: {},
    attributes: {},
    listeners: {},
    classList: createClassList(),
    // The board builds dialogs by assigning innerHTML, so the stub turns each <button id="…">
    // into a real child element. Without this the overlay path is untestable and every
    // confirmation silently takes the confirm() fallback, which a browser never does.
    get innerHTML() { return this._html; },
    set innerHTML(markup) {
      this._html = String(markup);
      this.children = [];
      const tags = this._html.matchAll(/<([a-z]+)((?:\s+[a-z-]+="[^"]*")*)\s*>/gi);
      for (const tag of tags) {
        const child = createElement('');
        child.tagName = tag[1].toUpperCase();
        if (tag[2]) {
          tag[2].matchAll(/([a-z-]+)="([^"]*)"/gi).forEach(([, name, value]) => {
            if (name.toLowerCase() === 'id') child.id = value;
            child.setAttribute(name, value);
          });
        }
        child.parentNode = this;
        this.children.push(child);
      }
    },
    getAttribute(name) { return this.attributes[name] === undefined ? null : this.attributes[name]; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    removeAttribute(name) { delete this.attributes[name]; },
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    removeEventListener() {},
    dispatch(type, event) { (this.listeners[type] || []).forEach(fn => fn(event || { target: this })); },
    click() { this.dispatch('click', { target: this }); },
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
    removeChild(child) {
      this.children = this.children.filter(c => c !== child);
      child.parentNode = null;
      return child;
    },
    remove() { if (this.parentNode) this.parentNode.removeChild(this); },
    focus() {}, select() {}, blur() { this.dispatch('blur', { target: this }); },
    querySelector(selector) { return this._find(selector)[0] || null; },
    querySelectorAll(selector) { return this._find(selector); },
    // Minimal matching for the selectors the board uses on dynamically created nodes
    _find(selector) {
      const results = [];
      const walk = node => {
        node.children.forEach(child => {
          const s = selector.trim();
          const idMatch = s.match(/^#([\w-]+)$/);
          const attrMatch = s.match(/^\[([\w-]+)\]$/);
          const tagMatch = s.match(/^([a-z]+)$/i);
          if (idMatch && child.id === idMatch[1]) results.push(child);
          else if (attrMatch && child.attributes[attrMatch[1]] !== undefined) results.push(child);
          else if (tagMatch && String(child.tagName).toLowerCase() === tagMatch[1].toLowerCase()) results.push(child);
          walk(child);
        });
      };
      walk(this);
      return results;
    },
  };
  return el;
}

function loadBoard(options = {}) {
  const file = options.file || BOARD_FILE;
  const html = fs.readFileSync(file, 'utf8');
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('No <script> block found in ' + file);
  let script = match[1];

  // The board is one IIFE, so its declarations are NOT reachable from a later vm program.
  // The export line therefore has to be injected INSIDE the closure, just before it closes.
  const EXPORT = `
        globalThis.__board = {
            parseVoiceCommand, executeVoiceCommand, state, render, undo, newFrame, resetMatch,
            addPoints, takeShot, handOverTo, applyFoul, concedeFrame, setLanguage,
            canPotColor, canTakeShot, updateVoiceChip, showVoiceHelp,
            voiceStatus: () => voiceStatus, voicePending: () => voicePending,
            setVoicePending: value => { voicePending = value; },
            voiceConfirmInFlight: () => voiceConfirmInFlight,
            voiceMuted: () => voiceMuted, voiceMutedFlag: () => voiceMuted,
            setVoiceMutedFlag: value => { voiceMuted = !!value; },
            voiceArmed: () => voiceArmed, setVoiceArmed: value => { voiceArmed = !!value; },
            setVoiceRestartDelay: value => { voiceRestartDelay = value; voiceSilenceDelay = value; },
            setVoiceMaxRestarts: value => { voiceMaxRestarts = value; },
            voiceListening: () => voiceListening, voiceAwaitAnswer: () => voiceAwaitAnswer, voiceSupported: () => voiceSupported,
            voiceRestarts: () => voiceRestarts, voiceRestartTimer: () => voiceRestartTimer,
            restartDelay: () => voiceRestartDelay,
            voiceSessionActive: () => voiceSessionActive,
            // Tests that push a transcript straight in are not going through the speech layer, so
            // they must also clear its per-utterance dedupe guards
            resetVoiceTurn: () => { voiceLastExecuted = ''; voiceHandledIndex = -1; voiceHeardSomething = true; },
            bindVoice, startVoiceListening, stopVoiceListening, toggleVoiceMute,
            VOICE_VOCAB, I18N
        };
`;
  const injection = script.match(/\n(\s*)init\(\);\s*\}\)\(\);/);
  if (!injection) {
    throw new Error('Could not find the init() call at the end of the board script in ' + file);
  }
  script = script.replace(injection[0], `\n${injection[1]}init();\n${EXPORT}${injection[1]}})();`);

  const elements = {};
  const element = id => (elements[id] = elements[id] || createElement(id));

  // Real button grids from the markup: 8 ball buttons per player
  const ballButtons = [];
  ['A', 'B'].forEach(player => {
    [['1', 1], ['1', 2], ['2', 2], ['3', 3], ['4', 4], ['5', 5], ['6', 6], ['7', 7]].forEach(([value, reds]) => {
      const btn = createElement(`btn${player}${value}${reds}`);
      btn.tagName = 'BUTTON';
      btn.setAttribute('data-player', player);
      btn.setAttribute('data-value', value);
      if (value === '1' && reds === 2) btn.setAttribute('data-reds', '2');
      ballButtons.push(btn);
    });
  });

  const colorBalls = ['yellow', 'green', 'brown', 'blue', 'pink', 'black'].map((color, i) => {
    const ball = createElement('ball-' + color);
    ball.setAttribute('data-color', color);
    ball.setAttribute('data-value', String(i + 2));
    return ball;
  });

  const document = {
    documentElement: createElement('html'),
    body: createElement('body'),
    title: '',
    getElementById(id) { return element(id); },
    createElement(tag) {
      // brokenOverlay forces the confirm() fallback path, which a working DOM never takes.
      // It must not block the plain elements the board creates elsewhere (the name input), so
      // only dialog containers fail.
      if (options.brokenOverlay && String(tag).toLowerCase() === 'div') {
        throw new Error('createElement unavailable (forced for tests)');
      }
      const el = createElement('created');
      el.tagName = String(tag).toUpperCase();
      return el;
    },
    querySelectorAll(selector) {
      if (selector === '.btn-grid .btn') return ballButtons;
      if (selector === '.color-ball') return colorBalls;
      if (selector === '.lang-chip') {
        const en = createElement('lang-en'); en.setAttribute('data-lang', 'en');
        const zh = createElement('lang-zh'); zh.setAttribute('data-lang', 'zh');
        return [en, zh];
      }
      if (selector === '[data-i18n]' || selector === '[data-i18n-title]') return [];
      return [];
    },
    addEventListener() {},
  };

  const storage = new Map();
  const localStorage = {
    getItem: key => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
    clear: () => storage.clear(),
    _store: storage,
  };

  // Optional Web Speech API stub so the voice path can be driven end to end
  const speech = { instances: [] };
  function FakeRecognition() {
    const instance = {
      lang: '',
      continuous: false,
      interimResults: false,
      maxAlternatives: 1,
      started: 0,
      stopped: 0,
      aborted: 0,
      onresult: null,
      onend: null,
      onerror: null,
      start() { this.started += 1; },
      stop() { this.stopped += 1; },
      abort() { this.aborted += 1; },
    };
    speech.instances.push(instance);
    return instance;
  }

  // The board uses the browser's SpeechRecognition only; no other stub is needed here.

  const window = {
    SpeechRecognition: options.noSpeech ? undefined : FakeRecognition,
    webkitSpeechRecognition: undefined,
    confirm: options.confirm,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };

  const navigatorOb = {
    language: options.language || 'en-GB',
    // Arm/disarm goes through getUserMedia, so the chip click needs a microphone to answer
    mediaDevices: {
      getUserMedia() {
        if (options.micGranted === false) {
          return Promise.reject(new Error('Permission denied'));
        }
        const track = { stop() {} };
        return Promise.resolve({ getTracks: () => [track] });
      },
    },
  };

  const context = {
    window,
    document,
    navigator: navigatorOb,
    console: options.quiet ? { log() {}, warn() {}, error() {} } : console,
    localStorage,
    confirm: options.confirm || (() => true),
    alert() {},
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Promise,
  };
  context.globalThis = context;

  vm.createContext(context);
  vm.runInContext(script, context);

  const board = context.__board;
  if (!board) throw new Error('The board script did not expose __board — check the export injection');
  board.document = document;
  board.window = window;
  board.localStorage = localStorage;
  board.speech = speech;
  board.ballButtons = ballButtons;
  board.elements = elements;
  board.element = element;
  board.setName = (player, name) => {
    // render() rewrites the name label, so ask the board to redraw before editing
    board.render();
    const el = element(player === 'A' ? 'nameA' : 'nameB');
    el.click();
    const input = el.children[0];
    if (!input) throw new Error('name input was not created for ' + player);
    input.value = name;
    input.dispatch('blur');
  };
  board.clickBall = (player, value, reds) => {
    const btn = ballButtons.find(b =>
      b.getAttribute('data-player') === player &&
      b.getAttribute('data-value') === String(value) &&
      Number(b.getAttribute('data-reds') || 1) === (reds || 1));
    if (!btn) throw new Error(`no ball button ${player} ${value} reds=${reds || 1}`);
    btn.click();
  };
  board.setVoiceMuted = (value = true) => {
    if (value === false) {
      board.setVoiceArmed(false);
      board.setVoiceMutedFlag(true);
    } else {
      board.setVoiceArmed(true);
      board.setVoiceMutedFlag(false);
    }
    // Keep the restart gap short in tests, but not zero: zero hides scheduling mistakes
    board.setVoiceRestartDelay(10);
  };
  board.score = player => board.state[player];
  board.transcript = text => {
    board.resetVoiceTurn();
    return board.executeVoiceCommand(board.parseVoiceCommand(text, 'en'));
  };
  board.zhTranscript = text => {
    board.resetVoiceTurn();
    return board.executeVoiceCommand(board.parseVoiceCommand(text, 'zh'));
  };
  return board;
}

module.exports = { loadBoard, createElement, createClassList, BOARD_FILE };
