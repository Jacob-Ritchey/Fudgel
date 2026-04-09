// ── Unified "All" mode schema renderer ────────────────────────────────────────
// Schema diagram layout: each Bija entity and Rumus function appears exactly once.
//   LEFT col:   Bija entity cards (signal-referenced only)
//   RIGHT col:  Rumus function cards (signal-referenced only)
//   EDGES:      supply (entity→fn, left-to-right bezier)
//               return (fn→entity, right-side U-arc)
//               dormant (dashed stub)
// Provides "▶ Run All" button for one-shot execution cycle per spec §4.1.
// Parallel ~~ signals are animated concurrently; a barrier waits for all threads.

// ── Signal edge colors ────────────────────────────────────────────────────────

const ALL_COLOR_SUPPLY  = '#20d0c0'; // Bija → Rumus input  (teal)
const ALL_COLOR_RETURN  = '#50c8f0'; // Rumus output → Bija (light blue)
const ALL_COLOR_CHAIN   = '#e07b10'; // Rumus → Rumus        (amber)
const ALL_COLOR_DIRECT  = '#5090b8'; // Bija → Bija direct   (slate)
const ALL_COLOR_DORMANT = '#1e3a4a'; // dormant              (very dimmed)

const ALL_COL_GAP  = 160; // horizontal gap between entity and function columns
const ALL_CARD_GAP = 20;  // vertical gap between stacked cards in a column

// ── Main entry point ──────────────────────────────────────────────────────────

