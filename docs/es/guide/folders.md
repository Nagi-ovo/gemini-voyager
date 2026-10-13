# Carpetas bien hechas

¿Por qué cuesta tanto organizar los chats de IA?
Lo resolvimos. Creamos un sistema de archivos para tus pensamientos.

<div style="display: flex; gap: 20px; margin-top: 20px; flex-wrap: wrap; margin-bottom: 40px;">
  <div style="flex: 1; min-width: 300px; text-align: center;">
    <p><b>Gemini™</b></p>
    <img src="/assets/gemini-folders.png" alt="Carpetas de Gemini" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>
  </div>
  <div style="flex: 1; min-width: 300px; text-align: center;">
    <p><b>AI Studio</b></p>
    <img src="/assets/aistudio-folders.png" alt="Carpetas de AI Studio" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>
  </div>
</div>

## La física de la organización

Simplemente se siente bien.

- **Arrastrar y soltar**: Toma un chat, suéltalo en una carpeta. Es táctil.
- **Jerarquía anidada**: Los proyectos tienen subproyectos. Crea carpetas dentro de carpetas. Estructúralo a _tu_ manera.
- **Espaciado de carpetas**: Ajusta la densidad vertical, de compacta a espaciosa.
  > _Nota: en Safari para Mac, los ajustes pueden no verse en tiempo real; recarga la página para ver el efecto._
- **Sincronización entre dispositivos**: Organiza en tu escritorio y usa la [Sincronización en la nube](/es/guide/cloud-sync) para ver las mismas carpetas en tu portátil.

## Consejos útiles

- **Selección múltiple**: Mantén pulsado un chat para entrar en el modo de selección múltiple. Elige varios chats y muévelos todos a la vez.
- **Renombrar**: Haz doble clic en cualquier carpeta para renombrarla.
- **Iconos**: Detectamos automáticamente el tipo de Gem (programación, creativo, etc.) y asignamos el icono adecuado. No tienes que hacer nada.

## Diferencias de funciones según la plataforma

### Funciones comunes

- **Gestión básica**: Arrastrar y soltar, renombrar, selección múltiple.
- **Reconocimiento inteligente**: Detecta automáticamente el tipo de chat y asigna iconos.
- **Jerarquía anidada**: Compatible con carpetas dentro de carpetas.
- **Sincronización en la nube**: Haz copias de seguridad y sincroniza la estructura de carpetas con la [Sincronización en la nube](/es/guide/cloud-sync).

#### Ocultar conversaciones archivadas

Una vez que un chat está archivado en una carpeta, ya está "resuelto", pero por defecto sigue ocupando espacio en la lista principal. Activa **Ocultar conversaciones archivadas** en el popup de la extensión → **Opciones de Carpetas**, y la lista principal mostrará solo lo que sigue activo. Una bandeja de entrada a cero de verdad para tus chats de IA.

- La primera vez que archivas una conversación en una carpeta, Voyager muestra en el área de carpetas una pequeña tarjeta con la que puedes activar esta opción con un clic. Si la descartas, no volverá a molestarte.
- Las conversaciones archivadas **nunca se eliminan**: siguen accesibles dentro de sus carpetas.
- En AI Studio, las conversaciones archivadas se ocultan de la tabla de la Library. Gemini y AI Studio tienen cada uno su propio ajuste.
- Puedes cambiarlo en cualquier momento desde el popup.

### Exclusivo de Gemini

#### Colores personalizados

Haz clic en el icono de la carpeta para cambiar su color. Elige entre 7 colores predeterminados o usa el selector de color para escoger cualquier otro.

<img src="/assets/folder-color.png" alt="Colores de carpeta" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>

#### Aislamiento de cuentas

El icono de persona muestra temporalmente solo los chats de la cuenta de Google actual, y está desactivado por defecto. El **Hard Isolation** de las opciones de carpetas va más allá y separa los datos de carpetas y de sincronización en la nube por cuenta. Cuando Hard Isolation está activado, el filtro de persona es redundante y se oculta automáticamente.

