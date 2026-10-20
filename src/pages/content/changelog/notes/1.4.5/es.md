**Actualización importante — dedícale un minuto.** La interfaz web de Gemini acaba de recibir un rediseño importante, y esta versión reconstruye toda la extensión para el nuevo diseño (barra lateral, selector de modelo, panel de carpetas, entrada Gems) para que tu configuración existente siga funcionando. Las correcciones siguientes responden a informes reales de las últimas 24 horas — si algo sigue roto, espera un parche rápido.

### Novedades

- **Lista de Gems recientes en la barra lateral**: La entrada nativa de Gems se expande en una lista de tus gems recientes con acceso de un clic.
- **Bloqueo del nivel de pensamiento**: El ajuste de modelo predeterminado también recuerda y reaplica tu nivel de pensamiento preferido (Estándar / Extendido).
- **Interruptor del halo del cuadro de entrada** *(desactivado por defecto)*: Oculta el halo azul de degradado radial detrás del cuadro de entrada de Gemini.
- **Fork por subida de Markdown**: Inicia un nuevo fork subiendo un archivo markdown — su contenido se rellena automáticamente como contexto en el nuevo mensaje.
- **Ajustes en la barra de herramientas de carpetas**: Los ajustes del panel flotante de carpetas se trasladan a su barra de herramientas, con un popover de sincronización en la nube y respaldo automático al modo flotante.
- **Controles para ocultar Notebooks / Recents**: Vuelven los botones de esquina para ocultar Notebooks y Recents, además de un nuevo intercambio de esquina para elegir sobre qué sección se ancla el panel de carpetas.

### Correcciones

- **Selector de modelo en Gemini 2026**: El bloqueo del modelo predeterminado reconoce la nueva capa del selector y el menú deja de parpadear abriéndose y cerrándose.
- **Ocultación automática de la barra lateral en Gemini 2026**: La ocultación automática encuentra el nuevo botón de plegado.
- **Posición del panel de carpetas**: El panel de carpetas se mantiene fiablemente sobre Recents tras los re-renderizados de Gemini.
- **Fuga de la barra lateral colapsada**: Nuestra lista de gems y la interfaz de carpetas dejan de sobresalir del riel colapsado.
- **Atajos de teclado vs IME**: Los atajos ya no se disparan durante la composición IME ni dentro de campos editables.
- **Seguridad de sobrescritura en la nube**: La sobrescritura en la nube se bloquea cuando aún no existe una copia local de carpetas.
- **Prerelleno del fork por subida de Markdown**: Subir un archivo markdown en el flujo de fork rellena correctamente el mensaje de contexto.
