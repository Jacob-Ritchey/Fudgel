// ── Fudgel schema renderer (DOM + SVG) ───────────────────────────────────────

const NODE_W    = 240;
const NODE_H_BASE = 60;  // header + some padding
const H_GAP     = 60;
const V_GAP     = 24;

// ── Layout ────────────────────────────────────────────────────────────────────

function collectAllEntities(decls, parentPath, depth, result) {
  for (const decl of decls) {
    if (decl.kind !== 'entity') continue;
    const path = parentPath ? `${parentPath}.${decl.name}` : decl.name;
    result.push({ node: decl, path, depth, parentPath });
    collectAllEntities(decl.children, path, depth + 1, result);
  }
}

function layoutEntities(flatList) {
  // Group by depth
  const columns = {};
  for (const item of flatList) {
    if (!columns[item.depth]) columns[item.depth] = [];
    columns[item.depth].push(item);
  }

  const depths = Object.keys(columns).map(Number).sort((a, b) => a - b);
  const positions = {};
  const colHeights = {};

  for (const depth of depths) {
    const col = columns[depth];
    let y = 20;

    // If there's a parent, try to start near the parent's y
    for (const item of col) {
      if (item.parentPath && positions[item.parentPath]) {
        const parentY = positions[item.parentPath].y;
        if (y < parentY) y = parentY;
      }
      const x = 20 + depth * (NODE_W + H_GAP);
      positions[item.path] = { x, y };
      y += estimateCardHeight(item.node) + V_GAP;
    }
    colHeights[depth] = y;
  }

  return positions;
}

function estimateCardHeight(node) {
  const props = directProperties(node.children);
  const entities = directEntities(node.children);
  let h = 36; // header
  if (node.template) h += 26; // definition bar
  if (props.length > 0) {
    const subPropCount = props.reduce((n, p) => n + (p.children ? p.children.length : 0), 0);
    h += 22 + (props.length + subPropCount) * 22; // section toggle + rows + sub-rows
  }
  if (entities.length > 0) h += 40; // sub-entities section
  return Math.max(h, 60);
}

// ── Value display ─────────────────────────────────────────────────────────────

function valueText(value) {
  if (!value) return '';
  switch (value.kind) {
    case 'literal':        return value.value;
    case 'reference':      return '#' + value.path.join('.');
    case 'valuecopy':      return '=' + value.path.join('.');
    case 'list_ordered':   return '— list';
    case 'list_unordered': return '* list';
    case 'multiplier':     return `#${value.template} ×${value.count}`;
    case 'positional':     return `| ${value.values.join(', ')} |`;
    default:               return '';
  }
}

function valueClass(value) {
  if (!value) return '';
  if (value.kind === 'literal' && value.raw) return 'raw-string';
  if (value.kind === 'reference')  return 'ref';
  if (value.kind === 'valuecopy')  return 'copy';
  return '';
}

// ── Card rendering ────────────────────────────────────────────────────────────

