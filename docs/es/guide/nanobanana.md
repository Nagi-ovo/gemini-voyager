# Image Refinement (eliminación de marca de agua)

::: tip Compatibilidad con Safari
Desde la v1.6.0, **Image Refinement** funciona directamente en Safari, incluida la descarga a tamaño completo sin marca de agua. Chrome, Edge, Firefox y Safari comparten ahora el mismo flujo integrado.
:::

**Imágenes de IA, puras.**

Por defecto, las imágenes generadas por Gemini™ llevan una marca de agua visible. Es una medida pensada por seguridad, pero en algunos escenarios creativos necesitas un lienzo completamente limpio.

## Reconstrucción sin pérdidas

Image Refinement usa un algoritmo de **mezcla alfa inversa** (Reverse Alpha Blending).

- **No es repintado con IA**: la eliminación tradicional de marcas de agua suele usar IA para difuminar la zona, lo que destruye los detalles de los píxeles.
- **Píxeles exactos**: usamos cálculos matemáticos para eliminar con precisión la capa transparente de la marca de agua y restaurar el 100 % de los píxeles originales.
- **Sin pérdida de calidad**: la imagen procesada es idéntica a la original en todas las zonas que no tienen marca de agua.

## Cómo usarla

Abre el popup de Voyager y busca **Opciones de Image Refinement**. Los dos interruptores están desactivados hasta que los actives:

- **Eliminar marca de agua al descargar** (recomendado): al hacer clic en el botón de descarga de Gemini, el archivo guardado no lleva marca de agua. Un pequeño distintivo 🍌 en el botón indica que está activo; el botón sigue siendo el de Gemini.
- **Eliminar marca de agua en la vista previa** (inestable): también limpia las imágenes que se muestran en pantalla. Es más lento, y una imagen puede parpadear brevemente mientras se procesa.

## La opción integrada de Gemini

Gemini está implantando su propio interruptor de marca de agua visible: **Configuración → Media watermark → Off**. Si tu cuenta lo tiene, úsalo y desactiva la eliminación de marca de agua de Voyager, porque la opción de Gemini es más fiable. Voyager muestra un aviso único sobre ello e indica cuándo tus imágenes recientes ya llegan sin marca de agua. Si todavía no encuentras el interruptor, sigue usando Voyager. En cualquier caso, los metadatos SynthID y C2PA se mantienen.

<div style="text-align: center; margin-top: 30px;">
  <img src="/assets/nanobanana.png" alt="Demostración de Image Refinement" style="border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); max-width: 100%;"/>
</div>

## Agradecimientos

Esta función se basa en el proyecto [gemini-watermark-remover](https://github.com/journey-ad/gemini-watermark-remover) de [journey-ad (Jad)](https://github.com/journey-ad), que es un port a JavaScript de la [implementación original en C++](https://github.com/allenk/GeminiWatermarkTool) de [allenk](https://github.com/allenk). Agradecemos su aportación a la comunidad. 🧡
Los avisos MIT de terceros que conservamos están disponibles en [THIRD_PARTY_NOTICES.md](https://github.com/voyager-crew/voyager/blob/main/THIRD_PARTY_NOTICES.md).

## Privacidad y seguridad

Todo el procesamiento se realiza **localmente en tu navegador**. Tus imágenes nunca se suben a servidores de terceros, lo que protege tu privacidad y tu trabajo creativo.
