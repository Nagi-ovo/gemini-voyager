# Renderizado LaTeX de mensajes del usuario

::: info
**Nota**: Esta función es compatible con la versión 1.3.7 y posteriores.
:::

Renderiza automáticamente las fórmulas LaTeX en los mensajes del usuario como notación matemática.

## Descripción general

Cuando usas sintaxis LaTeX en el chat de Gemini™ (por ejemplo, `$E=mc^2$` o `$$\int_0^1 x^2 dx$$`), Voyager detecta y renderiza automáticamente fórmulas matemáticas elegantes.

### Características principales

- **Fórmula en línea**: envuelve con `$...$` (ej. `$x^2 + y^2 = r^2$`)
- **Fórmula en bloque**: envuelve con `$$...$$`, se muestra centrada en su propia línea
- **Detección automática**: procesa mensajes existentes y recién enviados
- **Motor KaTeX**: renderizado matemático de alta calidad con KaTeX

## Cómo usar

1. Escribe un mensaje con sintaxis LaTeX en el chat de Gemini
2. Después de enviar, las fórmulas se renderizan automáticamente
3. Las fórmulas en línea `$...$` se muestran dentro del texto
4. Las fórmulas en bloque `$$...$$` se muestran centradas en una línea separada

## Ejemplos de sintaxis

| Entrada                                   | Descripción       |
| ----------------------------------------- | ----------------- |
| `$E=mc^2$`                                | Fórmula en línea  |
| `$$\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$$` | Fórmula en bloque |
| `$\alpha, \beta, \gamma$`                 | Letras griegas    |
| `$\sqrt{x^2 + y^2}$`                      | Raíz cuadrada     |

## Notas

::: tip

- Solo se aplica a mensajes enviados por el usuario. Las fórmulas en las respuestas de Gemini son renderizadas por Gemini.
- Si la sintaxis LaTeX es inválida, se mostrará el texto original.
  :::

<div align="center">
  <img src="/assets/input-latex.png" alt="Renderizado LaTeX de mensajes del usuario" style="max-width: 100%; border-radius: 8px;"/>
</div>