function renderAllSchema(expandedSections, rumusFunctions, viestiSignals) {
  const canvas = document.getElementById('schema-canvas');
  const inner  = document.getElementById('schema-inner');
  const svgEl  = document.getElementById('schema-edges');

  // Clear previous content
  inner.querySelectorAll(
    '.entity-card, .rumus-card, .vi-signal-rail, .vi-empty, ' +
    '.schema-empty, .all-static-label, .all-row-sep'
  ).forEach(e => e.remove());
  svgEl.innerHTML = '';
  inner.style.position = 'relative';
  inner.style.width  = '';
  inner.style.height = '';

  document.getElementById('schema-pane').querySelector('.all-run-btn')?.remove();

  // ── Collect root-level Bija entities ─────────────────────────────────────

  const bijaDecls = expandedSections
    .filter(s => BIJA_LIBS.has(s.library))
    .flatMap(s => s.children || []);
  const bijaFlatAll  = [];
  collectAllEntities(bijaDecls, '', 0, bijaFlatAll);
  const bijaFlat  = bijaFlatAll.filter(i => i.depth === 0);
  const bijaByName = {};
  for (const item of bijaFlat) bijaByName[item.path] = item;

  const fnNames  = new Set(rumusFunctions.map(f => f.name));
  const fnByName = {};
  for (const fn of rumusFunctions) fnByName[fn.name] = fn;

  const signals = viestiSignals || [];

  // ── Empty state ───────────────────────────────────────────────────────────

  if (signals.length === 0) {
    const empty = document.createElement('div');
    empty.className   = 'schema-empty';
    empty.textContent = 'No signals defined';
    inner.appendChild(empty);
    inner.style.width  = '400px';
    inner.style.height = '100px';
    _allSignalPaths = [];
    return;
  }

  // ── Collect unique signal-referenced entities and functions ──────────────

  const seenEntities = new Set(), seenFns = new Set();
  const entityOrder  = [], fnOrder = [];

  for (const sig of signals) {
    const srcBase = _baseName(sig.src);
    const tgtBase = sig.target ? _baseName(sig.target) : null;

    if (!fnNames.has(srcBase) && !seenEntities.has(srcBase)) {
      seenEntities.add(srcBase); entityOrder.push(srcBase);
    }
    if (tgtBase && !fnNames.has(tgtBase) && !seenEntities.has(tgtBase)) {
      seenEntities.add(tgtBase); entityOrder.push(tgtBase);
    }

    // Function node from signal endpoints
    const fnBase = tgtBase && fnNames.has(tgtBase) ? tgtBase
      : (fnNames.has(srcBase) ? srcBase : null);
    if (fnBase && !seenFns.has(fnBase)) {
      seenFns.add(fnBase); fnOrder.push(fnBase);
    }
  }

  // ── Layout: entities left column, functions right column ─────────────────

  const LEFT_X  = 20;
  const RIGHT_X = LEFT_X + NODE_W + ALL_COL_GAP;

  const entityPositions = {};
  let ey = 20;
  for (const name of entityOrder) {
    entityPositions[name] = { x: LEFT_X, y: ey };
    const item = bijaByName[name];
    ey += (item ? estimateCardHeight(item.node) : 80) + ALL_CARD_GAP;
  }

  const fnPositions = {};
  let fy = 20;
  for (const name of fnOrder) {
    fnPositions[name] = { x: RIGHT_X, y: fy };
    const fn = fnByName[name];
    fy += (fn ? estimateRumusCardHeight(fn) : 80) + ALL_CARD_GAP;
  }

  const canvasW = RIGHT_X + RUMUS_NODE_W + 100; // +100 for return arc bulge
  const canvasH = Math.max(ey, fy) + 20;

  inner.style.width  = canvasW + 'px';
  inner.style.height = canvasH + 'px';
  svgEl.setAttribute('width',  canvasW);
  svgEl.setAttribute('height', canvasH);
  svgEl.style.display = '';

  // ── Render entity cards ───────────────────────────────────────────────────

  for (const name of entityOrder) {
    const item = bijaByName[name];
    if (!item) continue;
    const card = renderCard(item);
    card.style.left = entityPositions[name].x + 'px';
    card.style.top  = entityPositions[name].y + 'px';
    inner.appendChild(card);
  }

  // ── Render function cards ─────────────────────────────────────────────────

  for (const name of fnOrder) {
    const fn = fnByName[name];
    if (!fn) continue;
    const card = renderRumusCard(fn);
    card.style.left = fnPositions[name].x + 'px';
    card.style.top  = fnPositions[name].y + 'px';
    inner.appendChild(card);
  }

  // ── Inject Run All button ─────────────────────────────────────────────────

  const schemaPaneHeader = document.getElementById('schema-pane');
  const runBtn = document.createElement('button');
  runBtn.className   = 'all-run-btn';
  runBtn.textContent = '▶ Run All';
  runBtn.addEventListener('click', () => {
    runAllCycle(signals, rumusFunctions, expandedSections);
  });
  schemaPaneHeader.appendChild(runBtn);

  // ── Draw signal edges (after cards are in DOM) ────────────────────────────

  _allSignalPaths = [];

  requestAnimationFrame(() => {
    // Restack entity column (left) using actual rendered heights
    let ey = 20;
    for (const name of entityOrder) {
      const cardEl = inner.querySelector(`[data-path="${CSS.escape(name)}"]`);
      if (!cardEl) continue;
      cardEl.style.top = ey + 'px';
      ey += cardEl.offsetHeight + ALL_CARD_GAP;
    }

    // Restack function column (right) using actual rendered heights
    let fy = 20;
    for (const name of fnOrder) {
      const cardEl = inner.querySelector(`[data-fn="${CSS.escape(name)}"]`);
      if (!cardEl) continue;
      cardEl.style.top = fy + 'px';
      fy += cardEl.offsetHeight + ALL_CARD_GAP;
    }

    // Update canvas height to fit actual content
    const reflowH = Math.max(ey, fy) + 20;
    inner.style.height = reflowH + 'px';
    svgEl.setAttribute('height', reflowH);

    svgEl.innerHTML = '';
    _addSignalMarkers(svgEl);

    // Build a thread-color map for ~~ signals (recursive through nested clusters)
    const groups         = _groupSignals(signals);
    const sigThreadColor = new Map();
    for (const g of groups) {
      if (g.type === 'cluster') {
        for (const thread of g.threads) {
          _collectThreadSigs(thread, thread.color, sigThreadColor);
        }
      }
    }

    for (const sig of signals) {
      const threadColor = sigThreadColor.get(sig) || null;
      _drawSignalEdge(sig, fnNames, inner, svgEl, canvas, threadColor);
    }
  });
}

// ── Signal marker defs ────────────────────────────────────────────────────────

let _allSignalPaths = [];

