// ── Viesti expander — HTML serializer ─────────────────────────────────────────
// Renders the Viesti source as syntax-highlighted HTML for the middle panel.
// Preserves the source-faithful form (comments as section headers, signal lines).
//
// CSS classes:
//   vi-section      — comment lines used as section separators
//   vi-src          — source address
//   vi-op           — ~ tilde operator (sequential)
//   vi-parallel-op  — ~~ tilde operator (parallel)
//   vi-fn           — function name in compound form
//   vi-target       — destination address
//   vi-dormant      — trailing open ~ with no target
//   vi-unresolved   — address that doesn't match a known dotted or bare-fn pattern

function viestiToHtml(source) {
  if (!source) return '';

  const lines  = source.split('\n');
  const output = [];
  let inViesti = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    // Section header
    if (/^@\w+/.test(trimmed)) {
      inViesti = trimmed === '@Viesti';
      output.push(`<span class="vi-section">${escapeHtml(trimmed)}</span>`);
      continue;
    }

    if (!inViesti) {
      output.push(escapeHtml(rawLine));
      continue;
    }

    // Comment / section separator line — strip from expanded view
    if (/^\(/.test(trimmed)) continue;

    // Blank line
    if (!trimmed) {
      output.push('');
      continue;
    }

    // Signal line — pass the RAW line so leading whitespace is preserved
    output.push(renderSignalLine(rawLine));
  }

  return output.join('\n');
}

// ── Signal line renderer ──────────────────────────────────────────────────────

function renderSignalLine(rawLine) {
  // Extract leading whitespace and content separately
  const indent  = rawLine.length - rawLine.trimStart().length;
  const content = rawLine.trimStart();
  const stripped = stripViestiComments(content).trim();

  // Reconstruct indent as literal spaces (preserved in <pre>)
  const indentHtml = indent > 0 ? escapeHtml(rawLine.slice(0, indent)) : '';

  if (!stripped) return indentHtml;

  // ── Tokenize: split on ~~ and ~ while preserving each operator ────────────
  // "a ~ b ~~ c" → ['a', '~', 'b', '~~', 'c']
  const tokens = stripped.split(/(~~|~)/).map(s => s.trim());

  if (tokens.length < 3 || tokens.length % 2 === 0) {
    return indentHtml + escapeHtml(content);
  }

  // ── Render one display line per adjacent pair ─────────────────────────────
  const result = [];
  if (indentHtml) result.push(indentHtml);

  for (let i = 0; i < tokens.length - 2; i += 2) {
    const addr    = tokens[i];
    const op      = tokens[i + 1];
    const next    = tokens[i + 2];
    const opClass = op === '~~' ? 'vi-parallel-op' : 'vi-op';

    if (i > 0) { result.push('\n'); if (indentHtml) result.push(indentHtml); }
    result.push(addrSpan(addr, 'vi-src'));
    result.push(` <span class="${opClass}">${op}</span> `);
    if (next) {
      result.push(addrSpan(next, 'vi-target'));
    } else {
      result.push(`<span class="vi-dormant">${op}</span>`);
    }
  }

  return result.join('');
}

// ── Address span helper ───────────────────────────────────────────────────────

function addrSpan(addr, baseClass) {
  // A "resolved-looking" address has a dot (Bija path) or is a bare identifier (Rumus fn)
  // In expander we can't know true resolution — just flag bare identifiers without dots
  // as potentially Rumus references (they get vi-fn styling implicitly via caller)
  const extra = addr.includes('.') ? '' : ' vi-unresolved';
  return `<span class="${baseClass}${extra}">${escapeHtml(addr)}</span>`;
}
