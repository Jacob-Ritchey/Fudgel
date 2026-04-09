// ── Rumus schema renderer ─────────────────────────────────────────────────────
// Renders interactive function cards in the schema canvas.
// Cards show: inputs (with text fields), collapsible body, assertions, outputs.

const RUMUS_NODE_W  = 280;
const RUMUS_H_GAP   = 60;
const RUMUS_V_GAP   = 28;
const RUMUS_COLS    = 2; // wrap to new column after this many cards

// ── Rumus expression tokenizer ────────────────────────────────────────────────
// Returns an array of { type, val } tokens. Used by translateRumusToJs.

function _tokenizeRumusExpr(expr) {
  const tokens = [];
  let i = 0;
  while (i < expr.length) {
    if (/[A-Za-z_]/.test(expr[i])) {
      let j = i;
      while (j < expr.length && /[\w]/.test(expr[j])) j++;
      tokens.push({ type: 'ident', val: expr.slice(i, j) });
      i = j; continue;
    }
    if (/[0-9.]/.test(expr[i])) {
      let j = i;
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
      tokens.push({ type: 'num', val: expr.slice(i, j) });
      i = j; continue;
    }
    // Three-char ops
    if (i + 2 < expr.length && expr.slice(i, i + 3) === '<->') {
      tokens.push({ type: 'logic-op', val: '<->' }); i += 3; continue;
    }
    // Two-char ops — formal logic first, then comparison
    if (i + 1 < expr.length) {
      const two = expr.slice(i, i + 2);
      if (two === '->' || two === '<-' || two === '!&' || two === '!|') {
        tokens.push({ type: 'logic-op', val: two }); i += 2; continue;
      }
      if (two === '!=' || two === '>=' || two === '<=') {
        tokens.push({ type: 'cmp-op', val: two }); i += 2; continue;
      }
    }
    // Single-char ops (no >> or << — bitwise shifts removed)
    if ('+-*/%^&|<>?:!='.includes(expr[i])) {
      tokens.push({ type: 'op', val: expr[i] }); i++; continue;
    }
    tokens.push({ type: 'raw', val: expr[i] }); i++;
  }
  return tokens;
}

function _tokensToStr(tokens) {
  return tokens.map(t => t.val).join('');
}

// ── Rumus → JS expression translator ─────────────────────────────────────────
// Converts Rumus operators to JS equivalents for evaluation via new Function.
//
//   =   → ===   (equality, not assignment)
//   !=  → !==
//   &   → &&    (boolean AND)
//   |   → ||    (boolean OR)
//   ->  → !L || R   (implication)
//   <-> → L === R   (biconditional)
//   !&  → !(L && R) (NAND)
//   !|  → !(L || R) (NOR)
//   <-  → !R || L   (converse implication)
//   ^   → L !== R   (boolean XOR)

function translateRumusToJs(expr) {
  const tokens = _tokenizeRumusExpr(expr);

  // Handle binary formal-logic ops (lowest precedence — scan left to right)
  const formalOps = ['<->', '->', '<-', '!&', '!|', '^'];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'logic-op' && formalOps.includes(t.val)) {
      const left  = translateRumusToJs(_tokensToStr(tokens.slice(0, i)).trim());
      const right = translateRumusToJs(_tokensToStr(tokens.slice(i + 1)).trim());
      switch (t.val) {
        case '->':  return `(!( ${left} ) || ( ${right} ))`;
        case '<->': return `(( ${left} ) === ( ${right} ))`;
        case '!&':  return `!(( ${left} ) && ( ${right} ))`;
        case '!|':  return `!(( ${left} ) || ( ${right} ))`;
        case '<-':  return `(!( ${right} ) || ( ${left} ))`;
        case '^':   return `(( ${left} ) !== ( ${right} ))`;
      }
    }
  }

  // No formal-logic ops — do simple token-level substitutions
  return tokens.map(t => {
    if (t.type === 'cmp-op') {
      if (t.val === '!=') return '!==';
      return t.val;
    }
    if (t.type === 'op') {
      if (t.val === '=') return '===';
      if (t.val === '&') return '&&';
      if (t.val === '|') return '||';
    }
    return t.val;
  }).join('');
}

// ── Layout ────────────────────────────────────────────────────────────────────

