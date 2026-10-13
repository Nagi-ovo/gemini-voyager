# Cópia de fórmulas

O Voyager facilita reutilizar fórmulas matemáticas e símbolos científicos. Clique em uma fórmula para copiá-la como LaTeX, MathML pronto para o Word ou um bloco compatível com o Notion.

## Introdução

Quando você pede ao Gemini para deduzir fórmulas ou escrever expressões matemáticas, ele normalmente as renderiza usando LaTeX. Embora fiquem bonitas, extrair o código-fonte para usar em seus artigos, documentos ou editores costuma exigir trabalho manual.

O Voyager oferece suporte integrado para isso:

1. **Detecção automática**: O Voyager identifica automaticamente as fórmulas renderizadas na página. Ao passar o mouse sobre uma delas, você vê que ela é clicável.
2. **Clique para copiar**: Clique em uma fórmula inline ou em bloco e ela é copiada na hora, com uma breve confirmação.
3. **Escolha um formato**: No popup, escolha antecipadamente um **Formato de cópia de fórmula**:
   - **LaTeX**: Código-fonte LaTeX padrão com delimitadores de cifrão, ideal para Overleaf, editores Markdown etc.
   - **LaTeX (Sem cifrão)**: O código-fonte LaTeX puro, para editores que adicionam seus próprios delimitadores.
   - **MathML (Word)**: O melhor formato para colar diretamente no **Microsoft Word**.
   - **Notion ($$ Formato)**: Envolve cada fórmula em `$$`, que o Notion transforma em equação.

![Cópia de fórmulas](/assets/gemini-math-copy.png)

## Recursos

- **Compatibilidade com o Word**: Com o suporte a MathML, você pode colar fórmulas complexas geradas por IA diretamente em documentos do Word, mantendo a formatação editável perfeita.
- **Preservação do contexto**: Não copia só a fórmula, mas também preserva o contexto matemático dela.
- **Resposta instantânea**: Processado inteiramente de forma local, para resultados imediatos.

## Dicas de uso

- **Escrita acadêmica**: Ao escrever artigos no Word, peça ao Gemini para deduzir as fórmulas e use a cópia em MathML para evitar o trabalho manual no Editor de Equações do Word.
- **Anotações**: Ao fazer anotações no Obsidian ou no Notion, basta copiar o código-fonte LaTeX diretamente.

## Onde funciona

No Gemini e no AI Studio, ative com **Ativar cópia de fórmulas** no popup; essa opção e o formato de cópia valem para os dois sites. Claude e ChatGPT recebem a cópia de fórmulas como plugin integrado, e o DeepSeek tem um plugin de cópia de fórmulas no [catálogo de plugins](/pt/plugins).
