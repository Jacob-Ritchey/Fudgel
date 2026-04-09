// ── Fudgel parser (vanilla JS port) ──────────────────────────────────────────
// Covers: tokenizer, Bija section parser, top-level file splitter.

// ── Tokenizer ─────────────────────────────────────────────────────────────────

function stripComments(line) {
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

function countIndent(line) {
  let n = 0;
  for (const ch of line) {
    if (ch === ' ') n++;
    else if (ch === '\t') n += 4;
    else break;
  }
  return n;
}

const SECTION_RE = /^@(\w+)$/;
const ENTITY_RE          = /^([A-Za-z]\w*)(?:\s*:\s*#(\w[\w.]*)(?:\s*\|\s*(.*?)\s*\|)?)?\s*;$/;
const ENTITY_BARE_POS_RE = /^[A-Za-z]\w*\s*\|[^|]*\|\s*;$/;
const PROP_RE    = /^([A-Za-z]\w*)\s*:/;

function tokenizeLine(raw, lineNum) {
  const indent   = countIndent(raw);
  const stripped = stripComments(raw).trim();

  if (stripped === '') return { kind: 'blank',    raw, stripped, indent, lineNum };
  if (SECTION_RE.test(stripped)) return { kind: 'section',  raw, stripped, indent, lineNum };
  if (ENTITY_RE.test(stripped))          return { kind: 'entity',   raw, stripped, indent, lineNum };
  if (ENTITY_BARE_POS_RE.test(stripped)) return { kind: 'entity',   raw, stripped, indent, lineNum };
  if (/^[-*]\s/.test(stripped) || stripped === '-' || stripped === '*')
    return { kind: 'list_item', raw, stripped, indent, lineNum };
  if (PROP_RE.test(stripped))    return { kind: 'property', raw, stripped, indent, lineNum };
  return { kind: 'unknown', raw, stripped, indent, lineNum };
}

function tokenizeFile(source) {
  return source.split('\n').map((raw, i) => tokenizeLine(raw, i + 1));
}

// ── Value parsing ─────────────────────────────────────────────────────────────

function parseMetadata(raw) {
  const match = raw.match(/\{([^}]*)\}\s*$/);
  if (!match) return { metadata: [], rest: raw.trim() };
  const metadata = match[1].split(',').map(s => s.trim()).filter(Boolean);
  return { metadata, rest: raw.slice(0, raw.lastIndexOf('{')).trim() };
}

function parseValue(raw) {
  const v = raw.trim();
  if (v === '' || v === 'null') return { kind: 'literal', value: 'empty' };
  if (v === '-') return { kind: 'list_ordered' };
  if (v === '*') return { kind: 'list_unordered' };

  if (v.startsWith('=')) {
    return { kind: 'valuecopy', path: v.slice(1).split('.') };
  }

  const posMatch = v.match(/^\|\s*(.*?)\s*\|$/);
  if (posMatch) {
    return { kind: 'positional', values: posMatch[1].split(',').map(s => s.trim()).filter(Boolean) };
  }

  if (v.startsWith('#')) {
    const mulMatch = v.match(/^(#[\w.]+)\s*!(\d+)(?:\s*\|\s*(.*?)\s*\|)?$/);
    if (mulMatch) return {
      kind: 'multiplier',
      template: mulMatch[1].slice(1),
      count: parseInt(mulMatch[2], 10),
      overrides: mulMatch[3] ? mulMatch[3].split(',').map(s => s.trim()) : [],
    };

    const refPosMatch = v.match(/^#([\w.]+)\s*\|\s*(.*?)\s*\|$/);
    if (refPosMatch) return { kind: 'reference', path: refPosMatch[1].split('.') };

    const refMatch = v.match(/^#([\w.]+)$/);
    if (refMatch) return { kind: 'reference', path: refMatch[1].split('.') };
  }

  return { kind: 'literal', value: v };
}

// ── Entity line parsing ───────────────────────────────────────────────────────

function parseEntityLine(stripped) {
  const withoutSemi = stripped.replace(/;$/, '').trim();

  // Bare positional (no colon): Name | v1, v2 |
  const barePosMatch = withoutSemi.match(/^([A-Za-z]\w*)\s*\|\s*(.*?)\s*\|$/);
  if (barePosMatch) {
    const overrides = barePosMatch[2].split(',').map(s => s.trim());
    return { name: barePosMatch[1], overrides };
  }

  const colonIdx = withoutSemi.indexOf(':');
  if (colonIdx === -1) return { name: withoutSemi.trim() };

  const name = withoutSemi.slice(0, colonIdx).trim();
  const rest = withoutSemi.slice(colonIdx + 1).trim();

  if (rest.startsWith('#')) {
    const posMatch = rest.match(/^#([\w.]+)\s*\|\s*(.*?)\s*\|$/);
    if (posMatch) {
      const overrides = posMatch[2].split(',').map(s => s.trim());
      return { name, template: posMatch[1], overrides };
    }
    const refMatch = rest.match(/^#([\w.]+)$/);
    if (refMatch) return { name, template: refMatch[1] };
  }

  return { name };
}

// ── Bija section parser ───────────────────────────────────────────────────────

function parseBijaSection(tokens, errors) {
  const root = [];
  const stack = []; // { node, indent, listCounter }

  function currentChildren() {
    return stack.length === 0 ? root : stack[stack.length - 1].node.children;
  }

  function popTo(indent) {
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop();
  }

  let bracketAccum = null; // null | { entry, lines: string[] }

  for (const tok of tokens) {
    // ── Multi-line bracket accumulation ───────────────────────────────────────
    // Intercept ALL tokens (including blank) while inside a [...] span
    if (bracketAccum !== null) {
      const closeIdx = tok.raw.indexOf(']');
      if (closeIdx !== -1) {
        bracketAccum.lines.push(tok.raw.slice(0, closeIdx));
        const content = bracketAccum.lines.join('\n').trim();
        const afterClose = tok.raw.slice(closeIdx + 1).trim();
        const { metadata } = afterClose ? parseMetadata(afterClose) : { metadata: [] };
        bracketAccum.entry.value    = { kind: 'literal', value: content, raw: true };
        bracketAccum.entry.metadata = metadata;
        bracketAccum = null;
      } else {
        bracketAccum.lines.push(tok.raw); // verbatim — comments preserved
      }
      continue;
    }

    if (tok.kind === 'blank') continue;

    if (tok.kind === 'entity') {
      popTo(tok.indent);
      const { name, template, overrides } = parseEntityLine(tok.stripped);
      const node = { kind: 'entity', name, children: [], line: tok.lineNum };
      if (template) node.template = template;
      if (overrides) {
        if (template) {
          // Template + positional: stored for expander to apply against template props
          node.overrides = overrides;
        } else {
          // Bare positional: empty slots are a syntax error (no template to skip against)
          if (overrides.some(v => v === '')) {
            errors.push({ message: `Bare positional '${name}' has empty slot(s) — skip syntax is only valid on template overrides`, line: tok.lineNum });
          } else {
            overrides.forEach((val) => {
              node.children.push({ kind: 'property', name: val, value: { kind: 'literal', value: 'empty' }, metadata: [], children: [], line: tok.lineNum });
            });
          }
        }
      }
      currentChildren().push(node);
      stack.push({ node, indent: tok.indent, listCounter: 0 });
      continue;
    }

    if (tok.kind === 'property') {
      popTo(tok.indent);
      const colonIdx = tok.stripped.indexOf(':');
      if (colonIdx === -1) { errors.push({ message: "Expected ':' in property", line: tok.lineNum }); continue; }
      const name = tok.stripped.slice(0, colonIdx).trim();
      if (!/^[A-Za-z]/.test(name)) { errors.push({ message: `Property name '${name}' must begin with a letter`, line: tok.lineNum }); continue; }
      const rawValue = tok.stripped.slice(colonIdx + 1).trim();

      // ── Raw bracket value: name: [...] ──────────────────────────────────────
      // Use tok.raw to preserve comments and all content inside the brackets.
      if (rawValue.startsWith('[')) {
        const rawAfterColon = tok.raw.slice(tok.raw.indexOf(':') + 1).trim();
        const openIdx  = rawAfterColon.indexOf('[');
        const closeIdx = rawAfterColon.indexOf(']', openIdx + 1);
        if (closeIdx !== -1) {
          // Single-line: name: [content] or name: [content] {metadata}
          const content    = rawAfterColon.slice(openIdx + 1, closeIdx);
          const afterClose = rawAfterColon.slice(closeIdx + 1).trim();
          const { metadata } = afterClose ? parseMetadata(afterClose) : { metadata: [] };
          currentChildren().push({ kind: 'property', name, value: { kind: 'literal', value: content, raw: true }, metadata, children: [], line: tok.lineNum });
        } else {
          // Multi-line: name: [   (closing ] found on a later line)
          const initialContent = rawAfterColon.slice(openIdx + 1);
          const entry = { kind: 'property', name, value: null, metadata: [], children: [], line: tok.lineNum };
          currentChildren().push(entry);
          bracketAccum = { entry, lines: [initialContent] };
        }
        continue;
      }

      const { metadata, rest } = parseMetadata(rawValue);
      const value = parseValue(rest);

      // List shorthands become entity nodes so bare-word children can nest inside
      if (value.kind === 'list_ordered' || value.kind === 'list_unordered') {
        const listMode = value.kind === 'list_ordered' ? 'ordered' : 'unordered';
        const node = { kind: 'entity', name, children: [], line: tok.lineNum };
        currentChildren().push(node);
        stack.push({ node, indent: tok.indent, listCounter: 0, listMode });
        continue;
      }

      currentChildren().push({ kind: 'property', name, value, metadata, line: tok.lineNum });
      continue;
    }

    if (tok.kind === 'list_item') {
      popTo(tok.indent);
      const parent = stack[stack.length - 1];
      if (!parent) { errors.push({ message: 'List item outside any entity', line: tok.lineNum }); continue; }
      const isOrdered = tok.stripped.startsWith('-');
      const text = tok.stripped.replace(/^[-*]\s*/, '').trim();
      const itemName = isOrdered ? String(parent.listCounter) : text;
      const item = { kind: 'entity', name: itemName, children: [], line: tok.lineNum };
      if (isOrdered && text) item.children.push({ kind: 'property', name: 'value', value: { kind: 'literal', value: text }, metadata: [], line: tok.lineNum });
      if (isOrdered) parent.listCounter++;
      currentChildren().push(item);
      continue;
    }

    if (tok.kind === 'unknown') {
      popTo(tok.indent);
      const parent = stack[stack.length - 1];
      if (parent && parent.listMode) {
        if (parent.listMode === 'ordered') {
          currentChildren().push({ kind: 'property', name: String(parent.listCounter), value: { kind: 'literal', value: tok.stripped }, metadata: [], line: tok.lineNum });
          parent.listCounter++;
        } else {
          currentChildren().push({ kind: 'property', name: tok.stripped, value: { kind: 'literal', value: 'empty' }, metadata: [], children: [], line: tok.lineNum });
        }
      } else {
        errors.push({ message: `Unexpected syntax: '${tok.stripped}'`, line: tok.lineNum });
      }
    }
  }

  return root;
}

// ── Top-level file parser ─────────────────────────────────────────────────────

const BIJA_LIBS = new Set(['Bija', 'Ehto', 'Primi']);

function parseFudgelFile(source) {
  const errors = [];
  const tokens = tokenizeFile(source);
  const sections = [];

  let currentLib = null;
  let sectionStartLine = 1;
  let sectionTokens = [];
  const groups = [];

  for (const tok of tokens) {
    if (tok.kind === 'section') {
      if (currentLib !== null) groups.push({ lib: currentLib, line: sectionStartLine, toks: sectionTokens });
      currentLib = tok.stripped.slice(1);
      sectionStartLine = tok.lineNum;
      sectionTokens = [];
    } else if (currentLib !== null) {
      sectionTokens.push(tok);
    } else if (tok.kind !== 'blank') {
      errors.push({ message: 'Content before first @section declaration', line: tok.lineNum });
    }
  }
  if (currentLib !== null) groups.push({ lib: currentLib, line: sectionStartLine, toks: sectionTokens });

  for (const group of groups) {
    const sectionErrors = [];
    const children = BIJA_LIBS.has(group.lib) ? parseBijaSection(group.toks, sectionErrors) : [];
    errors.push(...sectionErrors);
    sections.push({ kind: 'section', library: group.lib, line: group.line, children });
  }

  return { sections, errors };
}

function getBijaSections(file) {
  return file.sections.filter(s => BIJA_LIBS.has(s.library));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function directProperties(decls) {
  return decls.filter(d => d.kind === 'property');
}

function directEntities(decls) {
  return decls.filter(d => d.kind === 'entity');
}
