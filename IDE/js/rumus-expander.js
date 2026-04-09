// ── Rumus expander — HTML serializer ──────────────────────────────────────────
// Renders the expanded Bija-ified form of Rumus functions for the middle panel.
//
// Expanded form example:
//   ? clamp;
//       x: true
//       min: true
//       max: true
//       belowMin: x < min ? min : x
//       result: belowMin > max ? max : belowMin
//       ~result

function rumusToHtml(functions) {
  if (!functions || functions.length === 0) return '';
  const lines = [];

  lines.push(`<span class="rm-section">@Rumus</span>`);
  lines.push('');

  for (const fn of functions) {
    // Function declaration
    lines.push(`<span class="rm-fn">? ${escapeHtml(fn.name)};</span>`);

    // Parameters — expanded from {x, min, max} to param: true
    for (const param of fn.params) {
      lines.push(`    <span class="rm-param">${escapeHtml(param)}:</span> <span class="rm-bool">true</span>`);
    }

    // Body — bindings and assertions interleaved
    for (const entry of fn.body) {
      if (entry.kind === 'binding') {
        const exprHtml = highlightExpr(entry.expr);
        lines.push(`    <span class="rm-pn">${escapeHtml(entry.name)}:</span> ${exprHtml}`);
      } else if (entry.kind === 'assertion') {
        const exprHtml = highlightExpr(entry.expr);
        lines.push(`    <span class="rm-assert">${exprHtml}</span>`);
      }
    }

    // Outputs
    if (fn.outputs.length > 0) {
      lines.push(`    <span class="rm-out">~${escapeHtml(fn.outputs.join(', '))}</span>`);
    }

    lines.push('');
  }

  return lines.join('\n');
}

// ── Expression syntax highlighter ─────────────────────────────────────────────

function highlightExpr(expr) {
  if (!expr) return '';
  // Tokenise the expression into: identifiers, numbers, operators, whitespace
  const tokens = [];
  let i = 0;
  while (i < expr.length) {
    // Identifier
    if (/[A-Za-z_]/.test(expr[i])) {
      let j = i;
      while (j < expr.length && /[\w]/.test(expr[j])) j++;
      tokens.push({ type: 'ident', val: expr.slice(i, j) });
      i = j;
      continue;
    }
    // Number
    if (/[0-9.]/.test(expr[i])) {
      let j = i;
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
      tokens.push({ type: 'num', val: expr.slice(i, j) });
      i = j;
      continue;
    }
    // Multi-char operators — longest match first
    if (i + 2 < expr.length) {
      const three = expr.slice(i, i + 3);
      if (three === '<->') {
        tokens.push({ type: 'logic-op', val: three });
        i += 3;
        continue;
      }
    }
    if (i + 1 < expr.length) {
      const two = expr.slice(i, i + 2);
      if (two === '->' || two === '<-' || two === '!&' || two === '!|') {
        tokens.push({ type: 'logic-op', val: two });
        i += 2;
        continue;
      }
      if (['!=', '>=', '<='].includes(two)) {
        tokens.push({ type: 'op', val: two });
        i += 2;
        continue;
      }
    }
    // Single-char operators / punctuation (no >> or <<)
    if ('+-*/%&|^<>?:!='.includes(expr[i])) {
      tokens.push({ type: 'op', val: expr[i] });
      i++;
      continue;
    }
    // Whitespace / other — pass through raw
    tokens.push({ type: 'raw', val: expr[i] });
    i++;
  }

  return tokens.map(t => {
    switch (t.type) {
      case 'ident':    return `<span class="rm-ident">${escapeHtml(t.val)}</span>`;
      case 'num':      return `<span class="rm-num">${escapeHtml(t.val)}</span>`;
      case 'op':       return `<span class="rm-op">${escapeHtml(t.val)}</span>`;
      case 'logic-op': return `<span class="rm-logic-op">${escapeHtml(t.val)}</span>`;
      default:         return escapeHtml(t.val);
    }
  }).join('');
}
