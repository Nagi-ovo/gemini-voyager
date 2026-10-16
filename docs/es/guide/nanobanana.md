# Image Refinement (eliminación de marca de agua)

::: tip Compatibilidad con Safari
Desde la v1.6.0, **Image Refinement** funciona directamente en Safari, incluida la descarga de imágenes sin marca de agua a tamaño completo. Chrome, Edge, Firefox y Safari comparten ahora el mismo flujo integrado.
:::

**Imágenes de IA, como deben ser: puras.**

Las imágenes generadas por Gemini™ vienen con una marca de agua visible por defecto. Aunque esto es por razones de seguridad, en ciertos escenarios creativos, puedes necesitar un borrador completamente limpio.

## Restauración Sin Pérdidas

Image Refinement utiliza un **Algoritmo de Mezcla Alfa Inversa (Reverse Alpha Blending)**.

- **Sin Repintado AI**: La eliminación de marcas de agua tradicional a menudo utiliza IA para difuminar, lo que puede destruir los detalles de la imagen.
- **Precisión a Nivel de Píxel**: A través del cálculo matemático, eliminamos con precisión la capa transparente de la marca de agua superpuesta en los píxeles, restaurando el 100% de los puntos de píxel originales.
- **Cero Pérdida de Calidad**: La imagen antes y después del procesamiento es completamente idéntica en las áreas sin marca de agua.

## Cómo Usar

Abre el popup de Voyager y activa las filas que quieras en **Complementos**. Ambas están desactivadas por defecto:

- **Eliminar marca de agua al descargar** (recomendado): al hacer clic en el botón de descarga de Gemini, el archivo guardado no lleva marca de agua. Un pequeño distintivo 🍌 en el botón indica que está activo; el botón sigue siendo el de Gemini.
- **Eliminar marca de agua en la vista previa** (marcado como **Experimental**): también limpia las imágenes que se muestran en pantalla. Es más lento, y una imagen puede parpadear brevemente mientras se procesa.

Al desactivar la eliminación al descargar, las descargas siguientes no se modifican. Una descarga que ya se está procesando termina con el ajuste que tenía al comenzar, sin guardar una segunda copia por el cambio. Al desactivar la eliminación en la vista previa, se restauran los originales solo donde aún se muestra la imagen procesada por Voyager. Las imágenes que Gemini haya cambiado después se conservan.

## La opción integrada de Gemini

Gemini está implantando su propio interruptor de marca de agua visible: **Configuración → Media watermark → Off**. Si tu cuenta lo tiene, úsalo y desactiva la eliminación de marca de agua de Voyager, porque la opción de Gemini es más fiable. Voyager muestra un aviso único sobre ello e indica cuándo tus imágenes recientes ya llegan sin marca de agua. Si todavía no encuentras el interruptor, sigue usando Voyager. En cualquier caso, los metadatos SynthID y C2PA se mantienen.

<div style="text-align: center; margin-top: 30px;">
  <img src="/assets/nanobanana.png" alt="Ejemplo Image Refinement" style="border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); max-width: 100%;"/>
</div>

## Agradecimientos Especiales

Esta función se basa en el proyecto [gemini-watermark-remover](https://github.com/journey-ad/gemini-watermark-remover) desarrollado por [journey-ad (Jad)](https://github.com/journey-ad). Este proyecto es una adaptación en JavaScript de la [versión C++ de GeminiWatermarkTool](https://github.com/allenk/GeminiWatermarkTool) desarrollada por [allenk](https://github.com/allenk). Gracias a los autores originales por su contribución a la comunidad de código abierto. 🧡
Los avisos MIT de terceros conservados están disponibles en [THIRD_PARTY_NOTICES.md](https://github.com/voyager-crew/voyager/blob/main/THIRD_PARTY_NOTICES.md).

## Privacidad y Seguridad

Todo el procesamiento de eliminación de marcas de agua se realiza **localmente en tu navegador**. Las imágenes no se suben a ningún servidor de terceros, protegiendo tu privacidad y seguridad creativa.
