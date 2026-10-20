> _«Attention is all you need.» — Vaswani et al., 《Attention Is All You Need》(2017)_

### Novedades

- **Línea de tiempo regla** _(desactivado por defecto)_: un tercer estilo de línea de tiempo cuyas marcas crecen alrededor de donde estás leyendo, con vista previa de la pregunta y la respuesta al pasar el cursor. Cámbialo en «Estilo de línea de tiempo» dentro de la ventana de la extensión.
- **Vista de actividad** _(desactivado por defecto)_: pulsa la campana junto a Carpetas en la barra lateral de Gemini para cambiar el árbol de carpetas por una lista ordenada por tiempo — Prioritario (respuesta nueva en las últimas 3 horas), Hoy, Ayer — y ver de un vistazo qué conversación retomar. [→ Documentación](/guide/activity-view) ![Vista de actividad](https://github.com/voyager-crew/voyager/raw/main/docs/public/assets/promotion/Activity-View.png)
- **Gestor de prompts en sitios con puerto**: añade sitios de chat autoalojados como `localhost:3000` como sitios personalizados.
- **Ancho de la barra lateral desde el menú de carpetas** _(desactivado por defecto)_: ajústalo ahí mismo, sin abrir la ventana de la extensión.
- **La búsqueda de ajustes recuerda tu última consulta**: al reabrir la ventana, el campo de búsqueda recupera lo último que escribiste.

### Correcciones

- **La navegación por la línea de tiempo deja de quedarse muerta**: después de que Gemini reconstruye su área de desplazamiento, los puntos de la línea de tiempo, la lista de vista previa y los atajos `j`/`k` siguen saltando al mensaje correcto.
- **La vista previa compacta sobrevive al hueco**: mover el puntero del raíl al panel de vista previa ya no lo cierra, así que sus elementos vuelven a ser pulsables.
- **Los botones de la cabecera vuelven a responder**: con el ancho de chat activado, un área invisible alrededor del logo de Gemini ya no bloquea los botones de cerrar la barra lateral, chat temporal y demás.
- **La capa para soltar archivos coincide con el ancho de tu campo de entrada**: la zona azul abarca ahora el campo ensanchado en lugar de quedarse en el ancho por defecto de Gemini.
- **Copiar fórmulas vuelve a funcionar en ChatGPT**: ChatGPT cambió la forma de representar las fórmulas y la copia dejaba de hacer nada; las fórmulas en bloque también reciben los delimitadores correctos. Los complementos que quedaban inactivos en Edge tras conceder acceso al sitio ahora se activan de inmediato.
- **Más marcas de agua eliminadas**: más imágenes de Gemini a tamaño completo salen limpias, y la insignia 🍌 aparece en cuanto hay un botón de descarga, sin esperar a que cargue el motor.
- **Un aviso cuando Google devuelve una imagen dañada**: si el original que descargas no coincide con la vista previa en pantalla —borroso o cortado—, Voyager te lo indica y aclara que no fue la causa.
- **Y más**: el campo de búsqueda de ajustes ya no muestra dos botones de borrar, la preferencia de la insignia de actualización se movió a Opciones generales donde la búsqueda la encuentra, la guía de Claude ya no tapa un artefacto abierto, y el interruptor para ocultar Carpetas desapareció: lo que tuvieras oculto vuelve plegado.
