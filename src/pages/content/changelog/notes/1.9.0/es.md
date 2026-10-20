> _«Hacia lo desconocido» — DeepSeek_

### Destacados

- 🐳 **Compatibilidad con DeepSeek**: cinco plugins oficiales — una línea de tiempo con mensajes destacados y búsqueda, copia de fórmulas, un ancho de lectura ajustable, edición Vim en el campo de escritura, y código que conserva sus propias líneas.

### Novedades

- **Reordenar los prompts guardados**: arrastra por el asa al final de la fila, o usa ↑/↓. El orden sigue bien aunque una búsqueda oculte parte de la lista.
- **Fijar prompts**: la estrella al final de la fila mantiene arriba los que más usas.
- **Los plugins nuevos aparecen solos**: un plugin nuevo o una corrección ya no esperan a una publicación de la extensión.

### Correcciones

- **Variables de plantilla en cualquier escritura**: `{{主题}}`, `{{테마}}` y `{{тема}}` no se reconocían como plantillas: el formulario no se abría y el texto en bruto llegaba al modelo. Ocho de los diez idiomas estaban afectados; ahora funcionan los diez.
- **Copiar e Insertar de una plantilla**: cambiar la preferencia en la ventana emergente con un formulario abierto ya no cambia lo que hace su botón.
- **Orden de la línea de tiempo**: subir en una conversación larga de :claude: Claude ya no manda atrás los primeros turnos, y las marcas compactas ya no se amontonan.
- **:chatgpt: Exportación de ChatGPT**: un turno en blanco ya no hace fallar toda la exportación.
- **Selección múltiple en carpetas**: la confirmación, el recuento y el botón de salir ya no están en inglés fijo.
- **:gemini: Ancho de conversación en Gemini**: el deslizador solo ensanchaba tus mensajes y las respuestas no se movían. Ahora respuestas, bloques de código y fila de acciones lo siguen.
- **Saltos de la línea de tiempo**: un salto largo se desliza en vez de teletransportarse. Sigue siendo instantáneo con menos animación.
- **Marcas de favoritos**: cambiar de conversación ya no pinta las marcas de la anterior.
- **Modelo por defecto**: :gemini: Gemini escribe «Flash» en el botón y «3.8 Flash» en el selector, así que cada chat nuevo obligaba a abrir el selector. Ya no — y sigue un cambio de nombre.
- **Firefox**: algunos estilos fallaban en silencio en versiones antiguas; ahora se degradan bien.
