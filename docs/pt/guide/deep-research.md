# Exportação do Deep Research

Exporte o relatório final gerado pelo Deep Research ou salve o processo completo de "pensamento" dele como um arquivo Markdown.

## 1. Exportação do relatório (PDF / imagem)

Os relatórios gerados pelo Deep Research podem ser exportados como PDFs bem formatados ou como imagens únicas para compartilhar (os formatos Markdown e JSON também são compatíveis). Abra o menu **Share & Export** do relatório e escolha **Save Report**.

![Exportação do relatório](/assets/deep-research-report-export.png)

## 2. Exportação do processo de pensamento (Markdown)

Além do relatório final, você também pode exportar o conteúdo completo de "pensamento" das conversas do Deep Research.

### Recursos

- **Exportação com um clique**: uma opção de download aparece no menu **Share & Export** do relatório
- **Formato estruturado**: preserva as fases de pensamento, os itens de pensamento e os sites pesquisados na ordem original
- **Cabeçalhos legíveis**: os cabeçalhos das seções ficam em inglês; se o Voyager estiver configurado para outro idioma, cada cabeçalho mostra esse idioma junto com o inglês
- **Nomes automáticos**: os arquivos recebem data e hora para facilitar a organização (ex.: `deep-research-thinking-20240128-153045.md`)

### Como usar

1. Abra uma conversa do Deep Research no Gemini™
2. Clique no botão **Share & Export** do relatório
3. Selecione **Baixar conteúdo de pensamento**
4. O arquivo Markdown será baixado automaticamente

![Exportação do pensamento do Deep Research](/assets/deepresearch_download_thinking.png)

### Formato do arquivo exportado

O arquivo Markdown exportado inclui:

- **Título**: o título da conversa
- **Metadados**: data e hora da exportação e número total de fases de pensamento
- **Fases de pensamento**: cada fase contém:
  - Itens de pensamento (com cabeçalhos e conteúdo)
  - Sites pesquisados (com links e títulos)

#### Exemplo de estrutura

```markdown
# Deep Research Conversation Title

**Exported At:** 2025-12-28 17:25:35
**Total Phases:** 3

---

## Thinking Phase 1

### Thought Title 1

Thought content...

### Thought Title 2

Thought content...

#### Researched Websites

- [domain.com](https://example.com) - Page Title
- [another.com](https://another.com) - Another Title

---

## Thinking Phase 2

...
```

## Privacidade

Toda a extração e formatação acontece 100% localmente no seu navegador. Nenhum dado é enviado para servidores externos.
