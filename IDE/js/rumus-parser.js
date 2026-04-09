// ── Rumus parser ───────────────────────────────────────────────────────────────
// Parses @Rumus sections into function nodes.
//
// AST node:
//   { kind: 'function', name, params: [...], body: [...], outputs: [...], line }
//
// body entries are one of:
//   { kind: 'binding',   name, expr, line }  — named binding: `varName: expression`
//   { kind: 'assertion', expr, line }         — formal logic assertion (must hold)
//
// Syntax:
//   ? FunctionName{param1, param2};   (with params)
//   ? FunctionName;                   (no params)
//       varName: expression           (binding)
//       a -> b                        (assertion — any unlabeled formal-logic stmt)
//       ~output1, output2             (outputs)

// ── Comment stripping (same as Bija) ──────────────────────────────────────────

function rumusStripComments(line) {
  let result = '';
  let depth = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '(') { depth++; continue; }
    if (ch === ')') { depth = Math.max(0, depth - 1); continue; }
    if (depth === 0) result += ch;
  }
  return result;
}

function rumusCountIndent(line) {
  let n = 0;
  for (const ch of line) {
    if (ch === ' ') n++;
    else if (ch === '\t') n += 4;
    else break;
  }
  return n;
}

// ── Tokenizer ─────────────────────────────────────────────────────────────────

const RUMUS_SECTION_RE = /^@(\w+)$/;
const RUMUS_FN_RE      = /^\?\s*([A-Za-z]\w*)(?:\{([^}]*)\})?\s*;$/;
const RUMUS_OUT_RE     = /^~(.+)$/;
const RUMUS_PROP_RE    = /^([A-Za-z]\w*)\s*:/;

// Assertion: indented non-blank line that is NOT a binding (no leading `name:`)
// and NOT an output (~). Any content that reaches this point inside a function body.
const RUMUS_ASSERT_RE  = /^[^:~?@]/;

function rumusTokenizeLine(raw, lineNum) {
  const indent   = rumusCountIndent(raw);
  const stripped = rumusStripComments(raw).trim();

  if (stripped === '') return { kind: 'blank', raw, stripped, indent, lineNum };
  if (RUMUS_SECTION_RE.test(stripped)) return { kind: 'section', raw, stripped, indent, lineNum };
  if (RUMUS_FN_RE.test(stripped))      return { kind: 'function', raw, stripped, indent, lineNum };
  if (RUMUS_OUT_RE.test(stripped))     return { kind: 'output', raw, stripped, indent, lineNum };
  if (RUMUS_PROP_RE.test(stripped))    return { kind: 'property', raw, stripped, indent, lineNum };
  // Any remaining indented content inside a function body is an assertion
  if (indent > 0 && RUMUS_ASSERT_RE.test(stripped)) return { kind: 'assertion', raw, stripped, indent, lineNum };
  return { kind: 'unknown', raw, stripped, indent, lineNum };
}

function rumusTokenizeFile(source) {
  return source.split('\n').map((raw, i) => rumusTokenizeLine(raw, i + 1));
}

// ── Section parser ─────────────────────────────────────────────────────────────

function parseRumusSection(tokens, errors) {
  const functions = [];
  let currentFn = null;

  for (const tok of tokens) {
    if (tok.kind === 'blank') continue;

    if (tok.kind === 'function') {
      const m = tok.stripped.match(RUMUS_FN_RE);
      if (!m) { errors.push({ message: `Malformed function declaration`, line: tok.lineNum }); continue; }
      const name   = m[1];
      const params = m[2] ? m[2].split(',').map(s => s.trim()).filter(Boolean) : [];
      currentFn = { kind: 'function', name, params, body: [], outputs: [], line: tok.lineNum };
      functions.push(currentFn);
      continue;
    }

    if (tok.kind === 'property') {
      if (!currentFn) { errors.push({ message: `Binding outside function`, line: tok.lineNum }); continue; }
      const colonIdx = tok.stripped.indexOf(':');
      const name = tok.stripped.slice(0, colonIdx).trim();
      const expr = tok.stripped.slice(colonIdx + 1).trim();
      currentFn.body.push({ kind: 'binding', name, expr, line: tok.lineNum });
      continue;
    }

    if (tok.kind === 'assertion') {
      if (!currentFn) { errors.push({ message: `Assertion outside function`, line: tok.lineNum }); continue; }
      currentFn.body.push({ kind: 'assertion', expr: tok.stripped, line: tok.lineNum });
      continue;
    }

    if (tok.kind === 'output') {
      if (!currentFn) { errors.push({ message: `Output declaration outside function`, line: tok.lineNum }); continue; }
      const m = tok.stripped.match(RUMUS_OUT_RE);
      const outputs = m[1].split(',').map(s => s.trim()).filter(Boolean);
      currentFn.outputs.push(...outputs);
      continue;
    }

    if (tok.kind === 'unknown') {
      errors.push({ message: `Unexpected syntax: '${tok.stripped}'`, line: tok.lineNum });
    }
  }

  return functions;
}

// ── Top-level file parser ──────────────────────────────────────────────────────

function parseRumusFile(source) {
  const errors    = [];
  const tokens    = rumusTokenizeFile(source);
  const functions = [];

  let currentLib      = null;
  let sectionTokens   = [];
  const groups        = [];

  for (const tok of tokens) {
    if (tok.kind === 'section') {
      if (currentLib !== null) groups.push({ lib: currentLib, toks: sectionTokens });
      currentLib    = tok.stripped.slice(1);
      sectionTokens = [];
    } else if (currentLib !== null) {
      sectionTokens.push(tok);
    }
  }
  if (currentLib !== null) groups.push({ lib: currentLib, toks: sectionTokens });

  for (const group of groups) {
    if (group.lib !== 'Rumus') continue;
    const sectionErrors = [];
    functions.push(...parseRumusSection(group.toks, sectionErrors));
    errors.push(...sectionErrors);
  }

  return { functions, errors };
}
