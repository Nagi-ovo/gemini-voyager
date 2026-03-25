# Renderização LaTeX de mensagens do utilizador

::: info
**Nota**: Este recurso é suportado na versão 1.3.7 e posteriores.
:::

Renderiza automaticamente fórmulas LaTeX nas mensagens do utilizador como notação matemática.

## Visão geral

Quando usa sintaxe LaTeX no chat do Gemini™ (por exemplo, `$E=mc^2$` ou `$$\int_0^1 x^2 dx$$`), o Voyager deteta e renderiza automaticamente fórmulas matemáticas elegantes.

### Funcionalidades principais

- **Fórmula em linha**: envolva com `$...$` (ex. `$x^2 + y^2 = r^2$`)
- **Fórmula em bloco**: envolva com `$$...$$`, exibida centrada numa linha própria
- **Deteção automática**: processa mensagens existentes e recém-enviadas
- **Motor KaTeX**: renderização matemática de alta qualidade com KaTeX

## Como utilizar

1. Escreva uma mensagem com sintaxe LaTeX no chat do Gemini
2. Após enviar, as fórmulas são automaticamente renderizadas
3. Fórmulas em linha `$...$` aparecem dentro do texto
4. Fórmulas em bloco `$$...$$` aparecem centradas numa linha separada

## Exemplos de sintaxe

| Entrada                                   | Descrição        |
| ----------------------------------------- | ---------------- |
| `$E=mc^2$`                                | Fórmula em linha |
| `$$\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$$` | Fórmula em bloco |
| `$\alpha, \beta, \gamma$`                 | Letras gregas    |
| `$\sqrt{x^2 + y^2}$`                      | Raiz quadrada    |

## Notas

::: tip

- Aplica-se apenas a mensagens enviadas pelo utilizador. As fórmulas nas respostas do Gemini são renderizadas pelo próprio Gemini.
- Se a sintaxe LaTeX for inválida, o texto original será exibido.
  :::

<div align="center">
  <img src="/assets/input-latex.png" alt="Renderização LaTeX de mensagens do utilizador" style="max-width: 100%; border-radius: 8px;"/>
</div>
