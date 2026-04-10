# Carpetas bien hechas

¿Por qué es tan difícil organizar los chats de IA?
Lo hemos solucionado. Hemos construido un sistema de archivos para tus pensamientos.

<div style="display: flex; gap: 20px; margin-top: 20px; flex-wrap: wrap; margin-bottom: 40px;">
  <div style="flex: 1; min-width: 300px; text-align: center;">
    <p><b>Gemini™</b></p>
    <img src="/assets/gemini-folders.png" alt="Carpetas Gemini" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>
  </div>
  <div style="flex: 1; min-width: 300px; text-align: center;">
    <p><b>AI Studio</b></p>
    <img src="/assets/aistudio-folders.png" alt="Carpetas AI Studio" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>
  </div>
</div>

## La física de la organización

Simplemente se siente bien.

- **Arrastrar y soltar**: Toma un chat. Suéltalo en una carpeta. Es táctil.
- **Jerarquía anidada**: Los proyectos tienen subproyectos. Crea carpetas dentro de carpetas. Estructúralo a _tu_ manera.
- **Espaciado de carpetas**: Ajusta la densidad de la barra lateral, de compacto a espacioso.
  > _Nota: En Mac Safari, es posible que los ajustes no sean en tiempo real; actualiza la página para ver el efecto._
- **Sincronización instantánea**: Organiza en tu escritorio. Míralo en tu portátil.

## Consejos profesionales

- **Selección Múltiple**: Mantén presionado un elemento de chat para entrar en modo de selección múltiple, opera en lote, listo de una vez.
- **Renombrar**: Doble clic en la carpeta, cámbialo directamente.
- **Reconocimiento**: Código, escritura, charla... Identificamos automáticamente el tipo de Gema y asignamos un icono. Tú solo úsalo, déjanos el resto a nosotros.

## Diferencias de características por plataforma

### Funciones comunes

- **Gestión básica**: Arrastrar y soltar, renombrar, selección múltiple.
- **Reconocimiento inteligente**: Detecta automáticamente tipos de chat y asigna iconos.
- **Jerarquía anidada**: Soporte para anidamiento de carpetas.
- **Adaptación para AI Studio**: Las funciones avanzadas estarán disponibles pronto en AI Studio.
- **Sincronización con Google Drive**: Sincroniza la estructura de carpetas con Google Drive.

### Exclusivo de Gemini

#### Colores personalizados

Haz clic en el icono de la carpeta para personalizar su color. Elige entre 7 colores predeterminados o usa el selector de colores para elegir cualquier color.

<img src="/assets/folder-color.png" alt="Colores de carpeta" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>

#### Aislamiento de cuenta

Haz clic en el icono "persona" en el encabezado para filtrar instantáneamente los chats de otras cuentas de Google. Mantén tu espacio de trabajo limpio cuando uses varias cuentas.

<img src="/assets/current-user-only.png" alt="Aislamiento de cuenta" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>

#### Organización automática con IA

Demasiados chats, demasiada pereza para ordenar? Deja que Gemini piense por ti.

Un clic copia tu estructura de conversaciones actual, pégalo en Gemini, y genera un plan de carpetas listo para importar — organización instantánea.

**Paso 1: Copia tu estructura de conversaciones**

En la parte inferior de la sección de carpetas del popup de la extensión, haz clic en el botón **AI Organize**. Recopila automáticamente todas tus conversaciones sin clasificar y la estructura de carpetas existente, genera un prompt y lo copia al portapapeles.

<img src="/assets/ai-auto-folder.png" alt="AI Organize Button" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px;"/>

**Paso 2: Deja que Gemini lo ordene**

Pega el contenido del portapapeles en una conversación de Gemini. Analizará los títulos de tus chats y generará un plan de carpetas en JSON.

**Paso 3: Importa los resultados**

Haz clic en **Importar carpetas** desde el menú del panel de carpetas, selecciona **O pegar JSON directamente**, pega el JSON que devolvió Gemini y haz clic en **Importar**.

<div style="display: flex; gap: 16px; margin-top: 12px; flex-wrap: wrap; margin-bottom: 24px;">
  <div style="text-align: center;">
    <img src="/assets/ai-auto-folder-2.png" alt="Import Menu" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 240px;"/>
  </div>
  <div style="text-align: center;">
    <img src="/assets/ai-auto-folder-3.png" alt="Paste JSON Import" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px;"/>
  </div>
</div>

- **Fusión incremental**: Usa la estrategia de "Fusionar" por defecto — solo agrega nuevas carpetas y asignaciones, nunca destruye tu organización existente.
- **Multilingüe**: El prompt usa automáticamente tu idioma configurado, y los nombres de carpetas también se generan en ese idioma.

#### Carpeta como Proyecto

¿Quieres que los chats nuevos arranquen con un pequeño preset de proyecto? Convierte cualquier carpeta en uno.
La idea está inspirada en Claude Projects, pero Voyager la implementa de forma más ligera: instrucciones para el primer mensaje basadas en carpetas y archivado automático, no un espacio de trabajo con contexto compartido.

1. Activa `Habilitar Carpeta como Proyecto` en el popup de la extensión.
2. Haz clic derecho sobre una carpeta y elige `Establecer instrucciones` o `Editar instrucciones`.
3. Abre un chat nuevo de Gemini, usa el selector de carpetas junto al cuadro de escritura y elige esa carpeta.
4. Envía tu primer mensaje.

Qué ocurre después:

- La conversación se guarda automáticamente en esa carpeta tras el primer envío.
- Si la carpeta tiene instrucciones, Voyager las antepone solo en ese primer envío.
- Si la carpeta no tiene instrucciones, igualmente sirve como atajo rápido de archivado.
- Los chats de la misma carpeta **no** comparten memoria ni leen automáticamente el contenido de los otros.
- El auto-guardado de borradores conserva solo el texto que escribiste; las instrucciones ocultas no vuelven al cuadro de entrada.

### Exclusivo de AI Studio

- **Ajuste de barra lateral**: Arrastra para cambiar el ancho de la barra lateral.
- **Integración con Library**: Arrastra directamente desde tu Library a las carpetas.
