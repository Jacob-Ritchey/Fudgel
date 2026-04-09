// ── Fudgel app — main wiring ──────────────────────────────────────────────────

// ── Default sources ───────────────────────────────────────────────────────────

const DEFAULT_BIJA_SOURCE = `@Bija
@Ehto

(── Item templates ────────────────────────────────────────────────────────────)

TemplateWeapon;
    damage: 0
    speed: 1

TemplateConsumable;
    heal: 0
    uses: 1

(── Config ────────────────────────────────────────────────────────────────────)

Config;
    maxHealth: 200 {immutable}
    critBase: 60 {immutable, locked}
    armorBase: 10 {immutable}

(── Hero ──────────────────────────────────────────────────────────────────────)

Hero;
    name: Kael
    health: 180 {required}
    mana: 90 {required}
    attack: 22
    defense: 8
    luck: 14
    maxHealth: =Config.maxHealth
    target: #Boss.name
    motto: [Fortune favours the bold.]
    sword;
        damage: 28
        speed: 2
        enchant: fire
    bag;
        potions: -
            healthPotion
            manaPotion
            elixir
        traits: *
            brave
            swift
            focused
        activeSpell: #potions.0

(── Boss ──────────────────────────────────────────────────────────────────────)

Boss;
    name: Vareth
    health: 160 {required}
    defense: 17
    enraged: 0
    phase: 1

(── Battle ────────────────────────────────────────────────────────────────────)

Battle;
    round: 1
    lastDmg: 0
    xp: 0
    turnOrder: =Hero.attack
    bossName: #Boss.name

(── Gear: template instantiations ────────────────────────────────────────────)

IronSword: #TemplateWeapon | 18, 3 |;
ElixirFlask: #TemplateConsumable | 40, 2 |;

(── Arena spawn: bare entity + positional ─────────────────────────────────────)

Arena | crypt, floor_2 |;

(── Enemy wave: multiplier ────────────────────────────────────────────────────)

Wave;
    minions: #Boss !4
    elites: #Boss !2 | Zareth, 90, 22 |
`;

const DEFAULT_RUMUS_SOURCE = `@Rumus

(── Roll vs defense: did the hit connect? Shows >=, != ───────────────────────)

? hitCheck{roll, defense};
    threshold: defense - 5
    clean: roll != defense
    hit: roll >= threshold ? 1 : 0
    ~hit

(── Crit probability: luck-scaled. Shows +, *, >, &, | ──────────────────────)

? critCheck{luck, roll};
    chance: 60 + luck
    highRoll: roll * 6 > chance ? 1 : 0
    luckyRoll: luck > 20 ? 1 : 0
    crits: highRoll & luckyRoll ? 1 : 0
    anyBonus: highRoll | luckyRoll
    ~crits

(── Strike: crit multiplier and armor reduction. Shows -, *, =, %, ! ─────────)

? strikeCalc{baseDmg, armor, isCrit};
    reduced: baseDmg - armor
    notCrit: !isCrit
    overflow: reduced % 10
    multiplied: isCrit = 1 ? reduced * 2 : reduced
    dmg: multiplied < 1 ? 1 : multiplied
    ~dmg

(── Apply damage to target health. Shows -, <, unary - ───────────────────────)

? takeDamage{health, dmg};
    result: health - dmg
    remaining: result < 0 ? 0 : result
    overkill: remaining = 0 ? -dmg : 0
    ~remaining

(── Phase check: enraged and critical states. Shows /, <=, ->, <->, !& ───────)

? phaseCheck{health, maxHp};
    half: maxHp / 2
    third: maxHp / 3
    enraged: health <= half ? 1 : 0
    critical: health <= third ? 1 : 0
    critical -> enraged
    critical <-> health <= third
    critical !& !enraged
    phase: enraged + 1
    ~phase

(── XP with decay. Shows >, <, ^, !|, <- ─────────────────────────────────────)

? xpGain{dmg, round};
    base: dmg * 10
    decay: round / 2
    xp: base - decay
    hasXp: xp > 0
    maxed: xp > 999
    losing: xp < 0
    hasXp ^ maxed
    losing !| maxed
    hasXp <- dmg > 0
    ~xp
`;

