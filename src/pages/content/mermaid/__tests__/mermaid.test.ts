import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _resetMermaidLoader,
  isGenericLanguageLabel,
  isMermaidCode,
  loadMermaid,
  normalizeWhitespace,
} from '../index';

// Mock the dynamic import of 'mermaid'
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(),
  },
}));

describe('Mermaid dynamic loading', () => {
  beforeEach(() => {
    _resetMermaidLoader();
    vi.clearAllMocks();
  });

  describe('loadMermaid', () => {
    it('should load mermaid module successfully', async () => {
      const mermaid = await loadMermaid();
      expect(mermaid).not.toBeNull();
      expect(mermaid).toHaveProperty('initialize');
      expect(mermaid).toHaveProperty('render');
    });

    it('should cache the loaded instance on subsequent calls', async () => {
      const first = await loadMermaid();
      const second = await loadMermaid();
      expect(first).toBe(second);
    });

    it('should return cached instance without re-importing', async () => {
      // First call loads and caches
      const first = await loadMermaid();
      expect(first).not.toBeNull();

      // Second call returns cached instance immediately (no new import)
      const second = await loadMermaid();
      expect(second).toBe(first);
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
