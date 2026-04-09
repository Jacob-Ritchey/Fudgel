// ── Viesti schema renderer — signal rail ──────────────────────────────────────
// Renders the Viesti signal graph as a sequentially-ordered numbered list.
// Unlike Bija (entity tree cards) and Rumus (function cards), Viesti is
// inherently sequential — signal order IS execution order — so a flow list
// is the natural representation rather than a spatial card layout.
//
// Parallel clusters (~~ signals) are rendered as side-by-side thread columns.

// ── Thread color palette ──────────────────────────────────────────────────────
// Shared with all-schema.js (which loads after this file, so it can reference
// THREAD_COLORS and _groupSignals defined here).

const THREAD_COLORS = ['#20d0a0', '#e07b10', '#9b6bde', '#e05070', '#5090e0'];

// ── Signal grouping utility ───────────────────────────────────────────────────
// Returns an array of execution groups for the given contextPath scope:
//   { type: 'seq',     signals: [...] }
//   { type: 'cluster', threads: [ { id, color, groups: [...] }, ... ] }
//
// Threads have recursive `groups` (not flat `signals`), enabling nested clusters.
// Call as _groupSignals(allSignals) — contextPath defaults to '' (root scope).

function _groupSignals(allSignals, contextPath = '') {
  const groups = [];
  let seqBuf   = [];

  function flushSeq() {
    if (seqBuf.length > 0) { groups.push({ type: 'seq', signals: [...seqBuf] }); seqBuf = []; }
  }

  // Map any descendant signal path to the direct-child contextPath within our scope,
  // or return null if the signal doesn't belong to a direct child of our context.
  function directChildOf(sigPath) {
    if (contextPath === '') {
      if (!sigPath) return null;
      return sigPath.split('.')[0]; // e.g. '1', '2'
    }
    const prefix = contextPath + '.';
    if (!sigPath.startsWith(prefix)) return null;
    const rel = sigPath.slice(prefix.length);
    return `${contextPath}.${rel.split('.')[0]}`; // e.g. '1.1', '1.2'
  }

  let i = 0;
  while (i < allSignals.length) {
    const sig = allSignals[i];

    if (sig.contextPath === contextPath) {
      // Directly in our sequential flow
      seqBuf.push(sig);
      i++;
    } else {
      const childPath = directChildOf(sig.contextPath);
      if (childPath !== null) {
        // Start of a parallel cluster — collect all signals until we return to our context
        flushSeq();
        const clusterStart = i;
        while (i < allSignals.length && allSignals[i].contextPath !== contextPath) i++;
        const clusterSigs = allSignals.slice(clusterStart, i);

        // Identify direct child paths in declaration order
        const seenChildren = new Set();
        const childPaths   = [];
        for (const s of clusterSigs) {
          const cp = directChildOf(s.contextPath);
          if (cp && !seenChildren.has(cp)) { seenChildren.add(cp); childPaths.push(cp); }
        }

        const threads = childPaths.map((cp, idx) => ({
          id:     cp,
          color:  THREAD_COLORS[idx % THREAD_COLORS.length],
          groups: _groupSignals(clusterSigs, cp),  // ← recursive
        }));
        groups.push({ type: 'cluster', threads });
      } else {
        // Belongs to a different scope — skip
        i++;
      }
    }
  }

  flushSeq();
  return groups;
}

// ── Address resolution helpers ────────────────────────────────────────────────

function buildKnownAddresses() {
  const known = { bijaProps: new Set(), rumusFns: new Set() };

  // Collect Bija entity property paths from the last parsed Bija file
  if (typeof lastParsed !== 'undefined' && lastParsed && lastParsed.sections) {
    for (const section of lastParsed.sections) {
      collectBijaAddresses(section.entities || [], '', known.bijaProps);
    }
  }

  // Collect Rumus function names from the last parsed Rumus file
  if (typeof lastRumus !== 'undefined' && lastRumus && lastRumus.functions) {
    for (const fn of lastRumus.functions) {
      known.rumusFns.add(fn.name);
    }
  }

  return known;
}

function collectBijaAddresses(entities, prefix, set) {
  for (const entity of entities) {
    const path = prefix ? `${prefix}.${entity.name}` : entity.name;
    set.add(path);
    if (entity.props) {
      for (const prop of entity.props) {
        set.add(`${path}.${prop.name}`);
      }
    }
    if (entity.children) {
      collectBijaAddresses(entity.children, path, set);
    }
  }
}

function resolveAddr(addr, known) {
  if (!addr) return 'dormant';

  if (addr.includes('.')) {
    // Dotted address — Bija entity property path (or fn.param)
    if (known.bijaProps.has(addr)) return 'resolved';
    const base = addr.split('.')[0];
    if (known.rumusFns.has(base)) return 'rumus';
    return 'unresolved'; // ghost — entity not yet declared
  } else {
    // Bare identifier — always a Rumus function reference in Viesti context
    return 'rumus';
  }
}

// ── Main renderer ─────────────────────────────────────────────────────────────