const DEFAULT_VIESTI_SOURCE = `@Viesti

(── Sequential: seed the hit check ────────────────────────────────────────────)

Hero.luck ~ hitCheck.roll

(── Parallel cluster: crit check (with nested sub-parallel) + armor lookup ─────)

Hero.luck ~~ critCheck.luck
    Battle.round ~ critCheck.roll
    Hero.attack ~~ strikeCalc.baseDmg
    Config.armorBase ~~ strikeCalc.armor
    critCheck ~ strikeCalc.isCrit
Boss.health ~~ takeDamage.health
    strikeCalc ~ takeDamage.dmg

(── Barrier: wait for both top-level threads ───────────────────────────────────)

(── Sequential: apply damage ───────────────────────────────────────────────────)

takeDamage ~ Boss.health

(── Sequential: phase transition ───────────────────────────────────────────────)

Boss.health ~ phaseCheck.health
Config.maxHealth ~ phaseCheck.maxHp
phaseCheck ~ Boss.phase

(── Dormant: xp formula runs but output not yet wired to target ───────────────)

Battle.lastDmg ~ xpGain.dmg
Battle.round ~ xpGain.round
xpGain ~
`;

const DEFAULT_ALL_SOURCE = DEFAULT_BIJA_SOURCE + '\n' + DEFAULT_RUMUS_SOURCE + '\n' + DEFAULT_VIESTI_SOURCE;

// ── State ─────────────────────────────────────────────────────────────────────

let currentMode   = 'bija'; // 'bija' | 'rumus' | 'viesti' | 'all'
let unifiedSource = DEFAULT_ALL_SOURCE; // single source of truth
let lastParsed    = null;
let lastExpanded  = null;   // array of expanded Bija sections
let lastRumus     = null;   // { functions, errors }
let lastViesti    = null;   // { signals, errors }
let debounceTimer = null;

// ── Section split / join utilities ───────────────────────────────────────────

const _BIJA_HEADERS  = new Set(['Bija', 'Ehto', 'Primi']);
const _RUMUS_HEADERS = new Set(['Rumus']);
const _VI_HEADERS    = new Set(['Viesti']);

function splitUnified(source) {
  const buckets = { bija: [], rumus: [], viesti: [] };
  let cur = null;
  for (const line of source.split('\n')) {
    const m = line.match(/^@(\w+)/);
    if (m) {
      const n = m[1];
      cur = _BIJA_HEADERS.has(n) ? 'bija' : _RUMUS_HEADERS.has(n) ? 'rumus' : _VI_HEADERS.has(n) ? 'viesti' : null;
    }
    if (cur) buckets[cur].push(line);
  }
  return {
    bija:   buckets.bija.join('\n'),
    rumus:  buckets.rumus.join('\n'),
    viesti: buckets.viesti.join('\n'),
  };
}

function joinUnified(parts) {
  return [parts.bija, parts.rumus, parts.viesti]
    .filter(s => s && s.trim())
    .join('\n\n');
}

// ── Parse + render pipeline ───────────────────────────────────────────────────

function onSourceChange(editedText) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    // Splice the edited section back into the unified source
    if (currentMode === 'all') {
      unifiedSource = editedText;
    } else {
      const parts = splitUnified(unifiedSource);
      parts[currentMode] = editedText;
      unifiedSource = joinUnified(parts);
    }

    // Always parse all three DSLs from the full unified source
    lastParsed   = parseFudgelFile(unifiedSource);
    lastExpanded = expandFile(lastParsed);
    lastRumus    = parseRumusFile(unifiedSource);
    lastViesti   = parseViestiFile(unifiedSource);

    _renderCurrentMode();
    renderErrors([...lastParsed.errors, ...lastRumus.errors, ...lastViesti.errors]);
  }, 150);
}

function _renderCurrentMode() {
  switch (currentMode) {
    case 'bija':
      renderSchema({ sections: lastExpanded }, 'bija');
      renderExpanded(lastExpanded);
      break;
    case 'rumus':
      renderRumusSchema(lastRumus.functions);
      renderRumusExpanded(lastRumus.functions);
      break;
    case 'viesti':
      renderViestiSchema(lastViesti.signals);
      renderViestiExpanded(splitUnified(unifiedSource).viesti);
      updateCount(`${lastViesti.signals.length} signal${lastViesti.signals.length !== 1 ? 's' : ''}`);
      break;
    case 'all':
      renderAllSchema(lastExpanded, lastRumus.functions, lastViesti.signals);
      renderCombinedExpanded(lastExpanded, lastRumus.functions, unifiedSource);
      break;
  }
}

