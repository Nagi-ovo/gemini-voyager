> _« Con suficientes ojos, todos los errores son evidentes. » — Eric S. Raymond, 《La catedral y el bazar》_

### Novedades

- **Inserta prompts guardados con `/`**: escribe `/` en el cuadro de Gemini para buscar tus prompts guardados por nombre, previsualizar uno e insertarlo desde el teclado. Ahora tiene su propio interruptor, así que sigue funcionando aunque ocultes la bola del gestor de prompts.
- **Pon nombre a los interlocutores en tus exportaciones**: sustituye las etiquetas Usuario e IA por tus propios nombres. El cambio se aplica a las exportaciones en Markdown, PDF e imagen, y se recuerda.
- **Usa tus prompts como encabezados de Markdown** _(desactivado por defecto)_: cada turno se titula con la pregunta que hiciste realmente en lugar de un número de turno genérico.
- **Diagnóstico anonimizado con un clic**: el popup puede generar un informe de diagnóstico sin conversaciones, cuentas ni enlaces — cópialo en Markdown o descárgalo en JSON al informar de un problema.
- **El ancho de lectura ahora cubre los artefactos de Claude**: Claude · Ancho de lectura cómodo se extiende a los paneles de artefactos de documento de Claude. Si ya lo tenías activado, pulsa una vez «Conceder acceso al sitio requerido» en el gestor de plugins.
- **El popup recuerda dónde estabas**: al reabrirlo vuelves al mismo punto de la lista de ajustes en lugar de saltar al principio.
- **Un instalador de Safari en condiciones**: la descarga para macOS abre ahora una ventana de instalación diseñada — arrastra Voyager a Aplicaciones, con la guía de actualización justo al lado.

### Correcciones

- **Los marcadores y estrellas se quedan en el mensaje correcto**: la línea de tiempo sigue ahora los identificadores de mensaje de Gemini, así que recargar una conversación larga ya no desplaza estrellas, marcas de tiempo, bifurcaciones ni resaltados, y quitar una estrella ya no borra el marcador equivocado.
- **La carpeta de copia de Drive pasa a llamarse Voyager Data**: una carpeta existente se renombra en el sitio — no se mueve, copia ni elimina nada. Voyager ahora la localiza por un marcador oculto, así que puedes renombrarla o moverla a cualquier parte de Drive sin romper la sincronización.
- **Los prompts con nombres repetidos sobreviven a la importación y la sincronización**: los prompts con el mismo nombre ya no se descartan ni se sobrescriben al importar o sincronizar desde Drive, y los duplicados se señalan para que puedas renombrarlos.
- **Se acabaron los prompts en blanco con el atajo de envío**: con «Cmd/Ctrl+Intro para enviar» activado, pulsar el atajo mientras un archivo aún se está subiendo ya no envía un prompt vacío: espera a que termine la subida.
- **Mermaid, en todos los frentes**: las exportaciones a PDF e imagen contienen ahora el diagrama renderizado en lugar de su código, los diagramas siguen el tema claro u oscuro de Gemini, se renderizan cuando la interfaz de Gemini está en japonés, coreano, árabe y más idiomas, y los fallos de sintaxis más comunes se reparan automáticamente.
- **Eliminación de marca de agua más fiable**: ahora se manejan las marcas de agua sobre fondos oscuros y las difíciles de detectar, y cambiar el ajuste surte efecto de inmediato en las pestañas de Gemini ya abiertas.
- **Carpetas más robustas**: una barra lateral que desaparece un instante ya no te deja atrapado en un panel flotante con un botón que no se puede cerrar, y el panel de carpetas ya no aparece duplicado.
- **El indicador de uso vuelve a actualizarse**: un nuevo tramo de uso añadido por Gemini ya no provoca que se descarte toda la respuesta; el indicador se actualiza desde cualquier conversación y conserva el ámbito multicuenta.
- **Y más**: las exportaciones de informes de Deep Research vuelven al menú, el aislamiento de cuentas en Firefox ya no se atasca, los prompts con barra siguen tu color de acento, el panel de sincronización en la nube muestra una tarjeta de plataforma más clara, y el plugin de la barra de uso de Claude se ha retirado.
