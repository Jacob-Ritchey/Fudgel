// ── Viesti parser ─────────────────────────────────────────────────────────────
// Parses the @Viesti section of a Fudgel source file.
// Each non-blank, non-comment line produces one or more signals.
//
// Signal forms:
//   source ~ target              — simple sequential: route src to target
//   source ~~ target             — simple parallel: fires concurrently with peer ~~ signals
//   source ~ a ~ b ~ target      — chain: expands to N-1 pair signals, each with ~
//   source ~~ a ~~ b ~~ target   — chain: expands to N-1 pair signals, each with ~~
//   source ~ a ~~ b ~ target     — mixed chain: each pair uses its own operator
//   source ~                     — dormant: src observed, not yet routed
//
// Chains expand into N-1 signals at parse time. The execution engine and
// context-path assignment handle the rest — no special chain logic downstream.
//
// Indentation & thread ownership:
//   A ~~ signal launches a parallel thread. Any indented signals immediately
//   following belong to that thread's sequential context (not the main rail).
//   The next non-indented signal acts as an implicit barrier.
//
// Signal object shape:
//   { src, target, dormant, parallel, indent, contextPath, line }

// ── Comment stripping ─────────────────────────────────────────────────────────

function stripViestiComments(line) {
  // Remove (…) comments — same logic as Bija/Rumus parsers
  let result = '';
  let depth  = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '(') { depth++; continue; }
    if (line[i] === ')') { depth = Math.max(0, depth - 1); continue; }
    if (depth === 0) result += line[i];
  }
  return result;
}

// ── Main parser ───────────────────────────────────────────────────────────────

function parseViestiFile(source) {
  const signals = [];
  const errors  = [];

  // Find the @Viesti section
  const lines  = source.split('\n');
  let inViesti = false;
  let lineNum  = 0;

  for (const rawLine of lines) {
    lineNum++;
    const trimmed = rawLine.trim();

    // Section header detection
    if (/^@\w+/.test(trimmed)) {
      inViesti = trimmed === '@Viesti';
      continue;
    }

    if (!inViesti) continue;

    // Capture indentation BEFORE stripping
    const indent = rawLine.length - rawLine.trimStart().length;

    // Strip comments, skip blanks
    const stripped = stripViestiComments(trimmed).trim();
    if (!stripped) continue;

    // ── Tokenize: split on ~~ and ~ while preserving each operator ────────
    // "a ~ b ~~ c ~ d" → ['a', '~', 'b', '~~', 'c', '~', 'd']
    // ~~ must be matched before ~ to avoid splitting ~~ into two ~.
    const tokens = stripped.split(/(~~|~)/).map(s => s.trim());

    // ── Validate ──────────────────────────────────────────────────────────
    // tokens must alternate address/operator: odd count, at least 3 elements.
    if (tokens.length < 3 || tokens.length % 2 === 0) {
      errors.push({ line: lineNum, message: `Invalid signal — expected at least one ~ or ~~: "${stripped}"` });
      continue;
    }
    if (!tokens[0]) {
      errors.push({ line: lineNum, message: `Signal missing source address: "${stripped}"` });
      continue;
    }

    // ── Emit one signal per adjacent pair ────────────────────────────────
    for (let i = 0; i < tokens.length - 2; i += 2) {
      const src    = tokens[i];
      const op     = tokens[i + 1];   // '~' or '~~'
      const rawTgt = tokens[i + 2];
      const dormant = rawTgt === '';
      signals.push({
        src,
        target:      dormant ? null : rawTgt,
        dormant,
        parallel:    op === '~~',
        indent,
        contextPath: null,
        line:        lineNum,
      });
    }
  }

  // ── Second pass: assign contextPath ───────────────────────────────────────
  // Stack-based assignment supporting arbitrarily nested parallel contexts.
  // Stack entries: { indent: number, contextPath: string, nextChildId: number }
  //   ''        = main rail
  //   '1','2'   = top-level parallel threads
  //   '1.1'     = sub-thread of thread 1

  const stack = [{ indent: -1, contextPath: '', nextChildId: 1 }];

  for (const sig of signals) {
    // Pop frames we've de-indented out of
    while (stack.length > 1 && sig.indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const ctx = stack[stack.length - 1];

    if (sig.parallel) {
      // New parallel child within current context
      const childId   = ctx.nextChildId++;
      const childPath = ctx.contextPath === ''
        ? String(childId)
        : `${ctx.contextPath}.${childId}`;
      sig.contextPath = childPath;
      // Push a new context frame for signals indented under this thread
      stack.push({ indent: sig.indent, contextPath: childPath, nextChildId: 1 });
    } else {
      // Sequential — belongs to the current context (main rail or thread interior)
      sig.contextPath = ctx.contextPath;
    }
  }

  return { signals, errors };
}