function _addSignalMarkers(svg) {
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <marker id="arrow-supply" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="${ALL_COLOR_SUPPLY}" />
    </marker>
    <marker id="arrow-return" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="${ALL_COLOR_RETURN}" />
    </marker>
    <marker id="arrow-chain" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="${ALL_COLOR_CHAIN}" />
    </marker>
    <marker id="arrow-direct" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="${ALL_COLOR_DIRECT}" />
    </marker>
  `;

  // Per-thread-color markers for ~~ edges
  THREAD_COLORS.forEach((col, i) => {
    defs.innerHTML += `
      <marker id="arrow-thread-${i}" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
        <path d="M0,0 L0,6 L8,3 z" fill="${col}" />
      </marker>`;
  });

  svg.appendChild(defs);
}

// ── Signal edge drawing ───────────────────────────────────────────────────────

function _drawSignalEdge(sig, fnNames, inner, svgEl, canvas, threadColor) {
  const srcBase = _baseName(sig.src);
  const tgtBase = sig.target ? _baseName(sig.target) : null;

  const srcIsFn = fnNames.has(srcBase);
  const tgtIsFn = tgtBase ? fnNames.has(tgtBase) : false;

  const srcEl = _resolveEl(sig.src, inner, fnNames, 'output');

  if (sig.dormant || !sig.target) {
    if (srcEl) {
      const p = _drawDormantStub(svgEl, srcEl, canvas, ALL_COLOR_DORMANT);
      if (p) _allSignalPaths.push({ path: p, sig, leg: 'dormant' });
    }
    return;
  }

  const tgtEl = _resolveEl(sig.target, inner, fnNames, 'input');
  if (!srcEl || !tgtEl) return;

  const isReturn = srcIsFn && !tgtIsFn;
  const isSupply = !srcIsFn && tgtIsFn;

  if (isReturn) {
    const retColor  = threadColor || ALL_COLOR_RETURN;
    const retMarker = threadColor ? _threadMarker(threadColor) : 'arrow-return';
    const p = _drawReturnUArc(svgEl, srcEl, tgtEl, canvas, retColor, retMarker);
    if (p) _allSignalPaths.push({ path: p, sig, leg: 'return' });
  } else {
    let color, arrow;
    if (threadColor) {
      color = threadColor;
      arrow = _threadMarker(threadColor);
    } else if (srcIsFn && tgtIsFn) {
      color = ALL_COLOR_CHAIN;  arrow = 'arrow-chain';
    } else if (isSupply) {
      color = ALL_COLOR_SUPPLY; arrow = 'arrow-supply';
    } else {
      color = ALL_COLOR_DIRECT; arrow = 'arrow-direct';
    }
    const p = _drawForwardBezier(svgEl, srcEl, tgtEl, canvas, color, arrow, false);
    if (p) _allSignalPaths.push({ path: p, sig, leg: 'simple' });
  }
}

// Return the marker ID for a given thread color string
function _threadMarker(color) {
  const idx = THREAD_COLORS.indexOf(color);
  return idx >= 0 ? `arrow-thread-${idx}` : 'arrow-supply';
}

// ── Element resolution ────────────────────────────────────────────────────────

function _baseName(addr) {
  if (!addr) return '';
  const dot = addr.indexOf('.');
  return dot >= 0 ? addr.slice(0, dot) : addr;
}

function _propName(addr) {
  if (!addr) return null;
  const dot = addr.indexOf('.');
  return dot >= 0 ? addr.slice(dot + 1) : null;
}

function _resolveEl(addr, inner, fnNames, side) {
  if (!addr) return null;
  const base = _baseName(addr);
  const prop = _propName(addr);

  if (fnNames.has(base)) {
    const card = inner.querySelector(`[data-fn="${CSS.escape(base)}"]`);
    if (!card) return null;
    if (prop) {
      return card.querySelector(`[data-param="${CSS.escape(prop)}"]`)
          || card.querySelector(`[data-output="${CSS.escape(prop)}"]`)
          || card;
    }
    if (side === 'input') {
      return card.querySelector('.rm-input-row') || card.querySelector('.rm-card-section') || card;
    }
    return card.querySelector('.rm-outputs-section') || card.querySelector('.rm-output-row') || card;
  }

  const card = inner.querySelector(`[data-path="${CSS.escape(base)}"]`);
  if (!card) return null;
  if (prop) return card.querySelector(`[data-prop="${CSS.escape(prop)}"]`) || card;
  return card;
}

// ── Bezier path helpers ───────────────────────────────────────────────────────

// Standard left-to-right bezier: right-center of fromEl → left-center of toEl
function _drawForwardBezier(svg, fromEl, toEl, canvas, color, markerId, dormant) {
  if (!fromEl || !toEl) return null;
  const canvasRect = canvas.getBoundingClientRect();
  const fromRect   = fromEl.getBoundingClientRect();
  const toRect     = toEl.getBoundingClientRect();

  const x1 = fromRect.right - canvasRect.left + canvas.scrollLeft;
  const y1 = fromRect.top   - canvasRect.top  + canvas.scrollTop + fromRect.height / 2;
  const x2 = toRect.left    - canvasRect.left + canvas.scrollLeft;
  const y2 = toRect.top     - canvasRect.top  + canvas.scrollTop + toRect.height / 2;

  const span = Math.abs(x2 - x1);
  const cx1  = x1 + span * 0.45;
  const cx2  = x2 - span * 0.45;

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', `M${x1},${y1} C${cx1},${y1} ${cx2},${y2} ${x2},${y2}`);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', dormant ? ALL_COLOR_DORMANT : color);
  path.setAttribute('stroke-width', dormant ? '1' : '1.5');
  path.setAttribute('opacity', dormant ? '0.3' : '0.65');
  if (dormant) path.setAttribute('stroke-dasharray', '4 3');
  if (!dormant) path.setAttribute('marker-end', `url(#${markerId})`);
  path.classList.add('all-signal-edge');
  svg.appendChild(path);
  return path;
}

// Return U-arc: fn.right → curves right → entity.right (re-enters entity from right side)
function _drawReturnUArc(svg, fromEl, toEl, canvas, color, markerId) {
  if (!fromEl || !toEl) return null;
  const canvasRect = canvas.getBoundingClientRect();
  const fromRect   = fromEl.getBoundingClientRect();
  const toRect     = toEl.getBoundingClientRect();

  const x1 = fromRect.right - canvasRect.left + canvas.scrollLeft;
  const y1 = fromRect.top   - canvasRect.top  + canvas.scrollTop + fromRect.height / 2;
  const x2 = toRect.right   - canvasRect.left + canvas.scrollLeft;
  const y2 = toRect.top     - canvasRect.top  + canvas.scrollTop + toRect.height / 2;

  const bulge = 70;
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d',
    `M${x1},${y1} C${x1+bulge},${y1} ${x2+bulge},${y2} ${x2},${y2}`);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', color);
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute('opacity', '0.65');
  path.setAttribute('marker-end', `url(#${markerId})`);
  path.classList.add('all-signal-edge');
  svg.appendChild(path);
  return path;
}