function renderViestiSchema(signals) {
  const inner = document.getElementById('schema-inner');
  const svg   = document.getElementById('schema-edges');

  if (!inner) return;

  // Clear previous content, hide the SVG edges (not used in signal rail layout)
  document.getElementById('schema-pane').querySelector('.all-run-btn')?.remove();
  inner.innerHTML = '';
  if (svg) {
    inner.appendChild(svg);
    svg.innerHTML = '';
    svg.style.display = 'none';
  }

  // Reset layout to flow (not absolute-position card grid)
  inner.style.width    = '';
  inner.style.height   = '';
  inner.style.position = 'relative';

  if (!signals || signals.length === 0) {
    const empty = document.createElement('div');
    empty.className   = 'vi-empty';
    empty.textContent = 'No signals';
    inner.appendChild(empty);
    return;
  }

  const known  = buildKnownAddresses();
  const groups = _groupSignals(signals);
  const rail   = document.createElement('div');
  rail.className = 'vi-signal-rail';

  const counters = { resolved: 0, dormant: 0, total: 0, execNum: 0 };

  _renderGroups(groups, rail, known, counters, /* isTopLevel */ true);

  // Stats footer
  const stats = document.createElement('div');
  stats.className   = 'vi-stats';
  stats.textContent =
    `${counters.total} signal${counters.total !== 1 ? 's' : ''}` +
    ` · ${counters.resolved} resolved` +
    ` · ${counters.dormant} dormant`;
  rail.appendChild(stats);

  inner.appendChild(rail);
}

// ── Recursive group renderer ───────────────────────────────────────────────────
// Renders a groups array (from _groupSignals) into `container`.
// isTopLevel=true  → seq rows get #N sequence numbers (main rail).
// isTopLevel=false → inside a thread column; parallel sigs use ~~, others use ~.

function _renderGroups(groups, container, known, counters, isTopLevel) {
  let prevWasCluster = false;

  for (const group of groups) {

    if (group.type === 'seq') {
      // ── Sequential group ─────────────────────────────────────────────────
      if (prevWasCluster) container.appendChild(makeBarrier());

      for (const sig of group.signals) {
        counters.total++;

        if (sig.parallel) {
          // ~~ launcher signal — always rendered as a single row
          const row = document.createElement('div');
          row.className = 'vi-row';
          if (isTopLevel) row.appendChild(makeSeq(++counters.execNum));
          const srcStatus = resolveAddr(sig.src, known);
          row.appendChild(makeAddrPill(sig.src, srcStatus));
          row.appendChild(makeTildeParallel());
          if (sig.dormant || !sig.target) {
            const cap = document.createElement('span');
            cap.className   = 'vi-dormant-cap';
            cap.textContent = '◌';
            row.appendChild(cap);
            counters.dormant++;
          } else {
            const tgtStatus = resolveAddr(sig.target, known);
            row.appendChild(makeAddrPill(sig.target, tgtStatus));
            if (srcStatus === 'resolved' && tgtStatus === 'resolved') counters.resolved++;
          }
          container.appendChild(row);
          continue;
        }

        // Sequential signal — always a simple src → target pair
        const srcStatus = resolveAddr(sig.src, known);

        {
          const row = document.createElement('div');
          row.className = 'vi-row';
          if (isTopLevel) row.appendChild(makeSeq(++counters.execNum));
          if (!isTopLevel) row.style.paddingLeft = '10px';
          row.appendChild(makeAddrPill(sig.src, srcStatus));
          row.appendChild(makeTilde());

          if (sig.dormant) {
            const cap = document.createElement('span');
            cap.className   = 'vi-dormant-cap';
            cap.textContent = '◌';
            row.appendChild(cap);
            counters.dormant++;
          } else {
            const tgtStatus = resolveAddr(sig.target, known);
            row.appendChild(makeAddrPill(sig.target, tgtStatus));
            if (srcStatus === 'resolved' && tgtStatus === 'resolved') counters.resolved++;
          }

          container.appendChild(row);
        }
      }

      prevWasCluster = false;

    } else {
      // ── Parallel cluster group ───────────────────────────────────────────
      const clusterRow = document.createElement('div');
      clusterRow.className = 'vi-cluster-row';

      group.threads.forEach((thread, threadIdx) => {
        const col = document.createElement('div');
        col.className = `vi-thread-col vi-thread-${threadIdx % THREAD_COLORS.length}`;
        _renderGroups(thread.groups, col, known, counters, false);  // ← recursive
        clusterRow.appendChild(col);
      });

      container.appendChild(clusterRow);
      prevWasCluster = true;
    }
  }
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

function makeSeq(n) {
  const s = document.createElement('span');
  s.className   = 'vi-seq';
  s.textContent = `#${n}`;
  return s;
}

function makeAddrPill(text, status) {
  const pill = document.createElement('span');
  pill.className = 'vi-addr';
  if (status === 'unresolved') pill.classList.add('unresolved');
  if (status === 'rumus')      pill.classList.add('rumus');
  pill.textContent = text || '?';
  return pill;
}

function makeTilde() {
  const t = document.createElement('span');
  t.className   = 'vi-tilde';
  t.textContent = '~';
  return t;
}

function makeTildeParallel() {
  const t = document.createElement('span');
  t.className   = 'vi-tilde-parallel';
  t.textContent = '~~';
  return t;
}

function makeBarrier() {
  const b = document.createElement('div');
  b.className = 'vi-barrier';
  return b;
}

// ── Expanded panel renderer ───────────────────────────────────────────────────

function renderViestiExpanded(source) {
  const el = document.getElementById('expanded-code');
  if (!el) return;
  el.innerHTML = viestiToHtml(source);
}
