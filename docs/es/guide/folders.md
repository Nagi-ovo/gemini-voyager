# Carpetas

Guarda tus conversaciones en carpetas de la barra lateral: arrastra una a una carpeta y queda archivada, anida carpetas hasta tres niveles y recupera las mismas en otro ordenador.

<SiteSupport feature="folders" :labels="{ folders: 'Carpetas en la barra lateral', 'hide-filed': 'Ocultar conversaciones archivadas', activity: 'Vista Activity', 'account-isolation': 'Aislamiento de cuentas', projects: 'Carpetas como proyectos', 'ai-organize': 'Organizar con IA' }" />

Solo en algunos sitios:

- **Mover a carpeta** en el menú de conversación del propio sitio: Gemini, ChatGPT, Claude
- Arrastrar desde la tabla de Library a una carpeta: AI Studio
- Iconos de conversación según el tipo de Gem: Gemini

Un ✓ con círculo funciona nada más instalar Voyager. En los demás sitios, abre la ventana de Voyager en ese sitio y activa las carpetas en la zona **Complementos**; la primera vez te pide acceso al sitio.

## Dónde está

La sección de carpetas está encima de la lista de conversaciones, en la barra lateral. Con la barra lateral cerrada, las mismas carpetas siguen disponibles en un panel flotante.

<img src="/assets/gemini-folders.png" alt="La sección de carpetas en la barra lateral" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 320px;"/>

## Archivar una conversación

- **Arrastrar**: arrastra una conversación de la barra lateral sobre una carpeta.
- **Menú de la conversación**: en los sitios que lo admiten, abre el menú de la conversación y elige **Mover a carpeta**.
- **Conversación actual**: haz clic derecho en una carpeta y elige **Añadir la conversación actual aquí**.
- **Selección múltiple**: mantén pulsada una conversación dentro de una carpeta para seleccionar varias y moverlas a la vez. La barra lateral de AI Studio todavía no admite selección múltiple.

## Anidar, renombrar y colorear

<img src="/assets/folders-nested-en.png" alt="Carpetas anidadas en tres niveles" width="240" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>

- Las carpetas llegan a tres niveles: una carpeta de primer nivel puede tener dos niveles más de subcarpetas.
- Haz doble clic en el nombre de una carpeta para renombrarla.
- Con clic derecho en una carpeta puedes fijarla, crear una subcarpeta, renombrarla, eliminarla o elegir uno de 7 colores.

<img src="/assets/folders-menu-en.png" alt="El menú contextual de una carpeta y sus colores" width="254" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>

El engranaje del encabezado de carpetas cambia el orden de las conversaciones (orden manual o abiertas recientemente) y ajusta el tamaño del texto, el espaciado de carpetas y la sangría de subcarpetas; el ajuste **Espaciado de carpetas** de la ventana también lo hace. En Safari para Mac quizá tengas que recargar la página para ver el cambio.

## Ocultar conversaciones archivadas

Cuando una conversación ya está en una carpeta, puedes sacarla de la lista principal para que solo queden las conversaciones en curso.

- En Gemini y AI Studio, abre la ventana → **Opciones de Carpetas** → **Ocultar conversaciones archivadas**. Cada sitio guarda su propio ajuste; en AI Studio se ocultan las filas de la tabla de Library.
- La primera vez que archivas una conversación, una tarjeta en la sección de carpetas te ofrece activarlo con un clic. Si eliges **Ahora no**, no vuelve a preguntar.
- En los demás sitios, el interruptor está en los ajustes del plugin de carpetas, en la zona **Complementos** de la ventana, y viene desactivado.
- No se borra nada: las conversaciones archivadas siguen en sus carpetas y puedes desactivarlo cuando quieras.

## Importar y exportar

<img src="/assets/folders-transfer-en.png" alt="Importar y exportar carpetas" width="190" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>

El icono de carpeta del encabezado tiene **Importar carpetas** y **Exportar carpetas**. Exportar guarda un archivo JSON; importar lo fusiona con tus carpetas actuales, así que lo que ya ordenaste se queda como está.

## Sincronización en la nube

Todos los sitios con carpetas pueden usar la [sincronización en la nube](/es/guide/cloud-sync) para tener las mismas carpetas en otro ordenador. Las carpetas de cada sitio se guardan y sincronizan por separado.

## Vista Activity

La campana del encabezado cambia el árbol por una vista Activity de solo lectura; púlsala otra vez para volver al árbol. Nunca mueve, copia ni reclasifica conversaciones.

- **Prioridad**: conversaciones con actividad real en las últimas 3 horas. Abrir o ver una conversación no cuenta.
- **Hoy, Ayer y días de la semana**: ordenadas por la última actividad real, con solo hoy y los cuatro días anteriores.
- La estrella es una marca manual aparte y no decide qué entra en Prioridad.
- Las conversaciones más antiguas, o sin hora conocida, no aparecen en Activity y siguen en sus carpetas.
- Cada entrada muestra su carpeta; una conversación que está en varias carpetas aparece una sola vez.

[Lee la guía completa de la vista Activity](/es/guide/activity-view)

## Aislamiento de cuentas

El botón con forma de persona de la barra lateral de Gemini muestra temporalmente solo las conversaciones de la cuenta de Google actual; viene desactivado. **Enable Hard Isolation**, en **Opciones de Carpetas** de la ventana, separa las carpetas y los datos de sincronización por cuenta; una vez activado, los datos ya están separados y el botón se oculta solo.

<img src="/assets/current-user-only.png" alt="El botón con forma de persona" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 200px;"/>

## Organizar con IA

¿Demasiadas conversaciones para ordenarlas a mano? Deja que Gemini proponga un plan de carpetas.

1. Abre la ventana en Gemini y haz clic en **Organizar con IA** al final de **Opciones de Carpetas**. Tus conversaciones sin archivar y la estructura actual de carpetas se copian como un prompt. El prompt usa tu idioma, igual que los nombres de las carpetas.
2. Pega el prompt en Gemini. Responde con un plan de carpetas en JSON.
3. Haz clic en **Importar carpetas** en el encabezado, elige **O pegar JSON directamente**, pégalo y haz clic en **Importar**. **Fusionar con carpetas existentes** es la opción por defecto: solo añade carpetas nuevas y nuevas asignaciones, sin tocar las que ya tienes.

<img src="/assets/ai-auto-folder.png" alt="El botón Organizar con IA en la ventana" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 320px;"/>

## Carpetas como proyectos

Dale a una carpeta instrucciones para el primer turno y una conversación nueva se archiva sola en ella tras su primer mensaje. La idea viene de Claude Projects, pero Voyager solo añade instrucciones del primer turno y archivado automático; no es un espacio de trabajo con contexto compartido.

1. Activa **Habilitar Carpeta como Proyecto** en la ventana.
2. Haz clic derecho en una carpeta y elige **Establecer instrucciones** o **Editar instrucciones**.
3. Abre una conversación nueva de Gemini y elige la carpeta en el selector junto al cuadro de texto.
4. Envía tu primer mensaje.

Después:

- Tras el primer envío, la conversación se archiva en esa carpeta.
- Si la carpeta tiene instrucciones, Voyager las añade solo a ese primer envío. Sin instrucciones, la carpeta sirve como atajo para archivar conversaciones nuevas.
- Las conversaciones de una misma carpeta **no** comparten memoria ni leen el contenido de las demás.
- El guardado automático del borrador solo conserva lo que escribiste, nunca las instrucciones ocultas.

Para el ancho de la barra lateral, consulta [Ancho de la barra lateral](/es/guide/sidebar).
