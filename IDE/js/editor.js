// ── Fudgel editor (Monaco CDN setup) ─────────────────────────────────────────

function initEditor(container, defaultValue, onChange) {
  require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.0/min/vs' } });

  require(['vs/editor/editor.main'], function () {
    // ── fdg language definition ─────────────────────────────────────────────

    monaco.languages.register({ id: 'fdg' });

    monaco.languages.setMonarchTokensProvider('fdg', {
      defaultToken: '',
      tokenizer: {
        root: [
          // comments: (...)
          [/\(/, 'comment', '@comment'],

          // section headers: @Bija, @Rumus, etc.
          [/^@\w+/, 'keyword.section'],

          // ── Rumus-specific ────────────────────────────────────────────────

          // function declaration: ? FuncName{params};
          [/^(\?)(\s*)([A-Za-z]\w*)/, ['rumus.prefix', '', 'rumus.fn']],

          // output declaration: ~output1, output2
          [/^\s*~[A-Za-z][\w,\s]*/, 'rumus.output'],

          // formal logic operators (lowest precedence, distinct colour)
          [/<->|->|<-|!\||!&/, 'rumus.logic-op'],

          // comparison and arithmetic operators (no == or >> << — bitwise shifts removed)
          [/!=|>=|<=/, 'rumus.op'],
          [/[+\-*/%&|^<>?:!=]/, 'rumus.op'],

          // ── Bija-specific ─────────────────────────────────────────────────

          // entity declarations (line ending with ;)
          [/^([A-Za-z]\w*)(\s*:\s*)(#[\w.]+)(\s*\|[^|]*\|)?(\s*;)/, [
            'entity.name',
            'delimiter',
            'entity.ref',
            'keyword.operator',
            'delimiter',
          ]],
          [/^([A-Za-z]\w*)(\s*;)/, ['entity.name', 'delimiter']],

          // property lines
          [/^(\s+)([A-Za-z]\w*)(\s*:)/, ['', 'variable.name', 'delimiter']],

          // references
          [/#[\w.]+/, 'entity.ref'],

          // value copies
          [/=[\w.]+/, 'string.other'],

          // multiplier
          [/!\d+/, 'keyword.operator'],

          // positional shorthand
          [/\|[^|]*\|/, 'keyword.operator'],

          // metadata / param braces
          [/\{[^}]*\}/, 'meta.boolean'],

          // list markers
          [/^(\s*)([-*])(\s)/, ['', 'keyword.operator', '']],

          // ── Viesti-specific ───────────────────────────────────────────────

          // tilde signal operator
          [/~/, 'viesti.op'],

          // dotted addresses: Entity.property or Entity.sub.prop
          [/[A-Za-z]\w*(?:\.[A-Za-z]\w*)+/, 'viesti.addr'],

          // raw bracket string: [content] — multi-line capable
          [/\[/, { token: 'bija.raw', next: '@bijaRawString' }],

          // numbers
          [/\b\d+(\.\d+)?\b/, 'number'],

          // identifiers
          [/[A-Za-z_]\w*/, 'identifier'],
        ],

        bijaRawString: [
          [/[^\]]+/, 'bija.raw'],
          [/\]/, { token: 'bija.raw', next: '@pop' }],
        ],

        comment: [
          [/[^()]+/, 'comment'],
          [/\(/, 'comment', '@push'],
          [/\)/, 'comment', '@pop'],
        ],
      },
    });

    // ── fudgel-dark theme (warm amber CRT palette) ──────────────────────────

    monaco.editor.defineTheme('fudgel-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword.section',  foreground: 'e07b10', fontStyle: 'bold' },
        { token: 'rumus.prefix',     foreground: 'e07b10', fontStyle: 'bold' },
        { token: 'rumus.fn',         foreground: 'f5c050', fontStyle: 'bold' },
        { token: 'rumus.output',     foreground: 'd4a040', fontStyle: 'bold' },
        { token: 'rumus.op',         foreground: '9a7d50' },
        { token: 'rumus.logic-op',   foreground: 'a060d8', fontStyle: 'bold' },
        { token: 'bija.raw',         foreground: 'b89030' },
        { token: 'viesti.op',        foreground: 'e07b10', fontStyle: 'bold' },
        { token: 'viesti.addr',      foreground: 'eed8a8' },
        { token: 'entity.name',      foreground: 'eed8a8', fontStyle: 'bold' },
        { token: 'entity.ref',       foreground: 'c89040' },
        { token: 'variable.name',    foreground: 'd4a040' },
        { token: 'string.other',     foreground: 'c09838' },
        { token: 'keyword.operator', foreground: 'f5c050' },
        { token: 'meta.boolean',     foreground: 'c84830' },
        { token: 'number',           foreground: 'f5c050' },
        { token: 'comment',          foreground: '4a3015', fontStyle: 'italic' },
        { token: 'delimiter',        foreground: '4a3015' },
        { token: 'identifier',       foreground: '9a7d50' },
      ],
      colors: {
        'editor.background':                  '#130c04',
        'editor.foreground':                  '#eed8a8',
        'editor.lineHighlightBackground':     '#201507',
        'editorLineNumber.foreground':        '#4a3015',
        'editorLineNumber.activeForeground':  '#9a7d50',
        'editor.selectionBackground':         '#e07b1044',
        'editor.inactiveSelectionBackground': '#e07b1022',
        'editorCursor.foreground':            '#f5c050',
        'editorIndentGuide.background1':      '#3d2608',
        'editorIndentGuide.activeBackground1':'#6b4515',
        'scrollbarSlider.background':         '#3d260888',
        'scrollbarSlider.hoverBackground':    '#6b4515',
        'scrollbarSlider.activeBackground':   '#e07b1088',
        'focusBorder':                        '#00000000',
      },
    });

    // ── bija-dark theme (deep crimson palette) ──────────────────────────────

    monaco.editor.defineTheme('bija-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword.section',  foreground: 'c8304a', fontStyle: 'bold' },
        { token: 'rumus.prefix',     foreground: 'c8304a', fontStyle: 'bold' },
        { token: 'rumus.fn',         foreground: 'e87088', fontStyle: 'bold' },
        { token: 'rumus.output',     foreground: 'd05070', fontStyle: 'bold' },
        { token: 'rumus.op',         foreground: 'a06070' },
        { token: 'rumus.logic-op',   foreground: 'a060d8', fontStyle: 'bold' },
        { token: 'bija.raw',         foreground: 'b06878' },
        { token: 'viesti.op',        foreground: 'c8304a', fontStyle: 'bold' },
        { token: 'viesti.addr',      foreground: 'f0c8cc' },
        { token: 'entity.name',      foreground: 'f0c8cc', fontStyle: 'bold' },
        { token: 'entity.ref',       foreground: 'd05070' },
        { token: 'variable.name',    foreground: 'b06878' },
        { token: 'string.other',     foreground: 'a06070' },
        { token: 'keyword.operator', foreground: 'e87088' },
        { token: 'meta.boolean',     foreground: 'c8304a' },
        { token: 'number',           foreground: 'e87088' },
        { token: 'comment',          foreground: '604050', fontStyle: 'italic' },
        { token: 'delimiter',        foreground: '604050' },
        { token: 'identifier',       foreground: 'a06070' },
      ],
      colors: {
        'editor.background':                  '#10020a',
        'editor.foreground':                  '#f0c8cc',
        'editor.lineHighlightBackground':     '#200410',
        'editorLineNumber.foreground':        '#604050',
        'editorLineNumber.activeForeground':  '#a06070',
        'editor.selectionBackground':         '#c8304a44',
        'editor.inactiveSelectionBackground': '#c8304a22',
        'editorCursor.foreground':            '#e87088',
        'editorIndentGuide.background1':      '#4a0818',
        'editorIndentGuide.activeBackground1':'#7a1530',
        'scrollbarSlider.background':         '#4a081888',
        'scrollbarSlider.hoverBackground':    '#7a1530',
        'scrollbarSlider.activeBackground':   '#c8304a88',
        'focusBorder':                        '#00000000',
      },
    });

    // ── rumus-dark theme (deep blue/teal palette) ────────────────────────────

    monaco.editor.defineTheme('rumus-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword.section',  foreground: '2090d0', fontStyle: 'bold' },
        { token: 'rumus.prefix',     foreground: '20d0c0', fontStyle: 'bold' },
        { token: 'rumus.fn',         foreground: '50c8f0', fontStyle: 'bold' },
        { token: 'rumus.output',     foreground: '20d0c0', fontStyle: 'bold' },
        { token: 'rumus.op',         foreground: '3a7090' },
        { token: 'rumus.logic-op',   foreground: '9060e0', fontStyle: 'bold' },
        { token: 'bija.raw',         foreground: '20b090' },
        { token: 'entity.name',      foreground: 'a8d8f0', fontStyle: 'bold' },
        { token: 'entity.ref',       foreground: '20d0c0' },
        { token: 'variable.name',    foreground: '50c8f0' },
        { token: 'string.other',     foreground: '20d0c0' },
        { token: 'keyword.operator', foreground: '50c8f0' },
        { token: 'meta.boolean',     foreground: '2090d0' },
        { token: 'number',           foreground: '50c8f0' },
        { token: 'comment',          foreground: '0a3050', fontStyle: 'italic' },
        { token: 'delimiter',        foreground: '0a3050' },
        { token: 'identifier',       foreground: '5090b8' },
      ],
      colors: {
        'editor.background':                  '#030f1e',
        'editor.foreground':                  '#a8d8f0',
        'editor.lineHighlightBackground':     '#061c30',
        'editorLineNumber.foreground':        '#0a3050',
        'editorLineNumber.activeForeground':  '#2a5070',
        'editor.selectionBackground':         '#2090d044',
        'editor.inactiveSelectionBackground': '#2090d022',
        'editorCursor.foreground':            '#20d0c0',
        'editorIndentGuide.background1':      '#0a3050',
        'editorIndentGuide.activeBackground1':'#1a6090',
        'scrollbarSlider.background':         '#0a305088',
        'scrollbarSlider.hoverBackground':    '#1a6090',
        'scrollbarSlider.activeBackground':   '#2090d088',
        'focusBorder':                        '#00000000',
      },
    });

    // ── viesti-dark theme (70s phosphor-green CRT palette) ──────────────────

    monaco.editor.defineTheme('viesti-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword.section', foreground: '5ab830', fontStyle: 'bold' },
        { token: 'viesti.op',       foreground: '30d070', fontStyle: 'bold' },
        { token: 'viesti.addr',     foreground: 'a8e070' },
        { token: 'identifier',      foreground: '7ab858' },
        { token: 'comment',         foreground: '1a4010', fontStyle: 'italic' },
        { token: 'delimiter',       foreground: '1a4010' },
      ],
      colors: {
        'editor.background':                   '#020802',
        'editor.foreground':                   '#c8e8a8',
        'editor.lineHighlightBackground':      '#051005',
        'editorLineNumber.foreground':         '#0d300a',
        'editorLineNumber.activeForeground':   '#2a5a18',
        'editor.selectionBackground':          '#5ab83044',
        'editor.inactiveSelectionBackground':  '#5ab83022',
        'editorCursor.foreground':             '#30d070',
        'editorIndentGuide.background1':       '#0d300a',
        'editorIndentGuide.activeBackground1': '#2a5a18',
        'scrollbarSlider.background':          '#0d300a88',
        'scrollbarSlider.hoverBackground':     '#2a5a18',
        'scrollbarSlider.activeBackground':    '#5ab83088',
        'focusBorder':                         '#00000000',
      },
    });

    // ── create editor instance ──────────────────────────────────────────────

    const editor = monaco.editor.create(container, {
      value: defaultValue,
      language: 'fdg',
      theme: 'bija-dark',
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      fontLigatures: true,
      lineHeight: 20,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      wordWrap: 'off',
      renderLineHighlight: 'line',
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      scrollbar: {
        verticalScrollbarSize: 6,
        horizontalScrollbarSize: 6,
      },
      padding: { top: 12, bottom: 12 },
    });

    editor.onDidChangeModelContent(() => {
      onChange(editor.getValue());
    });

    // expose for resize notifications
    window._fudgelEditor = editor;

    // ensure Monaco fills its flex container and stays in sync with any resize (incl. browser zoom)
    new ResizeObserver(() => editor.layout()).observe(container);

    // trigger initial parse
    onChange(editor.getValue());
  });
}
