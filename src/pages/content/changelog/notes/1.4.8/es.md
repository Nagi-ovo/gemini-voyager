### Novedades

- **Marketplace oficial de plugins y guía de contribución**: Voyager incluye ahora una marketplace de plugins integrada. Cualquiera puede publicar un plugin siguiendo la [guía de contribución](https://voyager.nagi.fun/guide/plugin-contribution): empieza con un plugin declarativo CSS + JSON, sin compilar la extensión. Échales un vistazo en la [Plugin Store](https://voyager.nagi.fun/plugins).
- **Plugin nativo «Copiar fórmulas»** *(desactivado por defecto, se activa bajo demanda)*: Un nuevo plugin oficial «Copiar fórmulas» viene incluido en la extensión, pero permanece **desactivado** hasta que tú lo enciendas; mientras esté apagado, no hace absolutamente nada. Para usarlo, abre la sección de Plugins del popup y activa el interruptor del sitio correspondiente (Claude o ChatGPT). El navegador mostrará un único cuadro de diálogo para conceder a Voyager el acceso a ese sitio. Tras aceptarlo, haz clic en una fórmula de la página y se copiará como LaTeX en Markdown. No hay activación silenciosa alguna: el cuadro de autorización es el único paso de «configuración».
- **Metadatos de plugins localizados**: El nombre y la descripción de los plugins siguen ahora el idioma del popup; las tarjetas de la marketplace en el sitio también.

### Correcciones

- **Ancla de la marca de agua movida por Gemini**: El removedor de marca de agua se ha vuelto a adaptar a la nueva posición del ancla de Gemini — el aviso de alta tasa de fallos de 1.4.7 queda resuelto.
- **Desmontaje completo de la marca de agua**: `stopWatermarkRemover` libera ya todos los observers, timers y listeners que creó, así que al desactivarlo no puede dejar el estado «procesando» colgado.
- **Área de clic del toggle de la barra lateral**: Restablecida el área de clic ampliada del toggle de la barra lateral contraída, que se había revertido en la versión anterior.
- **Títulos al arrastrar carpetas**: Los títulos durante el arrastre siguen ahora el estilo nativo de Gemini, tanto en AI Studio como en el hover del historial.
- **Selector de carpeta hacia arriba**: El selector de proyecto de carpeta se abre ahora hacia arriba cuando no hay espacio debajo.
- **Texto «Quitar de la carpeta»**: El mensaje de confirmación es más claro — estás quitando la conversación de la carpeta, no borrando la carpeta.
- **Activación del tooltip de la timeline**: Los tooltips esperan ahora un hover explícito en lugar de parpadear con cada scroll.
- **Puerta de permisos opcionales en Firefox**: Los usuarios de Firefox 116+ pueden volver a conceder permisos opcionales (regresión del parche para Fx<128).
- **Restauración de copias de seguridad duraderas en Safari**: La restauración escribe ya en almacenamiento duradero, evitando perder copias de carpetas en la ventana ITP de 7 días.
- **Idioma del toast de «Copiar fórmula»**: El toast de éxito sigue el idioma de la interfaz elegido, no la locale del navegador.
- **Accesibilidad**: Sliders, switches y ratings cuentan ya con aria-labels apropiados, y `eslint-plugin-jsx-a11y` se aplica en CI.

### Rendimiento

- **Carga diferida de KaTeX y JSZip**: KaTeX y JSZIP ya no se incluyen en el bundle del content-script — solo se cargan cuando se necesitan (vista previa de matemáticas, export de imagen).
- **Carga diferida de marked + KaTeX en la vista previa de prompts**: La vista previa markdown ya no parsea las fórmulas al abrir el popup.
- **Inicialización de la marca de agua en diferido**: La inicialización del observer se cede a `requestIdleCallback`, mejorando el primer render.
- **Saltarse la reescritura vacía en el aislamiento de cuenta**: Ya no se reescribe el profile-map si no hay cambios.