function _drawDormantStub(svg, fromEl, canvas, color) {
  const canvasRect = canvas.getBoundingClientRect();
  const fromRect   = fromEl.getBoundingClientRect();
  const x1 = fromRect.right - canvasRect.left + canvas.scrollLeft;
  const y1 = fromRect.top   - canvasRect.top  + canvas.scrollTop + fromRect.height / 2;

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', `M${x1},${y1} L${x1 + 40},${y1}`);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', color);
  path.setAttribute('stroke-width', '1');
  path.setAttribute('stroke-dasharray', '4 3');
  path.setAttribute('opacity', '0.3');
  path.classList.add('all-signal-edge');
  svg.appendChild(path);

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', x1 + 40);
  circle.setAttribute('cy', y1);
  circle.setAttribute('r', '4');
  circle.setAttribute('fill', 'none');
  circle.setAttribute('stroke', color);
  circle.setAttribute('stroke-width', '1');
  circle.setAttribute('opacity', '0.3');
  svg.appendChild(circle);

  return path;
}

// ── Step-wise function evaluator ──────────────────────────────────────────────

function evaluateRumusFunctionStepwise(fn, inputs) {
  try {
    const ctx = {};
    for (const p of fn.params) ctx[p] = inputs[p] !== undefined ? inputs[p] : 0;

    const steps = [];
    let bindingIdx   = 0;
    let assertionIdx = 0;
    let assertionFailed = null;

    for (const entry of fn.body) {
      const keys = Object.keys(ctx);
      if (entry.kind === 'binding') {
        // eslint-disable-next-line no-new-func
        const val = new Function(...keys, `return (${translateRumusToJs(entry.expr)});`)(...Object.values(ctx));
        ctx[entry.name] = val;
        steps.push({ kind: 'binding', name: entry.name, expr: entry.expr, value: val, bindingIdx: bindingIdx++ });
      } else if (entry.kind === 'assertion') {
        // eslint-disable-next-line no-new-func
        const passed = !!(new Function(...keys, `return (${translateRumusToJs(entry.expr)});`)(...Object.values(ctx)));
        steps.push({ kind: 'assertion', expr: entry.expr, passed, assertionIdx: assertionIdx++ });
        if (!passed) { assertionFailed = entry.expr; break; }
      }
    }

    const outputs = {};
    if (!assertionFailed) {
      for (const outName of fn.outputs) outputs[outName] = ctx[outName] ?? 0;
    }

    return { steps, outputs, assertionFailed, error: null };
  } catch (e) {
    return { steps: [], outputs: {}, assertionFailed: null, error: String(e.message || e) };
  }
}

