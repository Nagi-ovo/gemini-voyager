# Corrección de Renderizado Markdown

La interfaz web de Gemini™ a veces inserta elementos HTML (como fuentes de citas o marcadores de resaltado) dentro del texto, lo que puede romper la sintaxis de negrita de Markdown (`**texto**`), haciendo que el texto no se muestre correctamente en negrita.

Voyager incluye una función de corrección automática que identifica y repara de forma inteligente estas etiquetas de negrita rotas, asegurando que sus documentos se rendericen de manera limpia y precisa.

> [!NOTE]
> Este plugin oficial viene incluido en Voyager y está activado por defecto. Haz clic en el icono de la extensión en la barra de herramientas del navegador y usa **Contenido de las respuestas** → **Corrección del formato Markdown** en la ventana emergente para activarlo o desactivarlo. Al desactivarlo, deja de corregir contenido nuevo, pero las correcciones que ya ves en pantalla se mantienen. Recarga la página para ver el formato original de Gemini. Al volver a activarlo, corrige el formato de la página actual.

La exportación y la bifurcación de conversaciones siguen funcionando con el plugin desactivado, pero pueden conservar los problemas de formato de Gemini, como marcas Markdown visibles en los archivos exportados.
