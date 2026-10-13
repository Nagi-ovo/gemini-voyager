# Guía para contribuir plugins

El sistema de plugins de Voyager se basa en plugins declarativos: describes los metadatos del plugin y las operaciones DOM en `plugin.json`, y los cambios visuales en CSS. Los plugins no ejecutan JavaScript remoto; el motor de plugins integrado de Voyager interpreta el manifest y los estilos.

Así los plugins son más fáciles de revisar y mantener. Si quieres contribuir un plugin, empieza por aquí.

## Solo para ti: plugins locales

Un plugin que solo necesitas en tu propio navegador no pasa por este proceso. Créalo como plugin local e impórtalo en el popup: sin Issue, sin PR, sin clonar el repositorio. [Escribe tu propio plugin](./write-a-plugin.md) explica las tres formas de crear uno, incluido el comprobador `create-voyager-plugin` y la skill para agentes de programación.

## Ruta recomendada

1. Confirma que la idea encaja como plugin: el ancho de lectura, los ajustes de diseño, los retoques de tema, ocultar o marcar elementos de la página y las adaptaciones sencillas de sitios suelen ser buenos candidatos.
2. Abre primero una Issue en el repositorio de Voyager. Explica el problema, el sitio de destino y en qué se diferencia de los plugins existentes; espera la aprobación explícita de un mantenedor antes de programar o abrir una PR.
3. Usa `plugin.json` para los metadatos, las coincidencias de sitio, los ajustes y las contribuciones.
4. Pon los estilos en `style.css` dentro del mismo directorio del plugin y referencíalo desde `contributes.styles`.
5. Prueba en local e incluye en la PR páginas de prueba, capturas o una grabación corta. Los mantenedores decidirán si el plugin está listo para el catálogo oficial.

## Estructura de directorios

Los plugins oficiales incluidos viven en `src/features/plugins/catalog/`, con un directorio por plataforma:

```
src/features/plugins/catalog/
  marketplace.json                        índice que lee la tienda de plugins de la documentación
  sites/<site>/site.json                  el adaptador del sitio, como datos
  sites/<site>/plugins/<id>/plugin.json   un plugin declarativo
  sites/<site>/plugins/<id>/style.css     sus estilos
  sites/<site>/plugins/<id>/README.md     qué arregla y por qué
```

El descubrimiento es automático: `catalog/sites/index.ts` encuentra cada `site.json` y cada `plugin.json` con `import.meta.glob`, así que añadir un sitio o un plugin consiste en añadir archivos. No hay ninguna tabla de asignación que editar.

`marketplace.json` no es esa tabla. Es solo el índice que lee la tienda de plugins de la documentación, y un test lo mantiene sincronizado con el descubrimiento, así que un plugin nuevo también necesita una entrada allí. Su `source` es la ruta relativa al catálogo, por ejemplo `sites/deepseek/plugins/reading-width/plugin.json`. Los plugins de `sites/gemini/` y `sites/aistudio/` son la excepción: van incluidos dentro de Voyager y no aparecen en `marketplace.json`.

Los `matches` de un plugin deben quedar dentro de los `matches` del sitio en el que vive. Un plugin que sale de su propio sitio hace fallar la compilación.

## Claves de selector semántico

`site.json` asigna un vocabulario fijo de claves semánticas a selectores CSS específicos de cada sitio. El vocabulario está definido en `src/features/plugins/sites/semanticKeys.ts`: un `site.json` solo puede usar claves de esa lista, y una clave desconocida se rechaza.

- `userTurn`: el contenedor de un mensaje del usuario.
- `assistantTurn`: el contenedor de un mensaje del asistente.
- `thinkingBlock`: la sección de razonamiento dentro de un turno del asistente.
- `codeBlock`: un bloque de código ya renderizado.
- `composer`: el campo de entrada donde el usuario escribe el prompt.
- `sidebar`: la lista de conversaciones o la barra de navegación.
- `sidePanel`: un panel secundario, como los artefactos o el lienzo.
- `headerActions`: el grupo de acciones de la esquina superior derecha de la vista de conversación.
- `scrollContainer`: el elemento que desplaza la conversación.
- `composerRoot`: el contenedor que rodea el campo del prompt y sus botones de acción.
- `sendButton`: el botón que envía el prompt; algunos sitios solo lo muestran cuando el prompt no está vacío.

Un sitio solo declara las claves que realmente puede proporcionar. Un plugin usa una clave en lugar de un selector CSS sin procesar escribiendo `{ "kind": "semantic", "key": "userTurn" }` como `target` de una operación DOM, de modo que un rediseño del sitio se arregla editando un único archivo `site.json`.