function renderCard(item) {
  const node = item.node;
  const props = directProperties(node.children);
  const subEntities = directEntities(node.children);
  const isRoot = item.depth === 0;

  const card = document.createElement('div');
  card.className = 'entity-card' + (isRoot ? ' root-entity' : '');
  card.dataset.path = item.path;

  // Header
  const header = document.createElement('div');
  header.className = 'card-header';
  header.innerHTML = `
    <span class="card-icon">⬡</span>
    <span class="card-title">${escapeHtml(node.name)}</span>
    <span class="card-depth">${item.depth}</span>
  `;
  card.appendChild(header);

  // Definition (template reference)
  if (node.template) {
    const def = document.createElement('div');
    def.className = 'card-definition';
    def.innerHTML = `Definition: <span class="ref">#${escapeHtml(node.template)}</span>`;
    card.appendChild(def);
  }

  // Properties section
  if (props.length > 0) {
    const section = document.createElement('div');
    section.className = 'card-section';

    const toggle = document.createElement('button');
    toggle.className = 'section-toggle';
    toggle.innerHTML = `<span>Attributes</span><span>▾</span>`;

    const propsDiv = document.createElement('div');
    propsDiv.className = 'card-props';

    for (const prop of props) {
      const row = document.createElement('div');
      row.className = 'prop-row';
      row.dataset.prop = prop.name;
      const valText = valueText(prop.value);
      const valCls  = valueClass(prop.value);
      const metaHtml = prop.metadata && prop.metadata.length > 0
        ? `<span class="prop-meta">{${prop.metadata.join(',')}}</span>`
        : '';
      row.innerHTML = `
        <span class="prop-name">${escapeHtml(prop.name)}</span>
        <span class="prop-value ${valCls}">${escapeHtml(valText)}</span>
        ${metaHtml}
      `;
      propsDiv.appendChild(row);

      // Render child properties (e.g. metadata booleans: required: true)
      if (prop.children && prop.children.length > 0) {
        for (const sub of prop.children) {
          if (sub.kind !== 'property') continue;
          const subRow = document.createElement('div');
          subRow.className = 'prop-row sub-prop';
          subRow.innerHTML = `
            <span class="prop-name">${escapeHtml(sub.name)}</span>
            <span class="prop-value ${valueClass(sub.value)}">${escapeHtml(valueText(sub.value))}</span>
          `;
          propsDiv.appendChild(subRow);
        }
      }
    }

    toggle.addEventListener('click', () => {
      const hidden = propsDiv.style.display === 'none';
      propsDiv.style.display = hidden ? '' : 'none';
      toggle.querySelector('span:last-child').textContent = hidden ? '▾' : '▸';
    });

    section.appendChild(toggle);
    section.appendChild(propsDiv);
    card.appendChild(section);
  }

  // Sub-entities section
  if (subEntities.length > 0) {
    const subSection = document.createElement('div');
    subSection.className = 'card-section sub-entities-section';
    const label = document.createElement('span');
    label.className = 'sub-label';
    label.textContent = 'Sub-entities';
    const badges = document.createElement('div');
    badges.className = 'sub-badges';
    for (const sub of subEntities) {
      const badge = document.createElement('span');
      badge.className = 'sub-badge';
      badge.textContent = sub.name;
      badges.appendChild(badge);
    }
    subSection.appendChild(label);
    subSection.appendChild(badges);
    card.appendChild(subSection);
  }

  return card;
}

// ── Edge drawing ──────────────────────────────────────────────────────────────

function drawEdges(svg, flatList, positions, canvasEl) {
  const canvasRect = canvasEl.getBoundingClientRect();
  svg.innerHTML = '';

  // Arrow marker for reference edges
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <marker id="arrow-ref" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#67e8f9" />
    </marker>
  `;
  svg.appendChild(defs);

  // Build path lookup
  const pathIndex = {};
  for (const item of flatList) pathIndex[item.path] = item;

  for (const item of flatList) {
    const pos = positions[item.path];
    if (!pos) continue;
    const cardEl = canvasEl.querySelector(`[data-path="${CSS.escape(item.path)}"]`);
    if (!cardEl) continue;

    // Hierarchy edges: parent → this
    if (item.parentPath && positions[item.parentPath]) {
      const parentEl = canvasEl.querySelector(`[data-path="${CSS.escape(item.parentPath)}"]`);
      if (parentEl) {
        drawBezier(svg, parentEl, cardEl, canvasEl, '#3d3d55', true, null);
      }
    }

    // Reference edges: property #ref → target entity
    for (const prop of directProperties(item.node.children)) {
      if (prop.value && prop.value.kind === 'reference') {
        const refPath = prop.value.path.join('.');
        // Try exact match, then try relative (prepend parent path)
        let targetEl = canvasEl.querySelector(`[data-path="${CSS.escape(refPath)}"]`);
        if (!targetEl && item.parentPath) {
          const relPath = item.parentPath + '.' + refPath;
          targetEl = canvasEl.querySelector(`[data-path="${CSS.escape(relPath)}"]`);
        }
        if (targetEl && targetEl !== cardEl) {
          drawBezier(svg, cardEl, targetEl, canvasEl, '#67e8f9', false, prop.name);
        }
      }
    }
  }
}

function drawBezier(svg, fromEl, toEl, canvasEl, color, dashed, label) {
  const canvasRect = canvasEl.getBoundingClientRect();
  const fromRect   = fromEl.getBoundingClientRect();
  const toRect     = toEl.getBoundingClientRect();

  // from: right-center of source card
  const x1 = fromRect.right  - canvasRect.left + canvasEl.scrollLeft;
  const y1 = fromRect.top    - canvasRect.top  + canvasEl.scrollTop + fromRect.height / 2;
  // to: left-center of target card
  const x2 = toRect.left     - canvasRect.left + canvasEl.scrollLeft;
  const y2 = toRect.top      - canvasRect.top  + canvasEl.scrollTop + toRect.height / 2;

  const cx = (x1 + x2) / 2;

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', `M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', color);
  path.setAttribute('stroke-width', dashed ? '1' : '1.5');
  if (dashed) path.setAttribute('stroke-dasharray', '4 3');
  if (!dashed) path.setAttribute('marker-end', 'url(#arrow-ref)');
  path.setAttribute('opacity', '0.6');
  svg.appendChild(path);

  if (label) {
    const mx = cx;
    const my = (y1 + y2) / 2 - 6;
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', mx);
    text.setAttribute('y', my);
    text.setAttribute('fill', '#94a3b8');
    text.setAttribute('font-size', '9');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-family', 'monospace');
    text.textContent = label;
    svg.appendChild(text);
  }
}

