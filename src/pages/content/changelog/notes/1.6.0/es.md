> *«No todos los que vagan están perdidos.» — J. R. R. Tolkien, La Comunidad del Anillo*

### Novedades

- **Safari incorpora funciones nativas de macOS — y la app pasa a llamarse Voyager**: la versión de Safari por descarga directa conecta ahora su WebExtension con la sincronización nativa de Google Drive e iCloud y con notificaciones de macOS que, al terminar una respuesta, abren la conversación correcta. Tras completar esta migración una vez, las próximas versiones se actualizarán mediante Sparkle. La exportación de imágenes y la eliminación de marcas de agua vuelven a funcionar, y la copia de iCloud puede eliminarse desde el popup sin tocar los datos locales. La app anfitriona pasó de llamarse «Gemini Voyager» a «Voyager». ⚠️ **Si vas a actualizar, sigue una vez la guía de migración antes de actualizar para no acabar con dos apps instaladas.**
- **El modo de entrada Vim llega a Claude y ChatGPT**: el cuadro de mensaje ahora admite edición con teclado estilo Vim más allá de Gemini.
- **Bloques de código largos plegables**: los bloques de código demasiado largos pueden plegarse con un botón para que ya no llenen la pantalla al desplazarte.
- **Búsqueda solo por carpetas**: escribe el prefijo `f:` (o `folder:`) en la búsqueda para buscar solo nombres de carpetas, con una insignia que indica cuándo está activo ese modo.
- **Los archivos subidos se indican en las exportaciones**: al exportar una conversación ahora se listan por su nombre los archivos que no son imágenes que adjuntaste, para no perder ese contexto.
- **Elige cómo aparecen las notas de versión**: permite que Voyager abra automáticamente las novedades tras actualizar, o muestra solo una insignia `NEW` hasta que quieras verlas.

### Correcciones

- **Eliminación de marca de agua más inteligente y amplia**: admite las últimas variantes de marca de agua de Gemini y más tamaños de logo (incluidas imágenes pequeñas y grandes reducidas), tiene éxito en más casos límite y sigue ejecutándose solo cuando se detecta realmente una marca de agua. Las páginas de Notebook (NotebookLM) ya no se ven afectadas, Safari vuelve a descargar la imagen sin marca de agua a tamaño completo y los fallos recurren a una descarga normal.
- **Indicador de uso más fiable**: funciona de forma constante en navegadores Chromium (Chrome / Edge), ya no salta a un valor más bajo erróneo por datos obsoletos, conserva la cuenta atrás de reinicio tras recargar y muestra un enlace pulsable cuando no hay datos.
- **Carpetas más robustas**: las asignaciones de carpeta sobreviven al desplazamiento de la barra lateral de Gemini (virtualización), hacer clic en una conversación abre la correcta, el cambio de nombre usa el diálogo nativo de Gemini y se mantiene sincronizado, y las importaciones ya no fallan bajo contención.
- **Los borradores se quedan con su conversación**: un borrador sin enviar permanece en la conversación donde lo escribiste y no se sobrescribe al cambiar de chat.
- **El recorrido de bienvenida ya no se cierra por accidente**: hacer clic en la página durante el recorrido ya no lo termina; solo lo hace un cierre explícito o Escape.
- **El resaltado ahora es opcional**: si nunca usaste el resaltado, ahora empieza desactivado (los resaltados existentes siguen activos y tus datos no cambian).
- **Rendimiento y más**: inicio de funciones más rápido y menos memoria en conversaciones largas, los ajustes del popup se desplazan de inmediato, Mermaid en pantalla completa se limpia al cerrar, la vista previa de la línea de tiempo se mantiene visible, la exportación gestiona los mensajes cargados de forma diferida, la validación de plugins bloquea las URL remotas y de esquema de script, y el aislamiento entre cuentas es más robusto.