`conversationIdPattern` es un campo independiente de `site.json`, no un selector: es una expresión regular sobre la ruta de la URL cuyo primer grupo de captura es el id de la conversación, por ejemplo `^/chat/([^/?#]+)`.

## Añadir una nueva plataforma

Añadir un nuevo sitio de chat tiene dos capas separadas:

1. El **adaptador del sitio**, `catalog/sites/<site>/site.json`, enseña a Voyager a reconocer el sitio y a encontrar sus turnos de usuario, turnos del asistente, campo de entrada, barra lateral y marcadores de tema.
2. Un **plugin** en `catalog/sites/<site>/plugins/<id>/` resuelve un problema concreto del usuario en ese sitio, como el ancho de lectura o un arreglo de renderizado.

Un `site.json` contiene `id` (igual al nombre de su directorio), `label`, `matches`, `selectors`, `theme`, `brandColor`, `capabilities` y, de forma opcional, `conversationIdPattern` y `turnKeyAttributes`. `turnKeyAttributes` indica los atributos que mantienen la identidad de un mensaje del usuario cuando la página lo vuelve a renderizar; el seguimiento de envíos (que usan la actividad de las carpetas y las marcas de tiempo de la línea de tiempo) solo se ejecuta en un sitio que define este campo, junto con `composer`, `userTurn` y `conversationIdPattern`. `validateSiteAdapterData` en `src/features/plugins/sites/siteAdapterData.ts` lo valida, y `bun run catalog:build` valida todos los sitios y plugins antes de publicarlos.

Cada plataforma de plugins es datos. Hoy los sitios son ChatGPT, Claude y DeepSeek. Gemini y AI Studio son superficies nativas de Voyager con su propio `site.json` (`catalog/sites/gemini/` y `catalog/sites/aistudio/`), pero se incluyen dentro del paquete y nunca se publican en el catálogo remoto. Los cinco adaptadores, `adapters/gemini.ts`, `aistudio.ts`, `claude.ts`, `chatgpt.ts` y `deepseek.ts`, son envoltorios de una línea sobre su `site.json`: edita el JSON, no el TypeScript.

El catálogo publicado por host también contiene los datos del sitio, así que una corrección de selectores en `site.json` puede llegar a los usuarios sin publicar una versión de la extensión. Un sitio totalmente nuevo sí necesita un cambio en el paquete, porque también necesita el permiso de host y el registro del content script, que se distribuyen dentro del paquete.

Para una nueva plataforma como DeepSeek, limita el trabajo del adaptador al contrato de la plataforma. Incluye el `site.json`, los tests de selectores necesarios y la documentación mínima que explique el soporte, todo en un único cambio completo. El registro de sitios detecta el nuevo adaptador desde el propio archivo, así que no hay ninguna lista de registro que editar. No añadas un sitio nuevo para cada plugin.

Una vez aceptado el adaptador, los plugins posteriores pueden enviarse como cambios separados y centrados. Si varios cambios dependen unos de otros, una cadena de PR apiladas resulta útil: cada rama posterior parte de la anterior y cada PR muestra solo su propia funcionalidad incremental. La cadena debe seguir igualmente la regla de alcance: un objetivo claro para el usuario por PR, con sus tests y su limpieza necesarios.

El soporte de un sitio no requiere una integración con una API de modelos. No añadas content scripts estáticos ni permisos de host obligatorios para una nueva plataforma; usa el flujo existente de permisos opcionales y registro dinámico para los sitios que solo tienen plugin.

El flujo de permisos opcionales y registro dinámico depende de la versión del navegador. Chrome y Edge soportan el flujo que usa la extensión. Firefox requiere la versión 128 o posterior para los permisos de host opcionales, y Safari requiere la versión 16.4 o posterior para el registro dinámico de content scripts. En versiones de navegador soportadas más antiguas, el popup puede negarse correctamente a activar un plugin en un sitio personalizado porque las APIs necesarias no pueden conservar un permiso de forma persistente; no lo soluciones añadiendo un permiso de host estático y amplio sin la aprobación de un mantenedor.

## Alcance del plugin

Los plugins deben delimitarse por el problema del usuario que resuelven, no dividirse mecánicamente por plataforma.