// ── Expanded panels ───────────────────────────────────────────────────────────

function renderExpanded(expandedSections) {
  const pre = document.getElementById('expanded-code');
  if (!pre) return;
  pre.innerHTML = expandedToHtml(expandedSections);
}

function renderRumusExpanded(functions) {
  const pre = document.getElementById('expanded-code');
  if (!pre) return;
  pre.innerHTML = rumusToHtml(functions);
}

function renderCombinedExpanded(expandedSections, functions, viestiSource) {
  const pre = document.getElementById('expanded-code');
  if (!pre) return;
  // viestiToHtml renders ALL lines it receives, not just @Viesti —
  // extract only the @Viesti section to avoid duplicating @Bija/@Rumus content.
  let viesti = '';
  if (viestiSource) {
    const idx = viestiSource.indexOf('@Viesti');
    const viestiOnly = idx >= 0 ? viestiSource.slice(idx) : '';
    if (viestiOnly) viesti = '\n' + viestiToHtml(viestiOnly);
  }
  pre.innerHTML = expandedToHtml(expandedSections) + '\n' + rumusToHtml(functions) + viesti;
}

// ── Error panel ───────────────────────────────────────────────────────────────

function renderErrors(errors) {
  const panel = document.getElementById('error-panel');
  panel.innerHTML = '';

  if (errors.length === 0) {
    panel.className = 'ok';
    panel.textContent = '✓ No errors';
    return;
  }

  panel.className = '';

  const toggle = document.createElement('button');
  toggle.id = 'error-toggle';

  const countLabel = document.createElement('span');
  countLabel.className = 'error-count-label';
  countLabel.textContent = `⚠ ${errors.length} ${errors.length === 1 ? 'error' : 'errors'}`;

  const chevron = document.createElement('span');
  chevron.textContent = '▾';

  toggle.appendChild(countLabel);
  toggle.appendChild(chevron);
  panel.appendChild(toggle);

  const list = document.createElement('div');
  list.id = 'error-list';

  for (const err of errors) {
    const row = document.createElement('div');
    row.className = 'error-row';
    row.innerHTML = `
      <span class="error-line">L${err.line}</span>
      <span class="error-msg">${escapeHtml(err.message)}</span>
    `;
    list.appendChild(row);
  }

  toggle.addEventListener('click', () => {
    const hidden = list.style.display === 'none';
    list.style.display = hidden ? '' : 'none';
    chevron.textContent  = hidden ? '▾' : '▸';
  });

  panel.appendChild(list);
}

// ── Mode tabs (Bija | Rumus | Viesti | All) ───────────────────────────────────

function initModeTabs() {
  const btnBija   = document.getElementById('btn-mode-bija');
  const btnRumus  = document.getElementById('btn-mode-rumus');
  const btnViesti = document.getElementById('btn-mode-viesti');
  const btnAll    = document.getElementById('btn-mode-all');
  const expandedLabel = document.getElementById('expanded-label');
  const schemaLabel   = document.getElementById('schema-label');
  const app           = document.getElementById('app');

  const allBtns = [btnBija, btnRumus, btnViesti, btnAll];

  function setActive(btn) {
    allBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }

  function switchToBija() {
    currentMode = 'bija';
    setActive(btnBija);
    expandedLabel.textContent = 'Expanded Bija';
    schemaLabel.textContent   = 'Visual Schema';
    app.dataset.mode = 'bija';
    if (typeof monaco !== 'undefined') monaco.editor.setTheme('bija-dark');
    if (window._fudgelEditor) window._fudgelEditor.setValue(splitUnified(unifiedSource).bija);
  }

  function switchToRumus() {
    currentMode = 'rumus';
    setActive(btnRumus);
    expandedLabel.textContent = 'Expanded Rumus';
    schemaLabel.textContent   = 'Function Cards';
    app.dataset.mode = 'rumus';
    if (typeof monaco !== 'undefined') monaco.editor.setTheme('rumus-dark');
    if (window._fudgelEditor) window._fudgelEditor.setValue(splitUnified(unifiedSource).rumus);
  }

  function switchToViesti() {
    currentMode = 'viesti';
    setActive(btnViesti);
    expandedLabel.textContent = 'Expanded Viesti';
    schemaLabel.textContent   = 'Signal Rail';
    app.dataset.mode = 'viesti';
    if (typeof monaco !== 'undefined') monaco.editor.setTheme('viesti-dark');
    if (window._fudgelEditor) window._fudgelEditor.setValue(splitUnified(unifiedSource).viesti);
  }

  function switchToAll() {
    currentMode = 'all';
    setActive(btnAll);
    expandedLabel.textContent = 'Expanded';
    schemaLabel.textContent   = 'All Nodes';
    app.dataset.mode = 'all';
    if (typeof monaco !== 'undefined') monaco.editor.setTheme('fudgel-dark');
    if (window._fudgelEditor) window._fudgelEditor.setValue(unifiedSource);
  }

  btnBija.addEventListener('click',   switchToBija);
  btnRumus.addEventListener('click',  switchToRumus);
  btnViesti.addEventListener('click', switchToViesti);
  btnAll.addEventListener('click',    switchToAll);

  // Set initial active state so CSS [data-mode="bija"] applies on first load
  setActive(btnBija);
  app.dataset.mode = 'bija';
}

