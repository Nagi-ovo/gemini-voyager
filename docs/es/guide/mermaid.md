# Renderizado de diagramas Mermaid

Convierte automáticamente el código Mermaid en diagramas visuales.

## Descripción general

Cuando Gemini™ genera bloques de código Mermaid (diagramas de flujo, de secuencia, de Gantt, etc.), Voyager los detecta y los renderiza automáticamente como diagramas interactivos.

### Características principales

- **Detección automática**: admite `graph`, `flowchart`, `sequenceDiagram`, `gantt`, `pie`, `classDiagram` y todos los tipos principales de diagramas Mermaid.
- **Cambio de vista**: alterna entre el diagrama renderizado y el código fuente con un solo clic.
- **Pantalla completa**: haz clic en el diagrama para entrar en pantalla completa, con zoom y desplazamiento.
- **Modo oscuro**: se adapta automáticamente al tema de la página.

## Activarlo o desactivarlo

El renderizado de Mermaid está activado por defecto en Gemini. Para desactivarlo, abre el popup de Voyager y desactiva **Habilitar renderizado de diagramas Mermaid** en **Opciones Generales**. No está disponible en AI Studio.

## Cómo usarlo

1. Pide a Gemini que genere cualquier código de diagrama Mermaid.
2. El bloque de código se reemplaza automáticamente por el diagrama renderizado.
3. Haz clic en el botón **</> Code** para ver el código fuente.
4. Haz clic en el botón **📊 Diagram** para volver a la vista de diagrama.
5. Haz clic en el área del diagrama para verlo en pantalla completa.

## Controles en pantalla completa

- **Rueda del ratón**: acercar o alejar.
- **Arrastrar**: desplazar el diagrama.
- **+/-**: botones de zoom de la barra de herramientas.
- **⊙**: restablecer la vista.
- **✕ / ESC**: cerrar la pantalla completa.

## Compatibilidad y solución de problemas

::: warning Nota

- **Limitación de Firefox**: por restricciones del entorno, Firefox incluye Mermaid 9.2.2, que no admite funciones nuevas como **Timeline** o **Sankey**.
- **Errores de sintaxis**: los fallos de renderizado suelen deberse a errores de sintaxis en la salida de Gemini. Estamos recopilando "bad cases" para implementar parches automáticos contra los errores de generación habituales en futuras actualizaciones.
  :::

<div align="center">
  <img src="/assets/mermaid-preview.png" alt="Renderizado de diagramas Mermaid" style="max-width: 100%; border-radius: 8px;"/>
</div>
