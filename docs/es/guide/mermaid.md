# Renderizado de Gráficos Mermaid

Renderiza automáticamente código Mermaid en gráficos visuales.

## Introducción

Cuando Gemini genera un bloque de código Mermaid (como diagramas de flujo, diagramas de secuencia, diagramas de Gantt, etc.), Voyager lo detectará y renderizará automáticamente como un gráfico interactivo.

### Características Principales

- **Detección Automática**: Soporta todos los tipos principales de gráficos Mermaid como `graph`, `flowchart`, `sequenceDiagram`, `gantt`, `pie`, `classDiagram`, etc.
- **Cambio en un Clic**: Cambia libremente entre el gráfico renderizado y el código fuente con un botón.
- **Vista en Pantalla Completa**: Haz clic en el gráfico para entrar en el modo de pantalla completa, con soporte para zoom con la rueda y arrastre para desplazar.
- **Modo Oscuro**: Se adapta automáticamente al tema de la página.

## Cómo Usar

1. Pídele a Gemini que genere cualquier código de gráfico Mermaid.
2. El bloque de código será reemplazado automáticamente por el gráfico renderizado.
3. Haz clic en el botón **</> Code** para ver el código original.
4. Haz clic en el botón **📊 Diagram** para volver a la vista de gráfico.
5. Haz clic en el área del gráfico para ver en pantalla completa.

## Controles en Modo Pantalla Completa

- **Rueda**: Zoom en el gráfico.
- **Arrastrar**: Mover la posición del gráfico.
- **+/-**: Botones de zoom en la barra de herramientas.
- **⊙**: Restablecer vista.
- **✕ / ESC**: Cerrar pantalla completa.

## Compatibilidad y Solución de Problemas

::: warning Nota

- **Limitación de Firefox**: Debido a restricciones del entorno, Firefox usa la versión 9.2.2 y no admite funciones nuevas como **Timeline** o **Sankey**.
- **Errores de sintaxis**: Los fallos de renderizado suelen deberse a errores de sintaxis en la salida de Gemini. Estamos recopilando "bad cases" para implementar parches automáticos en futuras actualizaciones.
  :::

<div align="center">
  <img src="/assets/mermaid-preview.png" alt="Renderizado de Gráficos Mermaid" style="max-width: 100%; border-radius: 8px;"/>
</div>
