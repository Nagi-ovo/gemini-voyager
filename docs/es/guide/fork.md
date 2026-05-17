# Bifurcación de Conversación (Experimental)

El pensamiento no debe ser un camino de un solo sentido. En exploraciones complejas, a menudo necesitamos volver a un nodo crucial y probar diferentes posibilidades.

Con la función de **Bifurcación de Conversación**, Voyager te permite expandir tus ideas y explorar universos paralelos de tu chat.

## Cómo funciona

> **⚠️ Nota**: Esta es una función experimental. Primero debes habilitarla haciendo clic en el icono de la extensión en la barra de herramientas de tu navegador para abrir la ventana emergente de configuración, y activando la opción **"Habilitar bifurcación de conversación"**.

Cada vez que desees tomar un camino diferente, simplemente pasa el cursor sobre tu pregunta y haz clic en el botón de **Bifurcación**:

![Bifurcación](/assets/branching.png)

Voyager captura todo el contexto desde el principio hasta ese punto y muestra un cuadro de confirmación:

- Haz clic en **Fork**: Voyager abre una conversación nueva y rellena automáticamente el campo de entrada con el contexto capturado. Revísalo y envíalo para crear la rama.
- Haz clic en **Descargar MD**: Voyager descarga un archivo Markdown con el contexto y abre una conversación nueva. Antes de que termine la cuenta atrás de la esquina inferior derecha (en 2 minutos), arrastra el archivo `.md` al área de entrada de Gemini. El campo de entrada se rellena con una pequeña plantilla que indica que el adjunto es contexto de la conversación anterior y deja espacio para tu nueva solicitud. Al enviarlo, la conversación nueva queda registrada como rama de ese punto.

Como el flujo de adjuntos de Gemini no se puede automatizar de forma fiable desde la extensión, el modo MD requiere que arrastres el archivo manualmente. La cuenta atrás muestra el tiempo restante; cuando caduca, ya no se crea el vínculo de bifurcación para ese intento.

Voyager solo registra la relación de la rama. No elimina ni reescribe la conversación original.

En esta nueva rama, puedes modificar libremente tu pregunta y explorar diferentes direcciones sin preocuparte por dañar tu historial de chat original. ¡Libera tu creatividad y curiosidad!
