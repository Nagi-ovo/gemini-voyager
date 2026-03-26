# Comportamiento de Envío

::: info
**Nota**: Esta función está disponible en la versión 1.3.7 y posteriores.
:::

Cambia el atajo de envío de Gemini a `Ctrl+Enter` (`⌘+Enter` en macOS), convirtiendo `Enter` en una tecla de nueva línea para que puedas componer prompts de varias líneas con tranquilidad.

## Por qué esta función

Por defecto, presionar `Enter` en Gemini envía el mensaje inmediatamente. Al escribir prompts más largos, pegar código de varias líneas o formatear cuidadosamente tu entrada, esto a menudo provoca envíos accidentales — solo querías una nueva línea, pero el mensaje ya se envió.

Al activar:

- **Enter** → Insertar nueva línea
- **Ctrl+Enter** (macOS: **⌘+Enter**) → Enviar mensaje

## Cómo activar

1. Abre el panel de configuración de Voyager (popup).
2. Encuentra el interruptor **Ctrl+Enter para enviar**.
3. Actívalo.

## Características

- **Cero sobrecarga de rendimiento**: Cuando está desactivado, no hay listeners de eventos de teclado activos — sin impacto en el rendimiento de la página.
- **Cambio instantáneo**: Los cambios surten efecto inmediatamente después de activar en la configuración, sin necesidad de actualizar la página.
- **Compatible con modo edición**: También funciona al editar mensajes enviados previamente.