// ── Run All simulation ─────────────────────────────────────────────────────────
// One-shot execution cycle:
//   1. Initialize bijaState from expanded literal property values
//   2. Group signals into sequential + parallel clusters via _groupSignals()
//   3. Walk each group: sequential groups animate one-at-a-time; parallel groups
//      animate all threads simultaneously, then wait for all before continuing.

function runAllCycle(signals, rumusFunctions, expandedSections) {
  if (!signals || signals.length === 0) return;

  const fnByName = {};
  for (const fn of rumusFunctions) fnByName[fn.name] = fn;
  const fnNames = new Set(rumusFunctions.map(f => f.name));

  const bijaState     = _buildBijaState(expandedSections);
  const fnParamState  = {};
  const fnOutputState = {};
  const fnEvaluated   = new Set(); // prevent duplicate body-step frames

  for (const fn of rumusFunctions) {
    fnParamState[fn.name]  = {};
    fnOutputState[fn.name] = null;
  }

  // Reset card DOM state from any previous run
  const inner = document.getElementById('schema-inner');
  if (inner) {
    inner.querySelectorAll('.rm-body-row.computing').forEach(el => el.classList.remove('computing'));
    inner.querySelectorAll('.rm-body-val').forEach(el => el.remove());
    inner.querySelectorAll('.rm-assert-row').forEach(el => {
      el.classList.remove('pass', 'fail');
      const s = el.querySelector('.rm-assert-status'); if (s) s.textContent = '';
    });
    inner.querySelectorAll('.rm-output-row.has-result').forEach(el => {
      el.classList.remove('has-result');
      const v = el.querySelector('.rm-output-val'); if (v) v.textContent = '—';
    });
    inner.querySelectorAll('.rm-input-row.has-input').forEach(el => {
      el.classList.remove('has-input');
      const f = el.querySelector('.rm-input-field'); if (f) f.value = '';
    });
  }

  // ── Pre-assign pathIdx per signal (must stay in flat signal order) ─────────
  // _allSignalPaths is built in signal order by _drawSignalEdge; the pathIdx
  // here must mirror that exact order, regardless of group structure.
  const sigPathIdx = new Map();
  let pathCounter = 0;
  for (const sig of signals) {
    sigPathIdx.set(sig, pathCounter);
    pathCounter += 1;
  }

  // ── Frame builder for a single signal ─────────────────────────────────────

  function _emitFnBodyFrames(fnName, fn) {
    if (fnEvaluated.has(fnName)) return;
    const allPresent = fn.params.every(p => p in fnParamState[fnName]);
    if (!allPresent && fn.params.length > 0) return;
    const result = evaluateRumusFunctionStepwise(fn, fnParamState[fnName]);
    if (result.error) return;
    fnOutputState[fnName] = result.outputs;
    fnEvaluated.add(fnName);
    const frames = [];
    for (const s of result.steps) {
      if (s.kind === 'binding') {
        frames.push({ type: 'fn-body-step', fnName, stepIdx: s.bindingIdx,
                      name: s.name, expr: s.expr, value: s.value });
      } else if (s.kind === 'assertion') {
        frames.push({ type: 'fn-assertion', fnName, assertionIdx: s.assertionIdx,
                      expr: s.expr, passed: s.passed });
      }
    }
    if (!result.assertionFailed) {
      for (const [outName, val] of Object.entries(result.outputs)) {
        frames.push({ type: 'fn-output', fnName, outputName: outName, value: val });
      }
    }
    return frames;
  }

  function _buildSignalFrames(sig) {
    const frames  = [];
    const baseIdx = sigPathIdx.get(sig) ?? 0;

    // All signals are simple pairs: src ~ target or src ~~ target.
    // Functions are addressed directly as endpoints; _readAddr / _writeAddr
    // handle fn output/input lookup via fnOutputState / fnParamState.
    const srcVal  = _readAddr(sig.src, bijaState, fnOutputState, fnByName, fnNames);
    const tgtBase = sig.target ? _baseName(sig.target) : null;
    const tgtIsFn = tgtBase ? fnNames.has(tgtBase) : false;

    if (!sig.dormant && sig.target) {
      _writeAddr(sig.target, srcVal, bijaState, fnParamState, fnByName, fnNames);
      frames.push({ type: 'edge', pathIdx: baseIdx, value: String(srcVal ?? '') });

      if (tgtIsFn) {
        const param = _propName(sig.target);
        const fn    = fnByName[tgtBase];
        if (param) frames.push({ type: 'fn-input', fnName: tgtBase, param, value: srcVal });
        if (fn) {
          const bodyFrames = _emitFnBodyFrames(tgtBase, fn);
          if (bodyFrames) frames.push(...bodyFrames);
        }
      } else {
        frames.push({ type: 'entity-update', addr: sig.target, value: srcVal });
      }

    } else {
      frames.push({ type: 'edge', pathIdx: baseIdx, value: String(srcVal ?? '') });
      if (tgtBase && tgtIsFn && fnByName[tgtBase]) {
        const bodyFrames = _emitFnBodyFrames(tgtBase, fnByName[tgtBase]);
        if (bodyFrames) frames.push(...bodyFrames);
      }
    }

    return frames;
  }

  // ── Recursive animation group builder (closure: needs _buildSignalFrames) ──

  function _buildAnimGroups(execGroups, threadIdxOffset) {
    const animGroups = [];
    const threadCounter = threadIdxOffset ?? 0;

    for (const group of execGroups) {
      if (group.type === 'seq') {
        const frames = [];
        for (const sig of group.signals) frames.push(..._buildSignalFrames(sig));
        if (frames.length > 0) animGroups.push({ type: 'sequential', frames });
      } else {
        const threads = group.threads.map((thread, idx) => ({
          color:     thread.color,
          threadIdx: threadCounter + idx,
          groups:    _buildAnimGroups(thread.groups, threadCounter + idx * 10),
        }));
        animGroups.push({ type: 'parallel', threads });
        animGroups.push({ type: 'sequential', frames: [{ type: 'barrier' }] });
      }
    }
    return animGroups;
  }

  // ── Build animGroups ───────────────────────────────────────────────────────

  const execGroups = _groupSignals(signals);
  const animGroups = _buildAnimGroups(execGroups);

  _playAnimGroups(animGroups);
}

