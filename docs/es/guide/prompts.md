# Tus activos intelectuales: biblioteca de prompts

Escribes un prompt perfecto. Resuelve un problema de programación complejo o redacta un correo precioso.
¿Lo tiras?
No. Lo guardas.

## La bóveda de prompts

Este es tu repositorio personal de genialidad.

### 1. Captura

Cuando escribas algo brillante, haz clic en la **bola flotante de Voyager** (por defecto está junto al área de entrada, y puedes arrastrarla a cualquier lugar) para abrir el **Gestor de Prompts**.
Ya forma parte de tu bóveda.

### 2. Clasifica

Añade etiquetas como `coding`, `email` o `research` (sepáralas con comas).
Mantén tus herramientas afiladas y ordenadas.

### 3. Despliega

La próxima vez que lo necesites, no lo vuelvas a escribir.
Abre el gestor, busca por etiqueta o palabra clave y haz clic para insertar.
Un clic. Apalancamiento infinito.

![Gestor de Prompts](/assets/gemini-prompt-manager.png)

## Lista compacta y notas

Cuando los prompts se acumulan y la lista de tarjetas ya no cabe, el panel se adapta:

### Cambio de vista

El botón `≡ / ▦` a la derecha de la barra de búsqueda alterna entre **Compact list** (predeterminada) y **Comfortable view**.

- **Compact list**: un prompt por fila, unos 10 visibles a la vez; a la derecha aparecen las etiquetas, expandir, editar y eliminar
- **Comfortable view**: vista previa completa en Markdown, ideal para una colección pequeña

### Nombre obligatorio

El campo **Nombre** en la parte superior del formulario de añadir o editar da a cada prompt un título corto y es obligatorio al crear o editar un prompt. Los prompts antiguos sin nombre siguen disponibles, pero necesitarán uno la próxima vez que los edites.

### Vista previa rápida al pasar el cursor

En modo compacto, pasa el cursor sobre cualquier fila durante **~250 ms** para ver su contenido completo en un globo flotante. Sustituye al tooltip `title` nativo del navegador, que puede tardar entre 1 y 3 s en abrirse.

### Inserción rápida con barra

En el cuadro de chat, escribe `/` seguido de parte del nombre de un prompt. La lista muestra los nombres y las etiquetas que coinciden; pasa el cursor sobre un elemento para previsualizar su contenido completo y haz clic, o pulsa `Tab` / `Enter`, para seleccionarlo. El editor muestra el nombre elegido como un token resaltado y envía el cuerpo completo del prompt.

![Vista de lista compacta](/assets/gemini-prompt-manager-compact.png)

## Disponible en cualquier sitio

El Gestor de Prompts ya se puede usar en cualquier sitio web que elijas, no solo en Gemini™ y AI Studio.

### Cómo activarlo

En Claude, ChatGPT y DeepSeek, abre el popup de Voyager mientras estás en el sitio y activa el interruptor de ese sitio (por ejemplo, **Activar el Gestor de prompts en Claude**). Se te pedirá que concedas acceso.

Para cualquier otro sitio:

1. Haz clic en el icono de Voyager en la barra de extensiones del navegador.
2. Desplázate hasta la sección **Gestor de Prompts**.
3. Introduce la URL del sitio web (por ejemplo, `chatgpt.com` o `claude.ai`).
4. Haz clic en **Añadir sitio web** y concede el permiso.
5. **Recarga la página de destino** para ver el botón flotante.

### Sitios de IA populares

- `chatgpt.com` - ChatGPT
- `claude.ai` - Claude
- `copilot.microsoft.com` - Microsoft Copilot
- `poe.com` - Poe

### Aplicaciones locales

Las direcciones locales también funcionan: introduce `localhost:3080` o `127.0.0.1:3080` de la misma forma. Por ejemplo, [DeepSeek Harness](/es/guide/deepseek-harness) se ejecuta en `localhost:3080`, y el Gestor de Prompts se conecta a él como a cualquier sitio alojado.

![Gestor de Prompts dentro de DeepSeek Harness](/assets/prompt-manager-deepseek-harness.png)

::: tip
En los sitios web que añades tú mismo, **solo** se activa el Gestor de Prompts. Funciones como la línea de tiempo y las carpetas no se cargan allí. Claude, ChatGPT y DeepSeek son distintos: tienen sus propios plugins oficiales, que puedes consultar en el [catálogo de plugins](/es/plugins).
:::
