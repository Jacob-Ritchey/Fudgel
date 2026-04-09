// ── Fudgel expander ───────────────────────────────────────────────────────────
// Resolves all Bija shorthands into pure entity/property form (two passes):
//   Pass 1 — structural expansion:
//     - Template instantiations: copies template properties, applies positional overrides
//     - Multipliers:             #T !N → N named sub-entity instances
//     - Metadata booleans:       {required} → child property of the annotated property
//     - Lists:                   already entities from parser — pass through
//   Pass 2 — reference resolution:
//     - #entity.prop / =entity.prop → resolved to their static literal value

// ── Deep clone ────────────────────────────────────────────────────────────────

function cloneNode(node) {
  const n = Object.assign({}, node);
  if (n.children)  n.children  = n.children.map(cloneNode);
  if (n.value)     n.value     = Object.assign({}, n.value,
    n.value.path   ? { path:   [...n.value.path]   } : {},
    n.value.values ? { values: [...n.value.values] } : {}
  );
  if (n.metadata)  n.metadata  = [...n.metadata];
  if (n.overrides) n.overrides = [...n.overrides];
  return n;
}

// ── Build entity namespace ────────────────────────────────────────────────────

function buildNamespace(sections) {
  const ns = new Map();
  for (const section of sections) {
    if (!section.children) continue;
    for (const decl of section.children) {
      if (decl.kind === 'entity') ns.set(decl.name, decl);
    }
  }
  return ns;
}

// ── Pass 1: Structural expansion ──────────────────────────────────────────────

function expandEntity(entity, ns, depth) {
  if (depth > 8) return cloneNode(entity); // guard against circular templates

  const result = { kind: 'entity', name: entity.name, children: [], line: entity.line };

  // 1. If entity has a template, start with expanded template properties
  if (entity.template) {
    const tmpl = ns.get(entity.template);
    if (tmpl) {
      const expandedTmpl = expandEntity(tmpl, ns, depth + 1);
      const tmplProps = expandedTmpl.children.filter(c => c.kind === 'property');
      const overrides = entity.overrides || [];
      for (let i = 0; i < tmplProps.length; i++) {
        const prop = cloneNode(tmplProps[i]);
        if (i < overrides.length && overrides[i] !== '') {
          prop.value = { kind: 'literal', value: overrides[i] };
          // clear any metadata children from template when overriding
          prop.children = [];
        }
        result.children.push(prop);
      }
    }
  }

  // 2. Walk entity's own children
  for (const child of entity.children) {
    if (child.kind === 'property') {
      const metadata = child.metadata || [];

      // Multiplier: convert to a sub-entity containing N template instances
      if (child.value && child.value.kind === 'multiplier') {
        const mulEntity = { kind: 'entity', name: child.name, children: [], line: child.line };
        for (let i = 0; i < child.value.count; i++) {
          const inst = {
            kind: 'entity',
            name: `${child.value.template}_${i}`,
            template: child.value.template,
            overrides: child.value.overrides || [],
            children: [],
            line: child.line,
          };
          mulEntity.children.push(expandEntity(inst, ns, depth + 1));
        }
        result.children.push(mulEntity);
        continue;
      }

      // Metadata booleans → child properties of this property (not siblings)
      if (metadata.length > 0) {
        const propNode = Object.assign({}, cloneNode(child), { metadata: [], children: [] });
        for (const tag of metadata) {
          propNode.children.push({
            kind: 'property',
            name: tag,
            value: { kind: 'literal', value: 'true' },
            metadata: [],
            children: [],
            line: child.line,
          });
        }
        mergeOrPush(result.children, propNode);
        continue;
      }

      // Regular property — clone and merge (explicit props override template defaults)
      mergeOrPush(result.children, cloneNode(child));
      continue;
    }

    if (child.kind === 'entity') {
      result.children.push(expandEntity(child, ns, depth + 1));
    }
  }

  return result;
}

// Replace existing property by name, or push if new
function mergeOrPush(children, prop) {
  if (prop.kind !== 'property') { children.push(prop); return; }
  const idx = children.findIndex(c => c.kind === 'property' && c.name === prop.name);
  if (idx !== -1) children[idx] = prop;
  else children.push(prop);
}

// ── Pass 2: Reference resolution ──────────────────────────────────────────────