// ── Simulation helpers ────────────────────────────────────────────────────────

function _buildBijaState(expandedSections) {
  const state    = {};
  const sections = expandedSections.filter(s => BIJA_LIBS.has(s.library));
  for (const sec of sections) {
    _collectProps(sec.children || [], '', state);
  }
  return state;
}

function _collectProps(children, prefix, state) {
  for (const child of children) {
    if (child.kind === 'entity') {
      const path = prefix ? `${prefix}.${child.name}` : child.name;
      _collectProps(child.children || [], path, state);
    } else if (child.kind === 'property') {
      const key = prefix ? `${prefix}.${child.name}` : child.name;
      if (child.value && child.value.kind === 'literal') {
        const raw = child.value.value;
        state[key] = isNaN(Number(raw)) ? raw : Number(raw);
      }
    }
  }
}

function _readAddr(addr, bijaState, fnOutputState, fnByName, fnNames) {
  if (!addr) return 0;
  const base = _baseName(addr);
  const prop = _propName(addr);

  if (fnNames.has(base)) {
    const outputs = fnOutputState[base];
    if (!outputs) return 0;
    if (prop && prop in outputs) return outputs[prop];
    return _firstOutput(outputs) ?? 0;
  }
  return bijaState[addr] ?? 0;
}

function _firstOutput(outputs) {
  if (!outputs) return null;
  const keys = Object.keys(outputs);
  return keys.length > 0 ? outputs[keys[0]] : null;
}