// ── Reset button ──────────────────────────────────────────────────────────────

function initResetBtn() {
  const btn = document.getElementById('btn-reset');
  if (!btn) return;
  btn.addEventListener('click', () => {
    unifiedSource = DEFAULT_ALL_SOURCE;
    const text = currentMode === 'all'
      ? unifiedSource
      : splitUnified(unifiedSource)[currentMode];
    if (window._fudgelEditor) window._fudgelEditor.setValue(text);
    onSourceChange(text);
  });
}

// ── Entity count label ────────────────────────────────────────────────────────

function updateCount(text) {
  const el = document.getElementById('entity-count');
  if (el) el.textContent = text;
}

// ── Drag-to-resize ────────────────────────────────────────────────────────────

function makeDragHandle(handleId, paneId, minPct, maxPct) {
  const handle    = document.getElementById(handleId);
  const pane      = document.getElementById(paneId);
  const mainSplit = document.getElementById('main-split');
  if (!handle || !pane) return;

  let dragging = false;
  let startX   = 0;
  let startPct = 0;

  handle.addEventListener('mousedown', e => {
    dragging = true;
    handle.classList.add('dragging');
    startX   = e.clientX;
    const splitW = mainSplit.getBoundingClientRect().width;
    startPct = (pane.getBoundingClientRect().width / splitW) * 100;
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const splitW  = mainSplit.getBoundingClientRect().width;
    const delta   = ((e.clientX - startX) / splitW) * 100;
    const clamped = Math.min(Math.max(startPct + delta, minPct), maxPct);
    pane.style.flex = `0 0 ${clamped}%`;
    if (window._fudgelEditor) window._fudgelEditor.layout();
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    if (window._fudgelEditor) window._fudgelEditor.layout();
    // Re-render schema edges after resize (all modes)
    if (lastExpanded) _renderCurrentMode();
  });
}

// ── Middle-mouse pan on schema canvas ─────────────────────────────────────────

function initSchemaPan() {
  const canvas = document.getElementById('schema-canvas');
  let panning = false, startX = 0, startY = 0, scrollX = 0, scrollY = 0;

  canvas.addEventListener('mousedown', e => {
    if (e.button !== 1) return;
    panning = true;
    startX  = e.clientX;
    startY  = e.clientY;
    scrollX = canvas.scrollLeft;
    scrollY = canvas.scrollTop;
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!panning) return;
    canvas.scrollLeft = scrollX - (e.clientX - startX);
    canvas.scrollTop  = scrollY - (e.clientY - startY);
  });

  document.addEventListener('mouseup', e => {
    if (e.button === 1) panning = false;
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  initModeTabs();
  initResetBtn();
  initSchemaPan();
  makeDragHandle('drag-handle',   'editor-pane',   10, 60);
  makeDragHandle('drag-handle-2', 'expanded-pane', 10, 60);

  initEditor(
    document.getElementById('editor-pane'),
    splitUnified(unifiedSource).bija,
    onSourceChange
  );
});