function buildPropertyLookup(expandedSections) {
  const map = new Map();

  function walkEntity(entity, fullPrefix) {
    for (const child of entity.children) {
      if (child.kind === 'property') {
        if (child.value && child.value.kind === 'literal') {
          const fullKey = `${fullPrefix}.${child.name}`;
          map.set(fullKey, child.value.value);
          // short key: entityName.propName (first occurrence wins)
          const shortKey = `${entity.name}.${child.name}`;
          if (!map.has(shortKey)) map.set(shortKey, child.value.value);
        }
        // Recurse into property children (properties-of-properties)
        if (child.children && child.children.length > 0) {
          // model as a pseudo-entity for path purposes
          const pseudoPrefix = `${fullPrefix}.${child.name}`;
          for (const sub of child.children) {
            if (sub.kind === 'property' && sub.value && sub.value.kind === 'literal') {
              map.set(`${pseudoPrefix}.${sub.name}`, sub.value.value);
            }
          }
        }
      } else if (child.kind === 'entity') {
        walkEntity(child, `${fullPrefix}.${child.name}`);
      }
    }
  }

  for (const section of expandedSections) {
    for (const decl of section.children) {
      if (decl.kind === 'entity') walkEntity(decl, decl.name);
    }
  }
  return map;
}

function resolveValue(value, lookup) {
  if (!value) return value;
  if (value.kind === 'reference' || value.kind === 'valuecopy') {
    const path = value.path.join('.');
    const resolved = lookup.get(path);
    if (resolved !== undefined) return { kind: 'literal', value: resolved };
  }
  return value;
}

function resolveEntityRefs(entity, lookup) {
  const result = Object.assign({}, entity, { children: [] });
  for (const child of entity.children) {
    if (child.kind === 'property') {
      const resolved = Object.assign({}, child, {
        value: resolveValue(child.value, lookup),
        children: child.children ? child.children.map(sub =>
          sub.kind === 'property'
            ? Object.assign({}, sub, { value: resolveValue(sub.value, lookup) })
            : sub
        ) : [],
      });
      result.children.push(resolved);
    } else if (child.kind === 'entity') {
      result.children.push(resolveEntityRefs(child, lookup));
    } else {
      result.children.push(child);
    }
  }
  return result;
}

function resolveReferences(expandedSections, lookup) {
  return expandedSections.map(section => ({
    ...section,
    children: section.children.map(decl =>
      decl.kind === 'entity' ? resolveEntityRefs(decl, lookup) : decl
    ),
  }));
}

// ── expandFile ────────────────────────────────────────────────────────────────

function expandFile(parsedFile) {
  const bijaSections = getBijaSections(parsedFile);
  const ns = buildNamespace(bijaSections);

  // Pass 1: structural expansion
  const pass1 = bijaSections.map(section => ({
    kind: section.kind,
    library: section.library,
    line: section.line,
    children: section.children.map(decl =>
      decl.kind === 'entity' ? expandEntity(decl, ns, 0) : cloneNode(decl)
    ),
  }));

  // Pass 2: resolve remaining references/valuecopies to literals
  const lookup = buildPropertyLookup(pass1);
  return resolveReferences(pass1, lookup);
}

// ── HTML serializer ───────────────────────────────────────────────────────────

function expandedToHtml(sections) {
  const lines = [];
  for (const section of sections) {
    lines.push(`<span class="ex-sec">@${escapeHtml(section.library)}</span>`);
    lines.push('');
    for (const decl of section.children) {
      if (decl.kind === 'entity') serializeEntity(decl, 0, lines);
    }
  }
  return lines.join('\n');
}

function serializeEntity(entity, depth, lines) {
  const indent = '    '.repeat(depth);
  lines.push(`${indent}<span class="ex-ent">${escapeHtml(entity.name)};</span>`);
  for (const child of entity.children) {
    if (child.kind === 'property') serializeProperty(child, depth + 1, lines);
    else if (child.kind === 'entity') serializeEntity(child, depth + 1, lines);
  }
}

function serializeProperty(prop, depth, lines) {
  const indent = '    '.repeat(depth);
  lines.push(`${indent}<span class="ex-pn">${escapeHtml(prop.name)}:</span> ${valueToHtml(prop.value)}`);
  if (prop.children && prop.children.length > 0) {
    for (const child of prop.children) {
      serializeProperty(child, depth + 1, lines);
    }
  }
}

function valueToHtml(value) {
  if (!value) return `<span class="ex-null">empty</span>`;
  switch (value.kind) {
    case 'literal':    return value.raw
      ? `<span class="ex-raw">[</span><span class="ex-val">${escapeHtml(value.value)}</span><span class="ex-raw">]</span>`
      : `<span class="ex-val">${escapeHtml(value.value)}</span>`;
    case 'reference':  return `<span class="ex-ref">#${escapeHtml(value.path.join('.'))}</span>`;
    case 'valuecopy':  return `<span class="ex-copy">=${escapeHtml(value.path.join('.'))}</span>`;
    case 'positional': return `<span class="ex-val">| ${escapeHtml(value.values.join(', '))} |</span>`;
    case 'multiplier': return `<span class="ex-ref">#${escapeHtml(value.template)}</span> <span class="ex-val">!${value.count}</span>`;
    default:           return `<span class="ex-null">${escapeHtml(String(value.kind))}</span>`;
  }
}
