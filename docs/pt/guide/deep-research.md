# Exportação Deep Research

Exporte o relatório final gerado pelo Deep Research, ou guarde o seu processo completo de "pensamento" como um ficheiro Markdown.

> [!NOTE]
> Este plugin oficial está incluído no Voyager e vem ativado por predefinição. Clique no ícone da extensão na barra de ferramentas do navegador e use **Exportação e imagens** → **Exportar Deep Research** no pop-up para o ativar ou desativar. Ao desativá-lo, as suas entradas desaparecem de imediato do menu **Partilhar e Exportar**.

## 1. Exportação de Relatório (PDF / Imagem)

Os relatórios gerados pelo Deep Research podem ser exportados como PDFs com formatação elegante ou como imagens individuais partilháveis (os formatos Markdown e JSON também são suportados). Abra o menu **Partilhar e Exportar** do relatório e escolha **Save Report**.

![Exportação de Relatório](/assets/deep-research-report-export.png)

## 2. Exportação do Processo de Pensamento (Markdown)

Além do relatório final, também pode exportar o conteúdo completo de "pensamento" das conversas do Deep Research.

### Funcionalidades

- **Exportação num clique**: A opção de download aparece no menu **Partilhar e Exportar** do relatório
- **Formato estruturado**: Preserva as fases de pensamento, itens de pensamento e sites pesquisados na sua ordem original
- **Cabeçalhos bilingues**: Os cabeçalhos de secção ficam em inglês; se o Voyager estiver configurado noutro idioma, cada cabeçalho mostra esse idioma ao lado do inglês
- **Nomeação automática**: Os ficheiros têm carimbo de data/hora para fácil organização (ex: `deep-research-thinking-20240128-153045.md`)

### Como Usar

1. Abra uma conversa Deep Research no Gemini™
2. Clique no botão **Partilhar e Exportar** do relatório
3. Selecione **Baixar conteúdo de pensamento**
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

**Exportado em / Exported At:** 2025-12-28 17:25:35
**Fases totais / Total Phases:** 3

---

## Fase de pensamento 1 / Thinking Phase 1

### Título do Pensamento 1

Conteúdo do pensamento...

### Título do Pensamento 2

Conteúdo do pensamento...

#### Sites pesquisados / Researched Websites

- [domain.com](https://example.com) - Título da Página
- [another.com](https://another.com) - Outro Título

---

## Fase de pensamento 2 / Thinking Phase 2

...
```

## Privacidade

Toda a extração e formatação ocorre 100% localmente no seu navegador. Nenhum dado é enviado para servidores externos.