function _writeAddr(addr, value, bijaState, fnParamState, fnByName, fnNames) {
  if (!addr) return;
  const base = _baseName(addr);
  const prop = _propName(addr);

  if (fnNames.has(base)) {
    if (prop) {
      fnParamState[base][prop] = value ?? 0;
    } else {
      const fn = fnByName[base];
      if (fn) {
        const firstEmpty = fn.params.find(p => !(p in fnParamState[base]));
        if (firstEmpty) fnParamState[base][firstEmpty] = value ?? 0;
      }
    }
  } else {
    bijaState[addr] = value ?? 0;
  }
}

// ── Animation playback ────────────────────────────────────────────────────────

const _ANIM_DELAY = {
  'edge':          350,
  'fn-input':      180,
  'fn-body-step':  280,
  'fn-assertion':  240,
  'fn-output':     220,
  'entity-update': 300,
  'barrier':       250,
};

// Recursively collect all parallel-launch signals from a thread for edge color map.
function _collectThreadSigs(thread, color, map) {
  for (const g of thread.groups) {
    if (g.type === 'seq') {
      for (const sig of g.signals) {
        if (sig.parallel) map.set(sig, color);
      }
    } else {
      for (const t of g.threads) _collectThreadSigs(t, t.color, map);
    }
  }
}

// Play a group tree sequentially/concurrently, calling onDone when complete.
function _playAnimGroups(groups, onDone, threadIdx) {
  let i = 0;

  function nextGroup() {
    if (i >= groups.length) {
      if (onDone) onDone();
      return;
    }
    const g = groups[i++];

    if (g.type === 'sequential') {
      _playAnimFrames(g.frames, nextGroup, threadIdx);

    } else {
      // Parallel: launch all thread sub-group animations simultaneously
      const total = g.threads.length;
      if (total === 0) { nextGroup(); return; }
      let done = 0;
      for (const thread of g.threads) {
        _playAnimGroups(thread.groups, () => {
          if (++done === total) nextGroup();
        }, thread.threadIdx);
      }
    }
  }

  nextGroup();
}

