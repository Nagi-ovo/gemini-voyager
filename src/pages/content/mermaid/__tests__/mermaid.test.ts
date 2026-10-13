import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isGenericLanguageLabel } from '../../codeBlock';
import { createMermaidErrorCard } from '../codeBlock';
import { openFullscreen } from '../fullscreen';
import { MermaidRenderer, resolveMermaidTheme, sanitizeMermaidSvg } from '../renderer';
import { isMermaidCode, normalizeMermaidCode, normalizeWhitespace } from '../source';

// Mock the dynamic import of 'mermaid'
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(),
  },
}));

describe('Mermaid rendering', () => {
  let renderer: MermaidRenderer;
  const getLibrary = async () => (await import('mermaid')).default;
  beforeEach(() => {
    renderer = new MermaidRenderer();
    vi.clearAllMocks();
    document.body.innerHTML = '';
    document.body.className = '';
  });

  describe('initialization', () => {
    it('loads the library successfully', async () => {
      await expect(renderer.initialize()).resolves.toBe(true);
    });

    it('initializes Mermaid in strict mode for untrusted model output', async () => {
      await renderer.initialize();

      const mermaid = await getLibrary();
      expect(mermaid.initialize).toHaveBeenCalledWith(
        expect.objectContaining({ securityLevel: 'strict' }),
      );
    });

    it('uses SVG flowchart labels so sanitization preserves visible text', async () => {
      await renderer.initialize();

      const mermaid = await getLibrary();
      expect(mermaid.initialize).toHaveBeenCalledWith(
        expect.objectContaining({ htmlLabels: false, flowchart: { htmlLabels: false } }),
      );
    });
  });

  describe('resolveMermaidTheme', () => {
    it('prefers an explicit Gemini light host over generic dark markers', () => {
      const page = document.implementation.createHTMLDocument();
      const themeHost = page.createElement('div');
      themeHost.className = 'theme-host light-theme';
      page.body.append(themeHost);
      page.body.classList.add('dark-theme');
      page.documentElement.classList.add('dark');
      page.body.dataset.theme = 'dark';

      expect(resolveMermaidTheme(page, true)).toBe('default');
    });

    it('prefers an explicit Gemini dark host over generic light markers', () => {
      const page = document.implementation.createHTMLDocument();
      const themeHost = page.createElement('div');
      themeHost.className = 'theme-host dark-theme';
      page.body.append(themeHost);
      page.body.classList.add('light-theme');
      page.documentElement.classList.add('light');
      page.body.dataset.theme = 'light';

      expect(resolveMermaidTheme(page, false)).toBe('dark');
    });

    it('uses generic page markers when Gemini exposes no theme host', () => {
      const darkPage = document.implementation.createHTMLDocument();
      darkPage.body.dataset.theme = 'dark';
      expect(resolveMermaidTheme(darkPage, false)).toBe('dark');

      const lightPage = document.implementation.createHTMLDocument();
      lightPage.body.dataset.theme = 'light';
      expect(resolveMermaidTheme(lightPage, true)).toBe('default');
    });

    it('falls back to a dark system preference when Gemini exposes no theme', () => {
      const page = document.implementation.createHTMLDocument();

      expect(resolveMermaidTheme(page, true)).toBe('dark');
    });

    it('falls back to the default theme when Gemini exposes no theme and the system is light', () => {
      const page = document.implementation.createHTMLDocument();

      expect(resolveMermaidTheme(page, false)).toBe('default');
    });
  });

  describe('fullscreen lifecycle', () => {
    it.each(['button', 'escape', 'backdrop'] as const)(
      'closes after the fade and stops document dragging via %s',
      (path) => {
        vi.useFakeTimers();
        try {
          openFullscreen('<svg width="100" height="100"><path d="M0 0" /></svg>');
          const modal = document.querySelector<HTMLElement>('.gv-mermaid-modal')!;
          const content = modal.querySelector<HTMLElement>('.gv-mermaid-modal-content')!;
          vi.advanceTimersToNextFrame();
          content.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, clientY: 20 }));
          const close = {
            button: () => modal.querySelector<HTMLButtonElement>('button:last-child')!.click(),
            escape: () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })),
            backdrop: () => modal.click(),
          }[path];
          close();
          const transform = content.style.transform;
          document.dispatchEvent(new MouseEvent('mousemove', { clientX: 70, clientY: 80 }));
          expect(content.style.transform).toBe(transform);
          expect(content.classList.contains('dragging')).toBe(false);
          expect(modal.classList.contains('visible')).toBe(false);
          vi.advanceTimersByTime(300);
          expect(modal.isConnected).toBe(false);
        } finally {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
          vi.runAllTimers();
          vi.useRealTimers();
        }
      },
    );
  });

  describe('renderer output', () => {
    it('keeps the page diagram when the light export render fails', async () => {
      document.body.className = 'dark-theme';
      await renderer.initialize();
      const mermaid = await getLibrary();
      (mermaid.render as unknown as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ svg: '<svg data-page-theme="dark"></svg>' })
        .mockRejectedValueOnce(new Error('light export failed'));

      const diagram = await renderer.render('flowchart TD\nA --> B\nB --> C');

      expect(diagram).toMatchObject({ theme: 'dark', errorMessage: null, lightExportSvg: null });
      expect(diagram?.svg).toContain('data-page-theme="dark"');
    });

    it('caps a syntax error, removes the artifacts Mermaid leaves, and shows the error as text', async () => {
      document.body.innerHTML = '<div id="document-content">Keep me</div>';
      const mermaid = await getLibrary();
      (mermaid.render as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
        async (id: string) => {
          const errorSvg = document.createElement('div');
          errorSvg.id = id;
          const errorContainer = document.createElement('div');
          errorContainer.id = 'd-error-container';
          errorContainer.textContent = 'Syntax error';
          document.body.append(errorSvg, errorContainer);
          throw new Error(`<b id="gv-proof">proof</b>${'x'.repeat(120)}`);
        },
      );

      const diagram = await renderer.render('not a diagram');

      expect(document.querySelector('[id^="mermaid-"]')).toBeNull();
      expect(document.getElementById('d-error-container')).toBeNull();
      expect(document.getElementById('document-content')?.textContent).toBe('Keep me');
      expect(diagram?.errorMessage).toHaveLength(103);
      expect(diagram?.errorMessage?.endsWith('...')).toBe(true);
      const card = createMermaidErrorCard(diagram!.errorMessage!);
      expect(card.querySelector('#gv-proof')).toBeNull();
      expect(card.textContent).toContain('<b id="gv-proof">proof</b>');
    });

    it('sanitizes links, remote media, handlers, and escaping CSS from rendered diagrams', async () => {
      const html = await sanitizeMermaidSvg(`<svg viewBox="0 0 100 50">
          <style>.node{position:fixed;inset:0;z-index:99}</style>
          <foreignObject><a href="https://example.invalid/phish">Verify</a><img src="https://example.invalid/pixel"></foreignObject>
          <g onload="alert(1)"><text>Safe label</text></g>
          <image href="https://example.invalid/pixel"/>
        </svg>`);
      const diagram = document.createElement('div');
      diagram.innerHTML = html;

      expect(diagram.querySelector('a, img, image, script, iframe, form, input')).toBeNull();
      expect(html).not.toContain('example.invalid');
      expect(html).not.toContain('position:fixed');
      expect(html).not.toContain('onload');
      expect(diagram.textContent).toContain('Safe label');
    });

    it('preserves Mermaid theme CSS when its contained tooltip uses z-index', async () => {
      const diagram = document.createElement('div');
      diagram.innerHTML = await sanitizeMermaidSvg(`<svg viewBox="0 0 100 50">
          <style>
            #chart .node rect { fill: #ececff; stroke: #9370db; }
            div.mermaidTooltip { position: absolute; z-index: 100; }
          </style>
          <g id="chart" class="node">
            <rect width="50" height="20"></rect>
            <text><tspan>Dosing &amp;amp; Distribution</tspan></text>
          </g>
        </svg>`);

      const style = diagram.querySelector('style');
      expect(style?.textContent).toContain('fill: #ececff');
      expect(style?.textContent).toContain('z-index: 100');
      expect(diagram.querySelector('tspan')?.textContent).toBe('Dosing & Distribution');
    });
  });

  describe('Firefox Mermaid compatibility', () => {
    it('parses representative model output with Mermaid 9.2.2 in strict mode', async () => {
      const mermaidLegacy = (await import('mermaid-legacy')).default;
      mermaidLegacy.initialize({ startOnLoad: false, securityLevel: 'strict' });

      const source = normalizeMermaidCode(`sequenceDiagram
        participant 用户
        participant 系统
        用户->>系统: SSH 登录并检查日志
        系统-->>用户: 服务恢复正常`);

      expect(mermaidLegacy.parse(source)).toBe(true);
    });
  });

  describe('isMermaidCode', () => {
    it('should detect flowchart syntax', () => {
      const code = `flowchart TD
        A[Start] --> B{Is it working?}
        B -- Yes --> C[Great!]
        B -- No --> D[Fix it]
        D --> B`;
      expect(isMermaidCode(code)).toBe(true);
    });

    it('should detect graph syntax', () => {
      const code = `graph LR
        A[Start] --> B[Process]
        B --> C[End]
        C --> D[Done]`;
      expect(isMermaidCode(code)).toBe(true);
    });

    it('should detect sequenceDiagram syntax', () => {
      const code = `sequenceDiagram
        participant Alice
        participant Bob
        Alice->>Bob: Hello Bob
        Bob-->>Alice: Hi Alice`;
      expect(isMermaidCode(code)).toBe(true);
    });

    it('should detect classDiagram syntax', () => {
      const code = `classDiagram
        class Animal {
          +String name
          +makeSound()
        }
        Animal <|-- Duck
        Animal <|-- Fish`;
      expect(isMermaidCode(code)).toBe(true);
    });

    it('should detect erDiagram syntax', () => {
      const code = `erDiagram
        CUSTOMER ||--o{ ORDER : places
        ORDER ||--|{ LINE-ITEM : contains
        CUSTOMER }|..|{ DELIVERY-ADDRESS : uses`;
      expect(isMermaidCode(code)).toBe(true);
    });

    it('should detect gantt syntax', () => {
      const code = `gantt
        title A Gantt Diagram
        dateFormat  YYYY-MM-DD
        section Section
        A task           :a1, 2024-01-01, 30d`;
      expect(isMermaidCode(code)).toBe(true);
    });

    it('should detect pie chart syntax', () => {
      const code = `pie title Pets adopted by volunteers
        "Dogs" : 386
        "Cats" : 85
        "Rats" : 15
        "Others" : 35`;
      expect(isMermaidCode(code)).toBe(true);
    });

    it('should detect gitGraph syntax', () => {
      const code = `gitGraph
        commit
        branch develop
        checkout develop
        commit
        checkout main
        merge develop`;
      expect(isMermaidCode(code)).toBe(true);
    });

    it('should detect mermaid comment prefix (%%)', () => {
      const code = `%% This is a mermaid diagram
        graph TD
        A --> B
        B --> C`;
      expect(isMermaidCode(code)).toBe(true);
    });

    // C4 diagrams
    it('should detect C4Context syntax', () => {
      const code = `C4Context
        title System Context diagram
        Person(customerA, "Customer A")
        System(systemA, "System A")
        Rel(customerA, systemA, "Uses")`;
      expect(isMermaidCode(code)).toBe(true);
    });

    // New v11 diagram types (both -beta and non-beta forms)
    it('should detect xychart-beta syntax', () => {
      const code = `xychart-beta
        title "Sales Revenue"
        x-axis [jan, feb, mar, apr]
        y-axis "Revenue (in $)" 4000 --> 11000
        bar [5000, 6000, 7500, 8200]`;
      expect(isMermaidCode(code)).toBe(true);
    });

    it('should detect xychart syntax (without -beta)', () => {
      const code = `xychart
        title "Sales Revenue"
        x-axis [jan, feb, mar, apr]
        y-axis "Revenue (in $)" 4000 --> 11000
        bar [5000, 6000, 7500, 8200]`;
      expect(isMermaidCode(code)).toBe(true);
    });

    it('should detect block-beta syntax', () => {
      const code = `block-beta
        columns 3
        a["Block A"] b["Block B"] c["Block C"]
        d["Block D"]:3
        e["Block E"] f["Block F"]`;
      expect(isMermaidCode(code)).toBe(true);
    });

    it('should detect block syntax (without -beta)', () => {
      const code = `block
        columns 3
        a["Block A"] b["Block B"] c["Block C"]
        d["Block D"]:3
        e["Block E"] f["Block F"]`;
      expect(isMermaidCode(code)).toBe(true);
    });

    it('should detect packet-beta syntax', () => {
      const code = `packet-beta
        title TCP Header
        0-15: "Source Port"
        16-31: "Destination Port"
        32-63: "Sequence Number"`;
      expect(isMermaidCode(code)).toBe(true);
    });

    it('should detect packet syntax (without -beta)', () => {
      const code = `packet
        title TCP Header
        0-15: "Source Port"
        16-31: "Destination Port"
        32-63: "Sequence Number"`;
      expect(isMermaidCode(code)).toBe(true);
    });

    it('should detect architecture syntax', () => {
      const code = `architecture
        group api(cloud)[API]
        service db(database)[Database]
        service web(server)[Web Server]
        db:L -- R:web`;
      expect(isMermaidCode(code)).toBe(true);
    });

    it('should detect kanban syntax', () => {
      const code = `kanban
        Todo
          id1[Task 1]
          id2[Task 2]
        "In Progress"
          id3[Task 3]`;
      expect(isMermaidCode(code)).toBe(true);
    });

    it('should detect radar-beta syntax', () => {
      const code = `radar-beta
        title Skills Assessment
        axis1 "JavaScript"
        axis2 "TypeScript"
        axis3 "React"
        curve a: 5, 4, 3`;
      expect(isMermaidCode(code)).toBe(true);
    });

    it('should detect treemap syntax', () => {
      const code = `treemap
        root("Project")
          src("Source")
            core("Core")
            features("Features")
          tests("Tests")`;
      expect(isMermaidCode(code)).toBe(true);
    });

    it('should detect sankey syntax (without -beta)', () => {
      const code = `sankey
        Agricultural "ichael",Fossil fuels,17.5
        Biofuel imports,Liquid,35.8
        Biomass imports,Solid,15.5
        Coal imports,Coal,12.3`;
      expect(isMermaidCode(code)).toBe(true);
    });

    it('should detect requirement syntax (without Diagram suffix)', () => {
      const code = `requirement
        functionalRequirement test_req {
          id: 1
          text: "The system shall do something"
          risk: high
        }`;
      expect(isMermaidCode(code)).toBe(true);
    });

    it('should reject code shorter than 50 chars', () => {
      expect(isMermaidCode('graph TD\n  A --> B')).toBe(false);
    });

    it('should reject code with fewer than 3 non-empty lines', () => {
      const code = `flowchart TD
        A[Start] --> B[End]`;
      expect(isMermaidCode(code)).toBe(false);
    });

    it('should reject code with incomplete endings', () => {
      const code = `flowchart TD
        A[Start] --> B{Decision}
        B -- Yes --> C[Process]
        C -->`;
      expect(isMermaidCode(code)).toBe(false);
    });

    it('should reject non-mermaid code', () => {
      const code = `function hello() {
        console.log("Hello World");
        return true;
        // some more code here to pass length check
      }`;
      expect(isMermaidCode(code)).toBe(false);
    });

    it('should be case-insensitive for keywords', () => {
      const code = `FLOWCHART TD
        A[Start] --> B[Process]
        B --> C[End]
        C --> D[Done]`;
      expect(isMermaidCode(code)).toBe(true);
    });
  });

  describe('normalizeWhitespace', () => {
    it('should replace non-breaking spaces with standard spaces', () => {
      const input = 'graph\u00A0TD\u00A0A-->B';
      expect(normalizeWhitespace(input)).toBe('graph TD A-->B');
    });

    it('should replace em spaces', () => {
      const input = 'graph\u2003TD';
      expect(normalizeWhitespace(input)).toBe('graph TD');
    });

    it('should replace en spaces', () => {
      const input = 'graph\u2002TD';
      expect(normalizeWhitespace(input)).toBe('graph TD');
    });

    it('should replace thin spaces', () => {
      const input = 'graph\u2009TD';
      expect(normalizeWhitespace(input)).toBe('graph TD');
    });

    it('should replace ideographic (CJK full-width) spaces', () => {
      const input = 'graph\u3000TD';
      expect(normalizeWhitespace(input)).toBe('graph TD');
    });

    it('should remove zero-width spaces', () => {
      const input = 'graph\u200BTD';
      expect(normalizeWhitespace(input)).toBe('graphTD');
    });

    it('should remove zero-width non-joiner', () => {
      const input = 'graph\u200CTD';
      expect(normalizeWhitespace(input)).toBe('graphTD');
    });

    it('should remove zero-width joiner', () => {
      const input = 'graph\u200DTD';
      expect(normalizeWhitespace(input)).toBe('graphTD');
    });

    it('should keep the joiner that holds an emoji sequence together', () => {
      // Stripping every U+200D splits these into their component glyphs, so a
      // node label like `A["\u{1F468}\u200D\u{1F469}\u200D\u{1F466} team"]`
      // would render as three separate people.
      const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F466}';
      expect(normalizeWhitespace(family)).toBe(family);

      // The flag sequence puts a variation selector between the emoji and the
      // joiner, so the lookback has to skip it.
      const flag = '\u{1F3F3}\uFE0F\u200D\u{1F308}';
      expect(normalizeWhitespace(flag)).toBe(flag);
    });

    it('should still remove a joiner that only touches an emoji on one side', () => {
      expect(normalizeWhitespace('a\u200D\u{1F44D}')).toBe('a\u{1F44D}');
      expect(normalizeWhitespace('\u{1F44D}\u200Db')).toBe('\u{1F44D}b');
    });

    it('should remove BOM character', () => {
      const input = '\uFEFFgraph TD';
      expect(normalizeWhitespace(input)).toBe('graph TD');
    });

    it('should handle mixed special whitespace', () => {
      const input = 'graph\u00A0TD\u200B\u2003A\u2009-->\u3000B';
      expect(normalizeWhitespace(input)).toBe('graph TD A --> B');
    });

    it('should leave standard whitespace unchanged', () => {
      const input = 'graph TD\n  A --> B\n  B --> C';
      expect(normalizeWhitespace(input)).toBe('graph TD\n  A --> B\n  B --> C');
    });
  });

  describe('normalizeMermaidCode', () => {
    it('converts simple HTML emphasis to Markdown for sanitized SVG labels', () => {
      const input = `flowchart TD
        A[<b>Prepare</b><br/>Dry portafilter]
        A --> B[<em>Dose &amp; extract</em>]`;

      expect(normalizeMermaidCode(input)).toBe(`flowchart TD
        A[**Prepare**<br/>Dry portafilter]
        A --> B[_Dose &amp; extract_]`);
    });

    it('moves a trailing comment after linkStyle onto its own line', () => {
      const input = `graph TD
        A --> B
        linkStyle 0 stroke:#FF5722,stroke-width:3px; %% emphasize the edge`;

      expect(normalizeMermaidCode(input)).toBe(`graph TD
        A --> B
        linkStyle 0 stroke:#FF5722,stroke-width:3px;
        %% emphasize the edge`);
    });

    it('handles trailing comments on other style directives', () => {
      const input = `graph TD
        classDef result fill:#C8E6C9; %% result style
        class A result; %% apply result style`;

      expect(normalizeMermaidCode(input)).toBe(`graph TD
        classDef result fill:#C8E6C9;
        %% result style
        class A result;
        %% apply result style`);
    });

    it('leaves standalone comments and diagram text unchanged', () => {
      const input = `graph TD
        %% standalone comment
        A[Progress %% complete] --> B`;

      expect(normalizeMermaidCode(input)).toBe(input);
    });

    it('quotes unquoted subgraph titles that contain parentheses', () => {
      const input = `graph LR
        subgraph 流量层 (日活十亿)
          A --> B
        end`;

      expect(normalizeMermaidCode(input)).toBe(`graph LR
        subgraph "流量层 (日活十亿)"
          A --> B
        end`);
    });

    it('leaves quoted and id-based subgraph titles unchanged', () => {
      const input = `graph LR
        subgraph "流量层 (日活十亿)"
        end
        subgraph traffic["流量层 (日活十亿)"]
        end`;

      expect(normalizeMermaidCode(input)).toBe(input);
    });

    it('repairs a translated empty activation when the participant is later deactivated', () => {
      const input = `sequenceDiagram
        participant 你
        激活->>你:
        你->>系统: 修复
        deactivate 你`;

      expect(normalizeMermaidCode(input)).toBe(`sequenceDiagram
        participant 你
        activate 你
        你->>系统: 修复
        deactivate 你`);
    });

    it('does not reinterpret a participant named 激活 or an unmatched empty message', () => {
      const input = `sequenceDiagram
        participant 激活
        participant 你
        激活->>你:
        你->>系统: 修复`;

      expect(normalizeMermaidCode(input)).toBe(input);
    });
  });

  describe('isGenericLanguageLabel', () => {
    it('should return true for null (no label)', () => {
      expect(isGenericLanguageLabel(null)).toBe(true);
    });

    it('should return true for generic English labels', () => {
      expect(isGenericLanguageLabel('code')).toBe(true);
      expect(isGenericLanguageLabel('text')).toBe(true);
      expect(isGenericLanguageLabel('plaintext')).toBe(true);
      expect(isGenericLanguageLabel('snippet')).toBe(true);
      expect(isGenericLanguageLabel('example')).toBe(true);
    });

    it('should return true for generic Chinese labels', () => {
      expect(isGenericLanguageLabel('代码段')).toBe(true);
      expect(isGenericLanguageLabel('代码')).toBe(true);
      expect(isGenericLanguageLabel('示例')).toBe(true);
    });

    it('should return true for generic Traditional Chinese labels', () => {
      expect(isGenericLanguageLabel('程式碼片段')).toBe(true);
    });

    it('should return true for generic Japanese labels', () => {
      expect(isGenericLanguageLabel('コード スニペット')).toBe(true);
    });

    it('should return true for the remaining verified Gemini localized labels', () => {
      const labels = [
        'مقتطف الرمز',
        'Fragmento de código',
        'Extrait de code',
        '코드 스니펫',
        'Snippet de código',
        'Фрагмент кода',
      ];

      labels.forEach((label) => {
        expect(isGenericLanguageLabel(label)).toBe(true);
      });
    });

    it('should return false for specific programming languages', () => {
      expect(isGenericLanguageLabel('python')).toBe(false);
      expect(isGenericLanguageLabel('javascript')).toBe(false);
      expect(isGenericLanguageLabel('typescript')).toBe(false);
      expect(isGenericLanguageLabel('rust')).toBe(false);
      expect(isGenericLanguageLabel('matlab')).toBe(false);
    });

    it('should return true for "mermaid" as it is in the generic set... wait no', () => {
      // "mermaid" is NOT in the generic set — it's handled separately in processCodeBlocks
      expect(isGenericLanguageLabel('mermaid')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isGenericLanguageLabel('Code')).toBe(true);
      expect(isGenericLanguageLabel('TEXT')).toBe(true);
      expect(isGenericLanguageLabel('Plaintext')).toBe(true);
    });
  });
});
