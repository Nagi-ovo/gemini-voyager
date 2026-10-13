# Comportamiento de envío

::: info
**Nota**: esta función está disponible desde la versión 1.3.7.
:::

Cambia el atajo de envío a `Ctrl+Enter` (o `⌘+Enter` en macOS), de modo que `Enter` pase a ser una tecla de nueva línea y puedas escribir prompts de varias líneas con comodidad.

## Por qué esta función

Por defecto, pulsar `Enter` envía el mensaje de inmediato. Al escribir prompts largos, pegar código de varias líneas o dar formato a tu entrada, esto provoca envíos accidentales: solo querías un salto de línea, pero el mensaje ya se había enviado.

Cuando está activada:

- **Enter** → inserta una nueva línea
- **Ctrl+Enter** (en macOS: **⌘+Enter**) → envía el mensaje

Shift+Enter y la composición de IME mantienen el comportamiento propio del sitio, y Ctrl/⌘+Enter espera mientras un adjunto todavía se está subiendo.

## Cómo activarla

1. Abre el popup de Voyager.
2. En **Opciones de entrada**, activa **Ctrl+Enter para enviar** (aparece como **⌘+Enter para enviar** en macOS).

## Otros sitios

- **AI Studio** funciona al revés: activa **Enter para enviar en AI Studio** para enviar con `Enter` y añadir una nueva línea con `Ctrl/⌘+Enter`.
- **Claude, ChatGPT y DeepSeek**: instala para ese sitio el plugin **Ctrl/Cmd+Enter to send** desde el [catálogo de plugins](/es/plugins).
- **Safari**: si Gemini necesita pulsar Enter dos veces para enviar, activa **Corregir tecla Enter en Safari**.

## Funciones

- **Sin coste de rendimiento**: cuando está desactivada, no hay ningún listener de teclado activo, así que no afecta al rendimiento de la página.
- **Cambio instantáneo**: los cambios se aplican en cuanto los activas o desactivas en los ajustes, sin recargar la página.