// ── Main render entry point ───────────────────────────────────────────────────

function renderSchema(parsedFile, filterMode) {
  const canvas  = document.getElementById('schema-canvas');
  const inner   = document.getElementById('schema-inner');
  const svgEl   = document.getElementById('schema-edges');

  // Clear all card types (entity, rumus, viesti) so mode switches don't overlap
  document.getElementById('schema-pane').querySelector('.all-run-btn')?.remove();
  inner.querySelectorAll('.entity-card').forEach(c => c.remove());
  inner.querySelectorAll('.rumus-card').forEach(c => c.remove());
  inner.querySelectorAll('.vi-signal-rail, .vi-empty, .all-static-label, .all-row-sep').forEach(c => c.remove());
  svgEl.innerHTML = '';
  svgEl.style.display = '';

  // Collect entities
  const bijaSections = filterMode === 'bija'
    ? getBijaSections(parsedFile)
    : parsedFile.sections;

  const allDecls = bijaSections.flatMap(s => s.children);
  const flatList = [];
  collectAllEntities(allDecls, '', 0, flatList);

  if (flatList.length === 0) {
    let empty = inner.querySelector('.schema-empty');
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'schema-empty';
      empty.textContent = 'No entities to display';
      inner.appendChild(empty);
    }
    updateEntityCount(0);
    return;
  }

  // Remove empty state if present
  const empty = inner.querySelector('.schema-empty');
  if (empty) empty.remove();

  // Layout
  const positions = layoutEntities(flatList);

  // Find canvas size needed
  let maxX = 0, maxY = 0;
  for (const item of flatList) {
    const pos = positions[item.path];
    if (!pos) continue;
    maxX = Math.max(maxX, pos.x + NODE_W + 20);
    maxY = Math.max(maxY, pos.y + estimateCardHeight(item.node) + 20);
  }
  inner.style.width  = maxX + 'px';
  inner.style.height = maxY + 'px';
  svgEl.setAttribute('width',  maxX);
  svgEl.setAttribute('height', maxY);

  // Render cards
  for (const item of flatList) {
    const pos = positions[item.path];
    if (!pos) continue;
    const card = renderCard(item);
    card.style.left = pos.x + 'px';
    card.style.top  = pos.y + 'px';
    inner.appendChild(card);
  }

  // Draw edges after cards are in the DOM (need layout)
  requestAnimationFrame(() => {
    // Restack each depth-column using actual rendered heights
    const colGroups = {};
    for (const item of flatList) {
      (colGroups[item.depth] = colGroups[item.depth] || []).push(item);
    }
    let canvasMaxY = 0;
    for (const depth of Object.keys(colGroups).map(Number).sort((a, b) => a - b)) {
      let y = 20;
      for (const item of colGroups[depth]) {
        const cardEl = inner.querySelector(`[data-path="${CSS.escape(item.path)}"]`);
        if (!cardEl) continue;
        cardEl.style.top = y + 'px';
        y += cardEl.offsetHeight + V_GAP;
      }
      canvasMaxY = Math.max(canvasMaxY, y);
    }
    inner.style.height = canvasMaxY + 'px';
    svgEl.setAttribute('height', canvasMaxY);

    drawEdges(svgEl, flatList, positions, canvas);
  });

  updateEntityCount(flatList.filter(i => i.depth === 0).length);
}

function updateEntityCount(n) {
  const el = document.getElementById('entity-count');
  if (el) el.textContent = `${n} ${n === 1 ? 'entity' : 'entities'}`;
}

// ── Utility ───────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
