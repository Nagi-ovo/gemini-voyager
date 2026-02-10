# Exportação Deep Research

Exporte o relatório final gerado pelo Deep Research, ou guarde o seu processo completo de "pensamento" como um ficheiro Markdown.

## 1. Exportação de Relatório (PDF / Imagem)

Os relatórios gerados pelo Deep Research podem ser exportados como PDFs com formatação elegante ou como imagens individuais partilháveis (os formatos Markdown e JSON também são suportados).

![Exportação de Relatório](/assets/deep-research-report-export.png)

## 2. Exportação do Processo de Pensamento (Markdown)

Além do relatório final, também pode exportar o conteúdo completo de "pensamento" das conversas do Deep Research.

### Funcionalidades

- **Exportação num clique**: O botão de download aparece no menu da conversa (⋮)
- **Formato estruturado**: Preserva as fases de pensamento, itens de pensamento e sites pesquisados na sua ordem original
- **Cabeçalhos bilingues**: Ficheiros Markdown incluem cabeçalhos de secção em inglês e no seu idioma atual
- **Nomeação automática**: Os ficheiros têm carimbo de data/hora para fácil organização (ex: `deep-research-thinking-20240128-153045.md`)

### Como Usar

1. Abra uma conversa Deep Research no Gemini
2. Clique no botão **Partilhar e Exportar** na conversa
3. Selecione "Transferir conteúdo de pensamento" (Download thinking content)
4. O ficheiro Markdown será transferido automaticamente

![Exportação de Pensamento Deep Research](/assets/deepresearch_download_thinking.png)

### Formato do Ficheiro Exportado

O ficheiro Markdown exportado inclui:

- **Título**: O título da conversa
- **Metadados**: Data/hora da exportação e número total de fases de pensamento
- **Fases de Pensamento**: Cada fase contém:
  - Itens de pensamento (com cabeçalhos e conteúdo)
  - Sites pesquisados (com links e títulos)

#### Exemplo de Estrutura

```markdown
# Título da Conversa Deep Research

**Hora de exportação / Exported At:** 2025-12-28 17:25:35
**Total de fases / Total Phases:** 3

---

## Fase de Pensamento 1 / Thinking Phase 1

### Título do Pensamento 1

Conteúdo do pensamento...

### Título do Pensamento 2

Conteúdo do pensamento...

#### Sites Pesquisados / Researched Websites

- [domain.com](https://example.com) - Título da Página
- [another.com](https://another.com) - Outro Título

---

## Fase de Pensamento 2 / Thinking Phase 2

...
```

## Privacidade

Toda a extração e formatação ocorre 100% localmente no seu navegador. Nenhum dado é enviado para servidores externos.
