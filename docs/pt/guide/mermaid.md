# Renderização de diagramas Mermaid

Renderiza automaticamente código Mermaid como diagramas visuais.

## Visão geral

Quando o Gemini™ gera blocos de código Mermaid (fluxogramas, diagramas de sequência, gráficos de Gantt etc.), o Voyager detecta e renderiza esses blocos automaticamente como diagramas interativos.

### Principais recursos

- **Detecção automática**: Suporta `graph`, `flowchart`, `sequenceDiagram`, `gantt`, `pie`, `classDiagram` e todos os principais tipos de diagrama do Mermaid
- **Alternância de visualização**: Alterne entre o diagrama renderizado e o código-fonte com um único clique
- **Modo tela cheia**: Clique no diagrama para entrar em tela cheia, com suporte a zoom e arrastar
- **Modo escuro**: Adapta-se automaticamente ao tema da página

## Ativar ou desativar

A renderização do Mermaid já vem ativada no Gemini. Para desativar, abra o popup do Voyager e desligue **Gráficos** → **Diagramas Mermaid**. O recurso não está disponível no AI Studio.

## Como usar

1. Peça ao Gemini para gerar qualquer código de diagrama Mermaid
2. O bloco de código é substituído automaticamente pelo diagrama renderizado
3. Clique no botão **</> Código** para ver o código-fonte
4. Clique no botão **📊 Diagrama** para voltar à visualização do diagrama
5. Clique na área do diagrama para entrar em tela cheia

## Controles em tela cheia

- **Roda do mouse**: Aumenta ou diminui o zoom
- **Arrastar**: Move o diagrama
- **+/-**: Botões de zoom da barra de ferramentas
- **⊙**: Redefine a visualização
- **✕ / ESC**: Fecha a tela cheia

## Compatibilidade e Solução de Problemas

::: warning Nota

- **Limitação do Firefox**: Devido a restrições do ambiente, o Firefox traz o Mermaid 9.2.2 e não suporta novos recursos como **Timeline** ou **Sankey**.
- **Erros de sintaxe**: Falhas de renderização geralmente ocorrem devido a erros de sintaxe na saída do Gemini. Estamos coletando "bad cases" para implementar correções automáticas em atualizações futuras.
  :::

<div align="center">
  <img src="/assets/mermaid-preview.png" alt="Renderização de diagrama Mermaid" style="max-width: 100%; border-radius: 8px;"/>
</div>
