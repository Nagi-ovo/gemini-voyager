# Marca de Tiempo

::: info
**Nota**: Esta función está disponible en la versión 1.3.7 y posteriores.
:::

Voyager muestra la hora de envío de cada mensaje, ayudándote a rastrear la línea temporal completa de tus conversaciones.

## Introducción

A medida que las conversaciones se alargan, se hace difícil recordar cuándo tuvo lugar una discusión particular.

Voyager anota cada mensaje con una marca de tiempo precisa (formato: `AAAA-MM-DD HH:mm:ss`) encima del mensaje, y muestra la misma hora al pasar el cursor sobre un punto de la línea de tiempo.

## Cómo activarlo

1. Abre el panel de ajustes de Voyager (el icono de la extensión en la barra de herramientas del navegador).
2. Activa **Línea de tiempo** → **Marcas de tiempo de mensajes** (marcado como **Experimental**, desactivado por defecto).

En ChatGPT, activa **Complementos** → **ChatGPT · Línea de tiempo** y, en sus **Opciones**, activa **Mostrar marcas de tiempo de mensajes**: es el mismo ajuste que la fila de Gemini.

## De dónde salen las horas

- **Gemini**: Voyager lee la hora real de envío de cada mensaje de los propios datos de conversación de Gemini, así que las horas son correctas incluso en conversaciones que tuviste en otro dispositivo o antes de instalar Voyager. Solo cuando esa hora no está disponible, Voyager recurre a la hora en que vio el mensaje por primera vez, guardada localmente en tu navegador.
- **ChatGPT**: Voyager registra la hora de cada mensaje que envías mientras la opción está activada. Estas horas se guardan localmente en tu navegador; los mensajes enviados antes, o desde otro dispositivo, no tienen marca de tiempo.

## Características

- **Precisión al segundo**: Fecha y hora completas, perfecto para revisar conversaciones largas.
- **Cero distracción**: La información temporal se presenta de forma discreta sin afectar la experiencia de lectura.

## Casos de uso

- **Registros de trabajo**: Revisar cuándo se alcanzó una decisión particular.
- **Notas de estudio**: Marcar cuándo se discutió un concepto para repasarlo después.
- **Revisión de conversaciones largas**: En conversaciones profundas de varios días, distinguir claramente las discusiones de diferentes períodos.

## Plataforma

**Google Gemini** (`gemini.google.com`) y **ChatGPT** (`chatgpt.com`). No está disponible en Claude ni en DeepSeek.
