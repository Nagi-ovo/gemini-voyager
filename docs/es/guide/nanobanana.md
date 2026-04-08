# Opción NanoBanana

::: warning Compatibilidad de navegadores
Actualmente, la función **NanoBanana** **no es compatible con Safari** debido a las limitaciones de la API del navegador. Recomendamos usar **Chrome** o **Firefox** si necesita usar esta función.

Los usuarios de Safari pueden cargar manualmente sus imágenes descargadas en sitios de herramientas como [banana.ovo.re](https://banana.ovo.re/) para su procesamiento (aunque no se garantiza el éxito para todas las imágenes debido a las diferentes resoluciones).
:::

**Imágenes de IA, como deben ser: puras.**

Las imágenes generadas por Gemini™ vienen con una marca de agua visible por defecto. Aunque esto es por razones de seguridad, en ciertos escenarios creativos, puedes necesitar un borrador completamente limpio.

## Restauración Sin Pérdidas

NanoBanana utiliza un **Algoritmo de Mezcla Alfa Inversa (Reverse Alpha Blending)**.

- **Sin Repintado AI**: La eliminación de marcas de agua tradicional a menudo utiliza IA para difuminar, lo que puede destruir los detalles de la imagen.
- **Precisión a Nivel de Píxel**: A través del cálculo matemático, eliminamos con precisión la capa transparente de la marca de agua superpuesta en los píxeles, restaurando el 100% de los puntos de píxel originales.
- **Cero Pérdida de Calidad**: La imagen antes y después del procesamiento es completamente idéntica en las áreas sin marca de agua.

## Cómo Usar

1. **Habilitar Función**: Encuentra la "Opción NanoBanana" al final del panel de configuración de Voyager y activa "Eliminar marca de agua NanoBanana".
2. **Disparo Automático**: A partir de entonces, para cada imagen que generes, completaremos automáticamente el procesamiento de eliminación de marca de agua en segundo plano.
3. **Descarga Directa**:
   - Pasa el ratón sobre la imagen procesada y verás un botón 🍌.
   - **El botón 🍌 ha reemplazado completamente** al botón de descarga nativo, haz clic para descargar directamente la imagen 100% libre de marca de agua.

<div style="text-align: center; margin-top: 30px;">
  <img src="/assets/nanobanana.png" alt="Ejemplo NanoBanana" style="border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); max-width: 100%;"/>
</div>

## Agradecimientos Especiales

Esta función se basa en el proyecto [gemini-watermark-remover](https://github.com/journey-ad/gemini-watermark-remover) desarrollado por [journey-ad (Jad)](https://github.com/journey-ad). Este proyecto es una adaptación en JavaScript de la [versión C++ de GeminiWatermarkTool](https://github.com/allenk/GeminiWatermarkTool) desarrollada por [allenk](https://github.com/allenk). Gracias a los autores originales por su contribución a la comunidad de código abierto. 🧡
Los avisos MIT de terceros conservados están disponibles en [THIRD_PARTY_NOTICES.md](https://github.com/Nagi-ovo/gemini-voyager/blob/main/THIRD_PARTY_NOTICES.md).

## Privacidad y Seguridad

Todo el procesamiento de eliminación de marcas de agua se realiza **localmente en tu navegador**. Las imágenes no se suben a ningún servidor de terceros, protegiendo tu privacidad y seguridad creativa.