// Play a flat array of frames sequentially; call onDone when exhausted.
// threadIdx (0-based) controls which value label element to use for parallel threads.
function _playAnimFrames(frames, onDone, threadIdx) {
  const inner  = document.getElementById('schema-inner');
  const svgEl  = document.getElementById('schema-edges');
  const canvas = document.getElementById('schema-canvas');

  // Each thread gets its own value label to avoid flicker between parallel tracks
  const labelId = `all-value-label-${threadIdx ?? 0}`;
  let valueLabel = svgEl.querySelector(`#${CSS.escape(labelId)}`);
  if (!valueLabel) {
    valueLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    valueLabel.id = labelId;
    valueLabel.classList.add('all-value-label');
    valueLabel.setAttribute('font-size', '10');
    valueLabel.setAttribute('font-family', 'monospace');
    valueLabel.setAttribute('text-anchor', 'middle');
    valueLabel.setAttribute('fill', '#e8d8a0');
    // Offset vertically per thread to prevent overlap
    valueLabel.setAttribute('dy', String((threadIdx ?? 0) * 14));
    valueLabel.style.display = 'none';
    svgEl.appendChild(valueLabel);
  }

  let step = 0;
  let lastActivePath = null;

  function next() {
    // Clear only this thread's previously-active edge highlight
    if (lastActivePath) { lastActivePath.classList.remove('all-signal-active'); lastActivePath = null; }
    valueLabel.style.display = 'none';

    if (step >= frames.length) {
      if (onDone) onDone();
      return;
    }

    const frame = frames[step];

    if (frame.type === 'edge') {
      const entry = _allSignalPaths[frame.pathIdx];
      if (entry) {
        entry.path.classList.add('all-signal-active');
        lastActivePath = entry.path;
        try {
          const len = entry.path.getTotalLength();
          const mid = entry.path.getPointAtLength(len / 2);
          valueLabel.setAttribute('x', mid.x);
          valueLabel.setAttribute('y', mid.y - 6);
          valueLabel.textContent = frame.value !== 'undefined' ? frame.value : '';
          valueLabel.style.display = '';
        } catch (_) {}
      }

    } else if (frame.type === 'fn-input') {
      const card = inner.querySelector(`[data-fn="${CSS.escape(frame.fnName)}"]`);
      if (card) {
        const row = card.querySelector(`[data-param="${CSS.escape(frame.param)}"]`);
        if (row) {
          row.classList.add('has-input');
          const field = row.querySelector('.rm-input-field');
          if (field) field.value = String(frame.value ?? '');
        }
      }

    } else if (frame.type === 'fn-body-step') {
      const card = inner.querySelector(`[data-fn="${CSS.escape(frame.fnName)}"]`);
      if (card) {
        const bodyDiv = card.querySelector('.rm-body-props');
        if (bodyDiv) bodyDiv.style.display = '';
        const bodyRows = card.querySelectorAll('.rm-body-row');
        const row = bodyRows[frame.stepIdx];
        if (row) {
          row.classList.add('computing');
          let valSpan = row.querySelector('.rm-body-val');
          if (!valSpan) {
            valSpan = document.createElement('span');
            valSpan.className = 'rm-body-val';
            row.appendChild(valSpan);
          }
          valSpan.textContent = String(frame.value ?? '');
        }
      }

    } else if (frame.type === 'fn-output') {
      const card = inner.querySelector(`[data-fn="${CSS.escape(frame.fnName)}"]`);
      if (card) {
        const row = card.querySelector(`[data-output="${CSS.escape(frame.outputName)}"]`);
        if (row) {
          row.classList.add('has-result');
          const valEl = row.querySelector('.rm-output-val');
          if (valEl) valEl.textContent = String(frame.value ?? '');
        }
      }

    } else if (frame.type === 'fn-assertion') {
      const card = inner.querySelector(`[data-fn="${CSS.escape(frame.fnName)}"]`);
      if (card) {
        // Ensure assertion section is visible
        const assertProps = card.querySelector('.rm-assert-props');
        if (assertProps) assertProps.style.display = '';
        const rows = card.querySelectorAll('.rm-assert-row');
        const row = rows[frame.assertionIdx];
        if (row) {
          row.classList.add(frame.passed ? 'pass' : 'fail');
          const statusEl = row.querySelector('.rm-assert-status');
          if (statusEl) statusEl.textContent = frame.passed ? '✓' : '✗';
        }
      }

    } else if (frame.type === 'entity-update') {
      const base = _baseName(frame.addr);
      const prop = _propName(frame.addr);
      if (base && prop) {
        const card = inner.querySelector(`[data-path="${CSS.escape(base)}"]`);
        if (card) {
          const row = card.querySelector(`[data-prop="${CSS.escape(prop)}"]`);
          if (row) {
            const valEl = row.querySelector('.prop-value');
            if (valEl) valEl.textContent = String(frame.value ?? '');
            row.classList.add('just-updated');
            setTimeout(() => row.classList.remove('just-updated'), 700);
          }
        }
      }

    } else if (frame.type === 'barrier') {
      // Brief visual pause — no DOM mutation needed; the delay is the signal
    }

    step++;
    setTimeout(next, _ANIM_DELAY[frame.type] || 350);
  }

  next();
}