Un plugin del catálogo vive en una única carpeta de sitio, y todos sus `matches` deben estar cubiertos por el `site.json` de esa carpeta (si no, `bun run plugin:check` falla). Por eso un mismo plugin no puede cubrir Claude y ChatGPT a la vez. Cuando una misma función encaja en varias plataformas, como el ancho de lectura, la navegación por la página o el diseño de los bloques de código, publica un plugin por cada carpeta de sitio (por ejemplo `sites/claude/plugins/reading-width` y `sites/chatgpt/plugins/reading-width`) y mantén sus nombres, ajustes y descripciones coherentes.

Si cada plataforma necesita ajustes, lógica DOM o textos para el usuario muy distintos, es más claro separar los plugins. No metas comportamientos sin relación en un solo plugin solo para que "cubra todo"; un plugin debe resolver un problema claro.

Regla rápida:

- Mismo objetivo para el usuario, mismos ajustes y solo cambian los selectores: un plugin por carpeta de sitio, con nombres y ajustes coherentes.
- Mismo tema, pero el comportamiento de cada plataforma es muy distinto: sepáralos, manteniendo nombres y descripciones relacionados.
- Objetivos distintos: no los combines.

## Evitar plugins duplicados

Antes de enviar, revisa la tienda de plugins y los plugins oficiales existentes. Si ya hay un buen plugin, mejóralo en lugar de crear uno parecido.

Un duplicado solo merece aceptarse si aporta una mejora clara, por ejemplo:

- Da soporte a una plataforma importante que el plugin original no cubre.
- Corrige un problema de compatibilidad que el original no puede resolver.
- Tiene un rendimiento, una accesibilidad o un mantenimiento claramente mejores.
- Ofrece una experiencia de usuario distinta y significativa, no solo un plugin renombrado o con un estilo ligeramente cambiado.

Así la tienda se mantiene limpia y los usuarios pueden elegir mejor.

## Ejemplo mínimo

Empieza desde la plantilla en lugar de un directorio vacío: `bun run plugin:new <id-segment> --site <site>` crea `catalog/sites/<site>/plugins/<id-segment>/` con un `plugin.json`, un `style.css` y un `README.md`, y añade la entrada en `marketplace.json` por ti. Lo que genera es un punto de partida, no una aprobación. El manifest que rellenes tiene esta forma:

```json
{
  "$schema": "https://voyager.nagi.fun/plugin.schema.json",
  "id": "your-name.example-plugin",
  "name": "Example Plugin",
  "version": "1.0.0",
  "description": "A short description of what this plugin improves.",
  "author": "your-name",
  "category": "readability",
  "license": "MIT",
  "engine": ">=1.0.0",
  "tier": "declarative",
  "matches": ["https://claude.ai/*"],
  "contributes": {
    "styles": [{ "file": "style.css" }],
    "domOps": [
      {
        "op": "addClass",
        "target": "body",
        "className": "gv-plugin-example"
      }
    ]
  }
}
```

La línea `$schema` es opcional y solo sirve a tu editor: apunta al JSON Schema del manifest, para que el archivo se valide y se complete mientras escribes. Un `site.json` tiene su propio esquema en `https://voyager.nagi.fun/site.schema.json`.

`style.css` puede usar CSS normal, pero los estilos del plugin deben ir bajo tu propia clase `gv-plugin-*`:

```css
.gv-plugin-example .some-target {
  max-width: 880px;
}
```

## Notas sobre el manifest

- Usa un prefijo de autor o un nombre de dominio invertido para `id`, como `your-name.reading-width`, para evitar colisiones.
- Mantén `matches` estrecho. Solo debe coincidir con los sitios donde el plugin realmente necesita ejecutarse.
- Un plugin solo puede listar varios hosts en `matches` si el `site.json` de su sitio los cubre todos (por ejemplo chatgpt.com y chat.openai.com); para cubrir otro sitio, añade un plugin en la carpeta de ese sitio.
- Valores recomendados para `category`: `render-fix`, `theme`, `layout`, `readability`, `productivity`, `integration` u `other`.
- Pon en `engine` la versión del motor de plugins que necesitas. Los plugins oficiales sirven de ejemplo.
- Añade `i18n` para chino, inglés y otros idiomas habituales cuando sea posible.

## Límites de CSS y recursos

Los plugins declarativos se validan como entrada no confiable, así que mantén los recursos autocontenidos:

- No uses `@import`.
- No hagas referencia a imágenes remotas, fuentes externas ni CSS remoto.
- Puedes usar CSS normal, propiedades personalizadas y las sustituciones de valores de ajustes de Voyager.
- Usa el prefijo `gv-plugin-` en las clases para que los estilos no se filtren al sitio anfitrión ni a Voyager.