<img src="/assets/current-user-only.png" alt="Aislamiento de cuentas" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>

#### Organización automática con IA

¿Demasiados chats y pereza para ordenarlos? Deja que Gemini lo piense por ti.

Con un clic copias la estructura actual de tus conversaciones, la pegas en Gemini y se genera un plan de carpetas listo para importar: organización instantánea.

**Paso 1: copia la estructura de tus conversaciones**

En la parte inferior de la sección de carpetas del popup de la extensión, haz clic en el botón **Organizar con IA**. Reúne automáticamente todas tus conversaciones sin archivar y la estructura de carpetas existente, genera un prompt y lo copia al portapapeles.

<img src="/assets/ai-auto-folder.png" alt="Botón Organizar con IA" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px;"/>

**Paso 2: deja que Gemini lo ordene**

Pega el contenido del portapapeles en una conversación de Gemini. Analizará los títulos de tus chats y generará un plan de carpetas en JSON.

**Paso 3: importa el resultado**

Haz clic en **Importar carpetas** en el menú del panel de carpetas, selecciona **O pegar JSON directamente**, pega el JSON que devolvió Gemini y haz clic en **Importar**.

<div style="display: flex; gap: 16px; margin-top: 12px; flex-wrap: wrap; margin-bottom: 24px;">
  <div style="text-align: center;">
    <img src="/assets/ai-auto-folder-2.png" alt="Menú de importación" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 240px;"/>
  </div>
  <div style="text-align: center;">
    <img src="/assets/ai-auto-folder-3.png" alt="Importar JSON pegado" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px;"/>
  </div>
</div>

- **Fusión incremental**: Usa la estrategia "Fusionar" por defecto: solo añade carpetas y asignaciones nuevas, y nunca destruye tu organización existente.
- **Multilingüe**: El prompt usa automáticamente el idioma que tengas configurado, y los nombres de las carpetas también se generan en ese idioma.

#### Carpeta como proyecto

¿Quieres que los chats nuevos empiecen con un preajuste de proyecto ligero? Convierte cualquier carpeta en uno.
La idea se inspira en Claude Projects, pero Voyager la implementa como un modelo más ligero: instrucciones para el primer mensaje basadas en la carpeta, más archivado automático, y no un espacio de trabajo con contexto compartido.

1. Activa **Habilitar Carpeta como Proyecto** en el popup de la extensión.
2. Haz clic derecho sobre una carpeta y elige **Establecer instrucciones** o **Editar instrucciones**.
3. Abre un chat nuevo de Gemini, usa el selector de carpetas junto al cuadro de escritura y elige esa carpeta.
4. Envía tu primer mensaje.

Lo que ocurre después:

- La conversación se archiva automáticamente en esa carpeta tras el primer envío.
- Si la carpeta tiene instrucciones, Voyager solo las antepone en ese primer envío.
- Si la carpeta no tiene instrucciones, sigue sirviendo como atajo rápido para archivar.
- Los chats de la misma carpeta **no** comparten memoria ni leen automáticamente los demás.
- El autoguardado de borradores conserva solo el texto que escribiste; las instrucciones ocultas no vuelven al cuadro de escritura.

### Exclusivo de AI Studio

- **Ajuste de la barra lateral**: arrastra para cambiar el ancho de la barra lateral.
- **Integración con Library**: arrastra directamente desde tu Library hasta las carpetas.

### ChatGPT

Las carpetas también llegan a ChatGPT como plugin integrado. Obtienes una sección de carpetas en la barra lateral de ChatGPT, además del mismo panel flotante. Archiva una conversación con **Mover a carpeta** en su menú, o arrastra su fila sobre una carpeta. La importación, la exportación y la vista de actividad también funcionan allí. Actívalo o desactívalo desde la sección **Complementos** del popup.
