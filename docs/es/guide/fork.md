# Bifurcación de Conversación (Experimental)

El pensamiento no debe ser un camino de un solo sentido. En exploraciones complejas, a menudo necesitamos volver a un nodo crucial y probar diferentes posibilidades.

Con la función de **Bifurcación de Conversación**, Voyager te permite expandir tus ideas y explorar universos paralelos de tu chat.

## Cómo funciona

> **⚠️ Nota**: Esta es una función experimental. Primero debes habilitarla haciendo clic en el icono de la extensión en la barra de herramientas de tu navegador para abrir la ventana emergente de configuración, y activando la opción **"Habilitar bifurcación de conversación"**.

Cada vez que desees tomar un camino diferente, simplemente pasa el cursor sobre tu pregunta y haz clic en el botón de **Bifurcación**:

![Bifurcación](/assets/branching.png)

Voyager captura todo el contexto desde el principio hasta ese punto y muestra un cuadro de confirmación. Elige según la longitud del contexto:

- **Descargar MD** (recomendado para la mayoría de conversaciones): el campo de entrada de Gemini tiene límites de longitud, por lo que un contexto largo puede no caber si se inserta directamente. Voyager descarga un archivo Markdown con el contexto y abre una conversación nueva; arrastra el archivo `.md` a Gemini antes de que termine la cuenta atrás de 2 minutos en la esquina inferior derecha. El campo de entrada queda rellenado con una nota breve que indica que el adjunto es contexto de la conversación anterior y deja espacio para tu nueva solicitud.
- **Fork** (mejor para conversaciones cortas): si el contexto es breve, Voyager abre una conversación nueva y rellena el campo de entrada directamente; envíalo para crear la rama.

Después de enviarlo, Voyager solo registra la relación de la rama. No elimina ni reescribe la conversación original.

En esta nueva rama, puedes modificar libremente tu pregunta y explorar diferentes direcciones sin preocuparte por dañar tu historial de chat original. ¡Libera tu creatividad y curiosidad!