function layoutRumusFunctions(functions, xOffset = 0) {
  const positions = {};
  let col = 0;
  let colY = new Array(RUMUS_COLS).fill(20);

  for (const fn of functions) {
    const x = xOffset + 20 + col * (RUMUS_NODE_W + RUMUS_H_GAP);
    const y = colY[col];
    positions[fn.name] = { x, y };
    colY[col] += estimateRumusCardHeight(fn) + RUMUS_V_GAP;
    col = (col + 1) % RUMUS_COLS;
  }
  return positions;
}

function estimateRumusCardHeight(fn) {
  const bindings  = fn.body.filter(e => e.kind === 'binding');
  const assertions = fn.body.filter(e => e.kind === 'assertion');
  let h = 38; // header
  if (fn.params.length > 0)   h += 24 + fn.params.length * 30;
  if (bindings.length > 0)    h += 24 + bindings.length * 22;
  if (assertions.length > 0)  h += 24 + assertions.length * 22;
  if (fn.outputs.length > 0)  h += 24 + fn.outputs.length * 26;
  return Math.max(h, 80);
}

// ── Card rendering ────────────────────────────────────────────────────────────

function renderRumusCard(fn) {
  const card = document.createElement('div');
  card.className = 'rumus-card';
  card.dataset.fn = fn.name;

  // ── Header ────────────────────────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'rm-card-header';

  const icon  = document.createElement('span');
  icon.className = 'rm-card-icon';
  icon.textContent = '⬡';

  const title = document.createElement('span');
  title.className = 'rm-card-title';
  title.textContent = '? ' + fn.name;

  const runBtn = document.createElement('button');
  runBtn.className = 'rm-run-btn';
  runBtn.textContent = '▶ Run';
  runBtn.title = 'Execute with test inputs';

  header.appendChild(icon);
  header.appendChild(title);
  header.appendChild(runBtn);
  card.appendChild(header);

  // ── Inputs section ────────────────────────────────────────────────────────
  const inputFields = {};

  if (fn.params.length > 0) {
    const section = document.createElement('div');
    section.className = 'rm-card-section';

    const label = document.createElement('div');
    label.className = 'rm-section-label';
    label.textContent = 'Inputs';
    section.appendChild(label);

    for (const param of fn.params) {
      const row = document.createElement('div');
      row.className = 'rm-input-row';
      row.dataset.param = param;

      const name = document.createElement('span');
      name.className = 'rm-input-name';
      name.textContent = param;

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'rm-input-field';
      input.placeholder = '0';
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') runBtn.click();
      });

      inputFields[param] = input;
      row.appendChild(name);
      row.appendChild(input);
      section.appendChild(row);
    }
    card.appendChild(section);
  }

  // ── Body section (bindings only, collapsible) ─────────────────────────────
  const bindings  = fn.body.filter(e => e.kind === 'binding');
  const assertions = fn.body.filter(e => e.kind === 'assertion');

  if (bindings.length > 0) {
    const section = document.createElement('div');
    section.className = 'rm-card-section';

    const startCollapsed = bindings.length > 6;

    const toggle = document.createElement('button');
    toggle.className = 'rm-section-toggle';
    toggle.innerHTML = `<span>Body</span><span>${startCollapsed ? '▸' : '▾'}</span>`;

    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'rm-body-props';
    bodyDiv.style.display = startCollapsed ? 'none' : '';

    for (const entry of bindings) {
      const row = document.createElement('div');
      row.className = 'rm-body-row';
      row.innerHTML = `<span class="rm-body-name">${escapeHtml(entry.name)}</span><span class="rm-body-expr">${escapeHtml(entry.expr)}</span>`;
      bodyDiv.appendChild(row);
    }

    toggle.addEventListener('click', () => {
      const hidden = bodyDiv.style.display === 'none';
      bodyDiv.style.display = hidden ? '' : 'none';
      toggle.querySelector('span:last-child').textContent = hidden ? '▾' : '▸';
    });

    section.appendChild(toggle);
    section.appendChild(bodyDiv);
    card.appendChild(section);
  }

  // ── Assertions section (collapsible) ──────────────────────────────────────
  let assertionRows = [];
  if (assertions.length > 0) {
    const section = document.createElement('div');
    section.className = 'rm-card-section rm-assert-section';

    const toggle = document.createElement('button');
    toggle.className = 'rm-section-toggle';
    toggle.innerHTML = `<span>Assertions</span><span>▾</span>`;

    const assertDiv = document.createElement('div');
    assertDiv.className = 'rm-assert-props';

    for (const entry of assertions) {
      const row = document.createElement('div');
      row.className = 'rm-assert-row';

      const exprEl = document.createElement('span');
      exprEl.className = 'rm-assert-expr';
      exprEl.textContent = entry.expr;

      const statusEl = document.createElement('span');
      statusEl.className = 'rm-assert-status';
      statusEl.textContent = '';

      assertionRows.push(row);
      row.appendChild(exprEl);
      row.appendChild(statusEl);
      assertDiv.appendChild(row);
    }

    toggle.addEventListener('click', () => {
      const hidden = assertDiv.style.display === 'none';
      assertDiv.style.display = hidden ? '' : 'none';
      toggle.querySelector('span:last-child').textContent = hidden ? '▸' : '▾';
    });

    section.appendChild(toggle);
    section.appendChild(assertDiv);
    card.appendChild(section);
  }

  // ── Outputs section ───────────────────────────────────────────────────────
  const outputEls = {};

  if (fn.outputs.length > 0) {
    const section = document.createElement('div');
    section.className = 'rm-card-section rm-outputs-section';

    const label = document.createElement('div');
    label.className = 'rm-section-label';
    label.textContent = 'Output';
    section.appendChild(label);

    for (const out of fn.outputs) {
      const row = document.createElement('div');
      row.className = 'rm-output-row';
      row.dataset.output = out;

      const name = document.createElement('span');
      name.className = 'rm-output-name';
      name.textContent = out;

      const val = document.createElement('span');
      val.className = 'rm-output-val';
      val.textContent = '—';

      outputEls[out] = val;
      row.appendChild(name);
      row.appendChild(val);
      section.appendChild(row);
    }
    card.appendChild(section);
  }

  // ── Error display ─────────────────────────────────────────────────────────
  const errorEl = document.createElement('div');
  errorEl.className = 'rm-eval-error';
  errorEl.style.display = 'none';
  card.appendChild(errorEl);

  // ── Run handler ───────────────────────────────────────────────────────────
  runBtn.addEventListener('click', () => {
    // 1. Gather inputs
    const inputs = {};
    for (const [name, el] of Object.entries(inputFields)) {
      const raw = el.value.trim();
      inputs[name] = raw === '' ? 0 : (isNaN(Number(raw)) ? raw : Number(raw));
    }

    // 2. Reset previous animation state on this card
    card.querySelectorAll('.rm-input-row').forEach(r => r.classList.remove('has-input'));
    card.querySelectorAll('.rm-body-row').forEach(r => {
      r.classList.remove('computing');
      const v = r.querySelector('.rm-body-val'); if (v) v.remove();
    });
    card.querySelectorAll('.rm-assert-row').forEach(r => {
      r.classList.remove('pass', 'fail');
      const s = r.querySelector('.rm-assert-status'); if (s) s.textContent = '';
    });
    card.querySelectorAll('.rm-output-row').forEach(r => r.classList.remove('has-result'));
    card.querySelectorAll('.rm-output-val').forEach(v => v.textContent = '—');
    errorEl.style.display = 'none';

    // 3. Pre-expand body so the step animation is visible
    const bodyDiv = card.querySelector('.rm-body-props');
    if (bodyDiv && bodyDiv.style.display === 'none') {
      bodyDiv.style.display = '';
      const arrow = card.querySelector('.rm-section-toggle span:last-child');
      if (arrow) arrow.textContent = '▾';
    }

    // 4. Evaluate stepwise (evaluateRumusFunctionStepwise is defined in all-schema.js)
    const result = evaluateRumusFunctionStepwise(fn, inputs);
    if (result.error) {
      errorEl.textContent = result.error;
      errorEl.style.display = '';
      return;
    }

    // 5. Build frame sequence: inputs → body steps (bindings + assertions) → outputs
    const frames = [];
    for (const param of fn.params) {
      frames.push({ type: 'fn-input', fnName: fn.name, param, value: inputs[param] ?? 0 });
    }
    for (const s of result.steps) {
      if (s.kind === 'binding') {
        frames.push({ type: 'fn-body-step', fnName: fn.name, stepIdx: s.bindingIdx,
                      name: s.name, expr: s.expr, value: s.value });
      } else if (s.kind === 'assertion') {
        frames.push({ type: 'fn-assertion', fnName: fn.name, assertionIdx: s.assertionIdx,
                      expr: s.expr, passed: s.passed });
      }
    }
    if (!result.assertionFailed) {
      for (const [outName, val] of Object.entries(result.outputs)) {
        frames.push({ type: 'fn-output', fnName: fn.name, outputName: outName, value: val });
      }
    }

    // 6. Play — disable Run during playback to prevent mid-animation re-entry
    runBtn.disabled = true;
    _playAnimFrames(frames, () => {
      runBtn.disabled = false;
      if (result.assertionFailed) {
        errorEl.textContent = `Assertion failed: ${result.assertionFailed}`;
        errorEl.style.display = '';
      }
    }, 0);
  });

  return card;
}

