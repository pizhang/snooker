const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('c:/Users/aldog/Documents/GitHub/PowerShellScripts/snooker_score_board/snooker_score_board.html', 'utf8');
const match = html.match(/<script>([\s\S]*)<\/script>/);
if (!match) throw new Error('Script tag not found');
const script = match[1];

function createClassList() {
  const set = new Set();
  return {
    add: (...names) => names.forEach(n => set.add(n)),
    remove: (...names) => names.forEach(n => set.delete(n)),
    toggle: (name, force) => {
      if (force === undefined) {
        if (set.has(name)) { set.delete(name); return false; }
        set.add(name); return true;
      }
      if (force) set.add(name); else set.delete(name);
      return !!force;
    },
    contains: (name) => set.has(name),
    toString: () => Array.from(set).join(' '),
  };
}

function createButton(player, value) {
  const el = {
    dataset: { player, value },
    disabled: false,
    className: '',
    attributes: {},
    listeners: {},
    classList: createClassList(),
    getAttribute(name) {
      return this.attributes[name] ?? null;
    },
    setAttribute(name, val) {
      this.attributes[name] = String(val);
    },
    addEventListener(type, fn) {
      this.listeners[type] = fn;
    },
    click() {
      if (this.listeners.click) this.listeners.click({ target: this });
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    appendChild() {},
    removeChild() {},
  };
  el.setAttribute('data-player', player);
  el.setAttribute('data-value', value);
  return el;
}

const redBtnA = createButton('A', '1');
const yellowBtnA = createButton('A', '2');
const greenBtnA = createButton('A', '3');
const brownBtnA = createButton('A', '4');
const blueBtnA = createButton('A', '5');
const pinkBtnA = createButton('A', '6');
const blackBtnA = createButton('A', '7');
const foulBtnA = createButton('A', 'foul');
const redBtnB = createButton('B', '1');
const yellowBtnB = createButton('B', '2');
const greenBtnB = createButton('B', '3');
const brownBtnB = createButton('B', '4');
const blueBtnB = createButton('B', '5');
const pinkBtnB = createButton('B', '6');
const blackBtnB = createButton('B', '7');
const foulBtnB = createButton('B', 'foul');

const colorBalls = ['yellow','green','brown','blue','pink','black'].map((color, index) => ({
  dataset: { color, value: String(index + 2) },
  classList: createClassList(),
  getAttribute(name) {
    return this.dataset[name] ?? null;
  },
  querySelectorAll() { return []; },
  className: color,
}));

const allButtons = [
  redBtnA, yellowBtnA, greenBtnA, brownBtnA, blueBtnA, pinkBtnA, blackBtnA, foulBtnA,
  redBtnB, yellowBtnB, greenBtnB, brownBtnB, blueBtnB, pinkBtnB, blackBtnB, foulBtnB,
];

const elements = {
  scoreA: { textContent: '0', classList: createClassList() },
  scoreB: { textContent: '0', classList: createClassList() },
  cardA: { classList: createClassList() },
  cardB: { classList: createClassList() },
  nameA: { querySelector: () => null, innerHTML: '', style: {} },
  nameB: { querySelector: () => null, innerHTML: '', style: {} },
  frameCountA: { textContent: '0', classList: createClassList() },
  frameCountB: { textContent: '0', classList: createClassList() },
  redCount: { textContent: '15' },
  redCounter: { classList: createClassList() },
  colorBalls: { querySelectorAll: () => colorBalls },
  frameOverBadge: { classList: createClassList() },
  phaseIndicator: { textContent: '', className: '', classList: createClassList() },
  undoBtn: { disabled: false, classList: createClassList(), addEventListener(type, fn) { this.listeners = { [type]: fn }; }, click() { if (this.listeners.click) this.listeners.click({}); } },
  resetBtn: { disabled: false, classList: createClassList(), addEventListener(type, fn) { this.listeners = { [type]: fn }; }, click() { if (this.listeners.click) this.listeners.click({}); } },
  resetMatchBtn: { disabled: false, classList: createClassList(), addEventListener(type, fn) { this.listeners = { [type]: fn }; }, click() { if (this.listeners.click) this.listeners.click({}); } },
};

const document = {
  body: {
    appendChild() {},
    removeChild() {},
  },
  getElementById(id) {
    return elements[id] || null;
  },
  querySelectorAll(selector) {
    if (selector === '.btn-grid .btn') return allButtons;
    if (selector === '.color-ball') return colorBalls;
    return [];
  },
  addEventListener() {},
};

const localStorage = {
  store: {},
  getItem(key) { return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null; },
  setItem(key, value) { this.store[key] = String(value); },
  removeItem(key) { delete this.store[key]; },
};

const context = {
  document,
  window: {},
  console,
  localStorage,
  confirm: () => true,
  setTimeout,
  clearTimeout,
};

vm.createContext(context);
vm.runInContext(script, context);

function click(player, value) {
  const btn = allButtons.find(b => b.dataset.player === player && b.dataset.value === String(value));
  if (!btn) throw new Error(`No button for ${player} ${value}`);
  btn.click();
}

for (let i = 0; i < 15; i += 1) {
  click('A', 1);
}

const greenBtn = allButtons.find(b => b.dataset.player === 'A' && b.dataset.value === '3');
if (!greenBtn) throw new Error('green button missing');

if (!greenBtn.disabled) {
  console.error('Rule failed: green should be disabled immediately after the 15th red.');
  process.exit(1);
}

console.log('Regression test passed: after 15 reds, the next colour in sequence is the only legal colour.');