Si tu plugin necesita ajustes, empieza, si es posible, con ajustes numéricos. Por ejemplo, un plugin de ancho de lectura puede escribir un valor de ajuste en una variable CSS y dejar que CSS lo use.

## Límites de las operaciones DOM

Los plugins declarativos admiten actualmente:

- `addClass`: añade una clase a los elementos objetivo.
- `setAttribute`: establece un atributo.
- `setStyle`: establece estilos en línea o variables CSS. Termina el valor con `!important` para aplicarlo con esa prioridad; las versiones antiguas de Voyager descartan ese valor, así que pon `engine` en `>=next` si tu plugin lo necesita. Los atajos como `margin` se registran propiedad por propiedad, de modo que desactivar un plugin nunca borra el `margin-top` de otro plugin.
- `hide`: oculta elementos objetivo.

El objetivo puede ser un selector CSS o una de las claves semánticas de la lista anterior, escrita como `{ "kind": "semantic", "key": "userTurn" }`. Las claves semánticas suelen ser más estables, pero requieren que el adaptador del sitio actual declare esa clave.

Las operaciones declarativas deben ser reversibles y seguras de ejecutar varias veces. No dependas de un estado puntual de la página ni des por hecho que el DOM de la página nunca cambia.

### Primitivas

Algunos comportamientos no se pueden describir con CSS ni con una edición reversible del DOM. Una primitiva es código de primera parte que se incluye dentro de Voyager y que un manifest puede invocar por nombre mediante la operación `native`:

```json
{
  "engine": ">=1.3.0",
  "requires": { "handlers": ["formulaCopy"] },
  "contributes": {
    "domOps": [{ "op": "native", "handler": "formulaCopy", "params": {} }]
  }
}
```

El manifest elige una primitiva y la configura. Nunca aporta lógica, y `params` lo valida la propia primitiva antes de ejecutarse.

Dos reglas se aplican a cualquier plugin que use una primitiva:

- Cada sitio que cubre el plugin debe declarar las claves semánticas que lee la primitiva (`mermaid`, por ejemplo, lee `assistantTurn` y `codeBlock`). `requires.handlers` es opcional: la operación `native` ya implica su primitiva.
- `engine` debe ser al menos la versión del motor que introdujo la primitiva. `formulaCopy` se publicó en el motor 1.3.0, así que un plugin que la use declara `">=1.3.0"`. Un rango menor hace fallar `bun run catalog:build`, porque una versión antigua de Voyager informaría de un handler que falta en lugar de pedir al usuario que actualice.

Las primitivas solo crecen: un parámetro nuevo siempre es opcional, y un cambio incompatible se publica con un nombre nuevo.

Un plugin que cambie de comportamiento también puede incluir un `changelog` de una línea, que el popup muestra junto a la versión. Tradúcelo en `i18n.<locale>.changelog`, junto a `name` y `description`.

## Cuándo no usar un plugin normal

Si una función debe ejecutar JavaScript, interceptar peticiones de red, leer o escribir datos internos de Voyager, o depender de lógica compleja en tiempo de ejecución, no encaja en un plugin declarativo normal.

Abre primero una Issue y describe la necesidad. Si de verdad requiere una capacidad integrada, podemos valorar implementarla en el repositorio de Voyager como plugin builtin/native, igual que Formula Copy.

## Antes de abrir una PR

Ejecuta `bun run plugin:check <directorio del plugin>` y pega su salida en la PR. Informa de todos los problemas a la vez, desde el manifest y el CSS hasta la contención en el sitio, las primitivas, las claves semánticas, los diez idiomas y el README. CI ejecuta la misma comprobación sobre todos los plugins incluidos.

- El plugin viene desactivado por defecto y los usuarios lo activan ellos mismos.
- Has comprobado que no existe un plugin casi idéntico; si existe, mejora primero ese plugin.
- Has probado el sitio de destino con el tema claro y con el oscuro.
- `matches` no cubre sitios sin relación.
- No hay recursos remotos.
- El directorio del plugin incluye `plugin.json`, los archivos CSS necesarios y un README breve.
- En el caso de un plugin oficial, el directorio está en `catalog/sites/<site>/plugins/<id>/`, sus `matches` quedan dentro de los del sitio y `catalog/marketplace.json` lo lista (salvo los plugins de Gemini y AI Studio, que se incluyen con Voyager).
- La PR describe las páginas de prueba, las capturas o grabaciones y las zonas de la página afectadas.

Mantenlo simple, enfocado y reversible. Un plugin que resuelve un problema claro es mucho más fácil de fusionar y mantener.