// ── Main render entry point ───────────────────────────────────────────────────

function renderRumusSchema(functions, xOffset = 0, appendToExisting = false) {
  const canvas = document.getElementById('schema-canvas');
  const inner  = document.getElementById('schema-inner');
  const svgEl  = document.getElementById('schema-edges');

  // Clear all card types (or just rumus cards if appending alongside entity cards)
  document.getElementById('schema-pane').querySelector('.all-run-btn')?.remove();
  inner.querySelectorAll('.rumus-card').forEach(c => c.remove());
  inner.querySelectorAll('.vi-signal-rail, .vi-empty, .all-static-label, .all-row-sep').forEach(c => c.remove());
  if (!appendToExisting) {
    inner.querySelectorAll('.entity-card').forEach(c => c.remove());
    svgEl.innerHTML = '';
  }

  if (!functions || functions.length === 0) {
    let empty = inner.querySelector('.schema-empty');
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'schema-empty';
      empty.textContent = 'No functions to display';
      inner.appendChild(empty);
    }
    updateRumusFunctionCount(0);
    return;
  }

  const empty = inner.querySelector('.schema-empty');
  if (empty) empty.remove();

  const positions = layoutRumusFunctions(functions, xOffset);

  let maxX = 0, maxY = 0;
  for (const fn of functions) {
    const pos = positions[fn.name];
    if (!pos) continue;
    maxX = Math.max(maxX, pos.x + RUMUS_NODE_W + 20);
    maxY = Math.max(maxY, pos.y + estimateRumusCardHeight(fn) + 20);
  }
  if (appendToExisting) {
    const curW = parseInt(inner.style.width  || '0', 10);
    const curH = parseInt(inner.style.height || '0', 10);
    maxX = Math.max(maxX, curW);
    maxY = Math.max(maxY, curH);
  }
  inner.style.width  = maxX + 'px';
  inner.style.height = maxY + 'px';
  svgEl.setAttribute('width',  maxX);
  svgEl.setAttribute('height', maxY);

  for (const fn of functions) {
    const pos = positions[fn.name];
    if (!pos) continue;
    const card = renderRumusCard(fn);
    card.style.left = pos.x + 'px';
    card.style.top  = pos.y + 'px';
    inner.appendChild(card);
  }

  requestAnimationFrame(() => {
    // Restack 2-column grid using actual rendered heights (round-robin assignment)
    const colY = new Array(RUMUS_COLS).fill(20);
    let maxY = 0;
    for (let i = 0; i < functions.length; i++) {
      const fn     = functions[i];
      const col    = i % RUMUS_COLS;
      const cardEl = inner.querySelector(`[data-fn="${CSS.escape(fn.name)}"]`);
      if (!cardEl) continue;
      cardEl.style.top = colY[col] + 'px';
      colY[col] += cardEl.offsetHeight + RUMUS_V_GAP;
      maxY = Math.max(maxY, colY[col]);
    }
    maxY += 20;
    inner.style.height = maxY + 'px';
    svgEl.setAttribute('height', maxY);
  });

  updateRumusFunctionCount(functions.length);
}

function updateRumusFunctionCount(n) {
  const el = document.getElementById('entity-count');
  if (el) el.textContent = `${n} ${n === 1 ? 'function' : 'functions'}`;
}
