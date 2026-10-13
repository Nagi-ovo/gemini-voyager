# Copia de fórmulas

Voyager hace que reutilizar fórmulas matemáticas y símbolos científicos sea muy sencillo. Haz clic en una fórmula para copiarla como LaTeX, como MathML listo para Word o como bloque compatible con Notion.

## Introducción

Cuando le pides a Gemini que derive fórmulas o escriba expresiones matemáticas, normalmente las renderiza con LaTeX. Es muy bonito, pero extraer el código fuente para usarlo en tus propios artículos, documentos o editores suele requerir trabajo manual.

Voyager ofrece un soporte fluido para esto:

1. **Detección automática**: Voyager identifica las fórmulas renderizadas en la página. Al pasar el cursor sobre una, se ve que se puede hacer clic.
2. **Clic para copiar**: Haz clic en una fórmula en línea o en bloque y se copia de inmediato, con una breve confirmación.
3. **Elige un formato**: En el popup, elige antes la **Formato de copia de fórmula**:
   - **LaTeX**: código fuente LaTeX estándar con delimitadores de signo de dólar, ideal para Overleaf, editores de Markdown, etc.
   - **LaTeX (sin signo de dólar)**: el código LaTeX sin delimitadores, para editores que añaden los suyos propios.
   - **MathML (Word)**: el mejor formato para pegar directamente en **Microsoft Word**.
   - **Notion (formato $$)**: envuelve cada fórmula en `$$`, que Notion convierte en una ecuación.

![Copia de fórmulas](/assets/gemini-math-copy.png)

## Características

- **Compatibilidad con Word**: Con el soporte de MathML puedes pegar en documentos de Word fórmulas complejas generadas por IA, manteniendo un formato editable perfecto.
- **Conservación del contexto**: No solo copia la fórmula, también conserva su contexto matemático.
- **Respuesta instantánea**: Se procesa por completo en local para obtener resultados inmediatos.

## Consejos de uso

- **Escritura académica**: Al redactar artículos en Word, pide a Gemini que derive las fórmulas y usa la copia en MathML para pegarlas sin tener que escribirlas a mano en el Editor de ecuaciones de Word.
- **Toma de notas**: Al tomar apuntes en Obsidian o Notion, copia directamente el código fuente LaTeX.

## Dónde funciona

En Gemini y AI Studio, actívala con **Activar la copia de fórmulas** en el popup; ese interruptor y el formato de copia se aplican a ambos sitios. Claude y ChatGPT tienen la copia de fórmulas como plugin integrado, y DeepSeek tiene un plugin de copia de fórmulas en el [catálogo de plugins](/es/plugins).
