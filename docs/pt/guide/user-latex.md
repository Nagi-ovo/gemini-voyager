# Renderização LaTeX das mensagens do usuário

::: info
**Nota**: Este recurso é compatível a partir da versão 1.3.7.
:::

Renderiza automaticamente as fórmulas LaTeX das mensagens do usuário como notação matemática.

## Visão geral

Quando você usa sintaxe LaTeX no chat do Gemini™ (por exemplo, `$E=mc^2$` ou `$$\int_0^1 x^2 dx$$`), o Voyager detecta e renderiza essas fórmulas automaticamente como expressões matemáticas bem formatadas.

### Principais recursos

- **Fórmula em linha**: envolva com `$...$`, por exemplo `$x^2 + y^2 = r^2$`
- **Fórmula em bloco**: envolva com `$$...$$` para uma fórmula centralizada, em linha própria
- **Detecção automática**: processa as mensagens já enviadas e as novas
- **Motor KaTeX**: renderização matemática de alta qualidade com KaTeX

## Como usar

1. Digite uma mensagem com sintaxe LaTeX no campo de entrada do chat do Gemini
2. Depois de enviar, as fórmulas são renderizadas automaticamente como notação matemática
3. A fórmula em linha `$...$` é renderizada dentro do texto
4. A fórmula em bloco `$$...$$` é renderizada centralizada, em uma linha própria

## Exemplos de sintaxe

| Entrada                                   | Descrição        |
| ----------------------------------------- | ---------------- |
| `$E=mc^2$`                                | Fórmula em linha |
| `$$\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$$` | Fórmula em bloco |
| `$\alpha, \beta, \gamma$`                 | Letras gregas    |
| `$\sqrt{x^2 + y^2}$`                      | Raiz quadrada    |

## Observações

::: tip

- Vale apenas para mensagens enviadas por você. As respostas do Gemini têm a própria renderização de fórmulas.
- Se a sintaxe LaTeX for inválida, o texto original será exibido como alternativa.
  :::

<div align="center">
  <img src="/assets/input-latex.png" alt="Renderização LaTeX das mensagens do usuário" style="max-width: 100%; border-radius: 8px;"/>
</div>
