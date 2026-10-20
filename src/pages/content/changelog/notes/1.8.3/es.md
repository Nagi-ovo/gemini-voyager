> _«Cualquiera puede cocinar.» (Gusteau, 《Ratatouille》)_

### Novedades

- **Plantillas de prompt**: escribe `{{nombre}}` en un prompt guardado y Voyager te pedirá esos valores antes de enviarlo. Los campos quedan dentro de la frase a la que pertenecen, y el menú de barra usa el mismo analizador.
- **Prompts enviados**: un prompt enviado ya no llena el turno con el texto de la plantilla. Se reduce a una pastilla con su nombre: ábrela para leer lo que se envió realmente, con los valores que rellenaste resaltados, y lo que escribiste tú sigue visible en ambos estados.
- **Completado mientras escribes**: tras `/`, el resto del nombre del prompt seleccionado aparece más allá del cursor. Tab lo acepta, Intro inserta el prompt.
- **Cambiar un valor antes de enviar**: pasa el cursor por un prompt ya insertado y edita lo que rellenaste, en la propia vista previa.

### Correcciones

- **Restos en carpetas**: al borrar un chat en Gemini, la entrada correspondiente de la carpeta también se elimina, sin dejar enlaces rotos.
- **Posición de lectura** _(desactivado por defecto)_: con «Evitar el desplazamiento automático» activado, una respuesta terminada ya no te arrastra al final mientras lees más arriba.
- **Ancho del chat**: en el nuevo diseño de Gemini, el ancho del chat y el del cuadro de edición se ajustan por separado. El compositor ya no queda bloqueado al ancho del chat.
- **Botón de exportar de ChatGPT** _(desactivado por defecto)_: el botón de exportar ya no tapa Compartir ni el menú Más de ChatGPT.
- **Cuadro de edición de Gemini**: en Safari y Firefox los botones Cancelar y Actualizar vuelven a quedar bajo el cuadro en lugar de irse al extremo izquierdo. Con el control de ancho de edición activado, el cuadro ya no sobresale de esa fila.
- **Vista previa de prompts**: la vista previa al pasar el cursor representa Markdown en vez de mostrar `#` y `-` en crudo, y sigue el estilo del panel.
- **Color de acento de prompts**: un acento personalizado conserva su saturación y ya no vuelve al verde por defecto al pasar el cursor.
- **Diálogos de carpetas**: editar las instrucciones de una carpeta o elegir un destino sobrevive a que Gemini reconstruya su barra lateral, sin perder lo escrito.
- **Carpetas en Firefox**: si falla la resolución de la cuenta se reintenta, así el panel ya no aparece vacío ni descarta en silencio las carpetas que añades.
- **Posición de la vista previa**: la vista previa del panel se coloca junto a él en lugar de tumbarse sobre la lista, y la de un prompt del cuadro de escritura queda centrada justo encima.
- **Valores largos**: un valor largo se ajusta con la frase en la que está, en vez de obligar a su tarjeta a desplazarse en horizontal.
- **Superficies de la línea de tiempo**: la vista previa y el menú contextual de la línea de tiempo usan la paleta y la tipografía del panel de prompts, en lugar de su propio azul oscuro.
