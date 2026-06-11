# Barra de estado de uso

Gemini 2026 añadió límites de uso a las conversaciones, pero para ver cuánto te queda tienes que ir a la página completa `gemini.google.com/usage`.

Voyager convierte tus límites **diario** y **semanal** en una pequeña **barra flotante arrastrable** que vive justo en la interfaz del chat — échale un vistazo cuando quieras sin salir de la conversación.

![Barra de estado de uso](/assets/gemini-usage-status.png)

## Cómo se ve

Una mini-barra compacta: una insignia de plan (p. ej. `PRO`), dos barras de progreso finas (diaria / semanal) con porcentajes, un botón de actualizar y un pequeño icono que abre la página de uso nativa. Translúcida y discreta — se mantiene apartada de la conversación.

## Cómo funciona

- **Arrastrable + recuerda su sitio**: agarra la barra por cualquier punto y suéltala donde te convenga; la posición persiste entre recargas, navegación y pestañas. Por defecto aparece centrada justo encima del cuadro de escritura.
- **Se actualiza en silencio en segundo plano**: los datos se actualizan solos — **nunca tienes que recargar la página ni abrir `/usage`**. Se actualiza unos segundos después de que termine cada respuesta (justo cuando cambia tu uso), con un respaldo conservador en reposo cada pocos minutos.
- **Pasa el cursor para ver detalles**: pasa el cursor sobre una barra para ver la hora de reinicio de esa cuota; pasa el cursor sobre toda la barra para ver "Recién actualizado / Actualizado hace X min".
- **Dos controles con un propósito definido**:
  - **Actualizar ↻** — fuerza una actualización silenciosa inmediata (gira y se actualiza en su sitio; **nunca navega**).
  - **Abrir ↗** — abre la página `/usage` nativa en una pestaña nueva. Es lo **único** de la barra que navega.

## Cómo usarlo

1. Abre el panel de ajustes de Voyager (el icono de la extensión en la barra de herramientas del navegador).
2. Activa el interruptor **Barra de estado de uso** (desactivado por defecto).
3. La barra flotante aparece en la interfaz del chat de inmediato — arrástrala donde quieras.

::: tip Funciona desde el primer momento
Una vez activada, Voyager obtiene tu uso en segundo plano automáticamente — **no necesitas visitar `/usage` primero**. Si Google llegara a cambiar su API interna y los números dejaran de llegar, basta con abrir `gemini.google.com/usage` una vez y Voyager se recalibra con los valores reales mostrados en esa página.
:::

## Frecuencia de actualización y detección

Las actualizaciones son **basadas en eventos**: la barra solo se refresca después de que tu uso cambie de verdad (es decir, tras enviar un mensaje), más un respaldo conservador en reposo — **sin sondeo agresivo**. Cada actualización es exactamente la misma petición que la propia página usa para obtener el uso, hecha con tu propia sesión iniciada y a un ritmo humano. El volumen de peticiones es aproximadamente "una vez por turno de conversación", así que el impacto en la detección de Google es insignificante.

## Privacidad

- Tanto los números de uso como la posición de la barra se guardan **solo localmente** (`chrome.storage.local`) — nada se sube a ningún servidor.
- Nunca lee ni cachea el contenido de las conversaciones — solo los dos porcentajes, las horas de reinicio y el nombre del plan.
- Desactiva el interruptor y la barra desaparece; la caché permanece local, así que volver a activarla no requiere recargar.

## Plataforma

Solo **Google Gemini** (`gemini.google.com`).
