# Guía para contribuir plugins

El sistema de plugins de Voyager prioriza los plugins declarativos: `plugin.json` describe la información del plugin y las operaciones DOM, mientras que CSS describe los estilos. El plugin no ejecuta JavaScript remoto; el motor integrado de Voyager interpreta el manifest y los estilos.

Esto hace que los plugins sean más fáciles de revisar y mantener. Si quieres contribuir un plugin, empieza por este camino.

## Solo para ti: plugins locales

Un plugin que solo necesitas en tu propio navegador no pasa por este proceso. Créalo como plugin local e impórtalo en el popup: sin Issue, sin PR, sin clonar el repositorio. [Escribe tu propio plugin](./write-a-plugin.md) explica las tres formas de crear uno, incluido el comprobador `create-voyager-plugin` y la skill para agentes de programación.

## Ruta recomendada

1. Confirma primero que la idea encaja como plugin: ancho de lectura, arreglos de diseño, ajustes de tema, ocultar o marcar elementos de la página y adaptaciones simples de sitios suelen ser buenos casos.
2. Abre primero una Issue en el repositorio principal de Voyager. Explica el problema, el sitio objetivo y la diferencia con los plugins existentes; espera la aprobación explícita del mantenedor antes de programar o abrir una PR.
3. Usa `plugin.json` para los metadatos, sitios coincidentes, ajustes y contribuciones.
4. Coloca los estilos en `style.css` dentro del mismo directorio y referencia el archivo desde `contributes.styles`.
5. Prueba en local y adjunta páginas de prueba, capturas o una grabación breve en la PR. Los mantenedores decidirán si está listo para el catalog oficial.

## Estructura de directorios

Los plugins oficiales incluidos viven en `src/features/plugins/catalog/`, con un directorio por plataforma:

```
src/features/plugins/catalog/
  marketplace.json                        índice de plugins de sitio, mantenido a mano y verificado por un test
  sites/<site>/site.json                  el adaptador de sitio, como datos
  sites/<site>/plugins/<id>/plugin.json   un plugin declarativo
  sites/<site>/plugins/<id>/style.css     sus estilos
  sites/<site>/plugins/<id>/README.md     qué arregla y por qué
```

El descubrimiento es automático: `catalog/sites/index.ts` encuentra cada `site.json` y cada `plugin.json` con `import.meta.glob`, así que añadir un sitio o un plugin es añadir archivos. No hay tabla de mapeo que editar.

`marketplace.json` no es esa tabla: es solo un índice de los plugins de sitio que se mantiene a mano. Un test lo mantiene sincronizado con el descubrimiento, por lo que un plugin nuevo también necesita una entrada allí (`bun run plugin:new` la añade por ti). Su `source` es la ruta relativa al catalog, por ejemplo `sites/deepseek/plugins/reading-width/plugin.json`. Los plugins de `sites/gemini/` y `sites/aistudio/` son la excepción: van incluidos dentro de Voyager y no aparecen en `marketplace.json`. La página [Todos los plugins](/es/guide/plugins) de la documentación lee los manifests directamente del disco, no este archivo.

Los `matches` de un plugin deben quedar dentro de los `matches` de su sitio. Un plugin que se sale de ese ámbito hace fallar la compilación.

## Claves de selector semántico

`site.json` asigna un vocabulario fijo de claves semánticas a selectores CSS propios del sitio. El vocabulario está definido en `src/features/plugins/sites/semanticKeys.ts`; un `site.json` solo puede usar estas claves y cualquier clave desconocida se rechaza.

- `userTurn`: el contenedor de un mensaje del usuario.
- `assistantTurn`: el contenedor de un mensaje del asistente.
- `thinkingBlock`: la sección de razonamiento dentro de una respuesta.
- `codeBlock`: un bloque de código renderizado.
- `composer`: el campo donde se escribe el prompt.
- `sidebar`: la lista de conversaciones o el carril de navegación.
- `sidePanel`: un panel secundario, como artifacts o canvas.
- `headerActions`: el grupo de acciones arriba a la derecha de la conversación.
- `scrollContainer`: el elemento que desplaza la conversación.
- `composerRoot`: el contenedor del campo del prompt y sus botones de acción.
- `sendButton`: el botón que envía el prompt; algunos sitios solo lo muestran cuando el campo tiene texto.

Un sitio solo declara las claves que realmente puede ofrecer. Los plugins referencian una clave en lugar de un selector escribiendo `{ "kind": "semantic", "key": "userTurn" }` como `target` de una operación DOM, así un rediseño del sitio se arregla en un único `site.json`.

`conversationIdPattern` es un campo aparte de `site.json`, no un selector: una expresión regular sobre la ruta de la URL cuyo primer grupo de captura es el id de la conversación, por ejemplo `^/chat/([^/?#]+)`.

## Añadir una nueva plataforma

Añadir un nuevo sitio de chat tiene dos capas separadas:

1. El **adaptador del sitio**, `catalog/sites/<site>/site.json`, enseña a Voyager a reconocer el sitio y a encontrar sus turnos de usuario, turnos del asistente, campo de entrada, barra lateral y marcadores de tema.
2. Un **plugin** en `catalog/sites/<site>/plugins/<id>/` resuelve un problema concreto del usuario en ese sitio, como el ancho de lectura o un arreglo de renderizado.

Un `site.json` contiene `id` (igual al nombre de su directorio), `label`, `matches`, `selectors`, `theme`, `brandColor`, `capabilities` y, de forma opcional, `conversationIdPattern` y `turnKeyAttributes`. `turnKeyAttributes` indica los atributos que mantienen la identidad de un mensaje del usuario cuando la página lo vuelve a renderizar; el seguimiento de envíos (que usan la actividad de las carpetas y las marcas de tiempo de la línea de tiempo) solo se ejecuta en un sitio que define este campo, junto con `composer`, `userTurn` y `conversationIdPattern`. `validateSiteAdapterData` en `src/features/plugins/sites/siteAdapterData.ts` lo valida, y `bun run catalog:build` valida todos los sitios y plugins antes de publicarlos.

`site.json` es el propio adaptador de sitio escrito como datos. Hoy las plataformas son ChatGPT, Claude y DeepSeek. Gemini y AI Studio son superficies nativas de Voyager con su propio `site.json` (`catalog/sites/gemini/` y `catalog/sites/aistudio/`), pero va dentro del paquete y nunca se publica en el catálogo remoto; `sites/adapters/gemini.ts`, `aistudio.ts`, `claude.ts`, `chatgpt.ts` y `deepseek.ts` son cáscaras de una línea sobre su `site.json`: edita el JSON, no el TypeScript.

El catálogo publicado por host también transporta los datos del sitio, así que un arreglo de selectores llega a los usuarios sin publicar una versión nueva. Un sitio totalmente nuevo sí necesita un cambio en el paquete, porque también necesita el permiso de host y el registro del content script, que se distribuyen dentro del paquete.

Para una nueva plataforma como DeepSeek, limita el trabajo del adaptador al contrato de la plataforma. Incluye el `site.json`, los tests de selectores necesarios y la documentación mínima que explique el soporte, todo en un único cambio completo. El registro de sitios detecta el nuevo adaptador desde el propio archivo, así que no hay ninguna lista de registro que editar. No añadas un sitio nuevo para cada plugin.

Una vez aceptado el adaptador, los plugins posteriores pueden enviarse como cambios separados y centrados. Si varios cambios dependen unos de otros, una cadena de PR apiladas resulta útil: cada rama posterior parte de la anterior y cada PR muestra solo su propia funcionalidad incremental. La cadena debe seguir igualmente la regla de alcance: un objetivo claro para el usuario por PR, con sus tests y su limpieza necesarios.

El soporte de un sitio no requiere una integración con una API de modelos. No añadas content scripts estáticos ni permisos de host obligatorios para una nueva plataforma; usa el flujo existente de permisos opcionales y registro dinámico para los sitios que solo tienen plugin.

El flujo de permisos opcionales y registro dinámico depende de la versión del navegador. Chrome y Edge soportan el flujo que usa la extensión. Firefox requiere la versión 128 o posterior para los permisos de host opcionales, y Safari requiere la versión 16.4 o posterior para el registro dinámico de content scripts. En versiones de navegador soportadas más antiguas, el popup puede negarse correctamente a activar un plugin en un sitio personalizado porque las APIs necesarias no pueden conservar un permiso de forma persistente; no lo soluciones añadiendo un permiso de host estático y amplio sin la aprobación de un mantenedor.

## Alcance del plugin

El alcance debe seguir el problema del usuario, no dividirse mecánicamente por plataforma.

Un plugin del catálogo vive en la carpeta de un solo sitio y todos sus `matches` deben quedar cubiertos por el `site.json` de esa carpeta (si no, `bun run plugin:check` falla), así que un mismo plugin no puede cubrir Claude y ChatGPT a la vez. Si una función encaja en varias plataformas, como el ancho de lectura, la navegación de páginas o el diseño de bloques de código, publica un plugin por carpeta de sitio (por ejemplo `sites/claude/plugins/reading-width` y `sites/chatgpt/plugins/reading-width`) y mantén coherentes sus nombres, ajustes y descripciones.

Si cada plataforma necesita ajustes, lógica DOM o textos muy distintos, es más claro separarlo. No metas funciones no relacionadas en un solo plugin solo para que "lo cubra todo"; un plugin debería resolver un problema claro.

Regla rápida:

- Mismo objetivo del usuario, mismos ajustes, solo cambian los selectores: un plugin por carpeta de sitio, con nombres y ajustes coherentes.
- Mismo tema, pero la experiencia cambia mucho por plataforma: puedes separarlo manteniendo nombres y descripciones relacionados.
- Objetivos distintos: no los mezcles.

## Evitar plugins duplicados

Antes de enviar, revisa los plugins oficiales existentes en [Todos los plugins](/es/guide/plugins). Si ya hay un buen plugin, mejora ese plugin en vez de crear uno similar.

Un duplicado solo merece aceptarse si aporta una mejora clara, por ejemplo:

- Cubre una plataforma importante que el plugin original no soporta.
- Arregla un problema de compatibilidad que el original no puede resolver.
- Mejora claramente el rendimiento, la accesibilidad o el mantenimiento.
- Ofrece una experiencia de usuario distinta y útil, no solo otro nombre o pequeños cambios de estilo.

Así la lista de plugins se mantiene limpia y los usuarios pueden elegir mejor.

## Ejemplo mínimo

No empieces con un directorio vacío: `bun run plugin:new <id-segment> --site <site>` crea `catalog/sites/<site>/plugins/<id-segment>/` con un `plugin.json`, un `style.css` y un `README.md`, y añade la entrada correspondiente a `marketplace.json`. Lo que genera es un punto de partida, no una aprobación; el manifest que vas a completar tiene esta forma:

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

La línea `$schema` es opcional y solo sirve a tu editor: apunta al JSON Schema del manifest para que lo valide y lo complete mientras escribes. `site.json` tiene el suyo en `https://voyager.nagi.fun/site.schema.json`.

`style.css` puede escribirse como CSS normal, pero conviene mantener todos los estilos bajo tu propia clase `gv-plugin-*`:

```css
.gv-plugin-example .some-target {
  max-width: 880px;
}
```

## Notas del manifest

- Usa un prefijo de autor o estilo de dominio inverso para `id`, como `your-name.reading-width`, para evitar conflictos.
- Mantén `matches` limitado a los sitios donde el plugin realmente necesita ejecutarse.
- Un plugin puede listar varios hosts en `matches` solo si el `site.json` de su sitio los cubre todos (por ejemplo chatgpt.com y chat.openai.com); para cubrir otro sitio, añade un plugin en la carpeta de ese sitio.
- Valores recomendados para `category`: `render-fix`, `theme`, `layout`, `readability`, `productivity`, `integration` u `other`.
- Indica en `engine` la versión del motor de plugins que necesitas. Los plugins oficiales sirven como referencia.
- Añade `i18n` para chino, inglés y otros idiomas comunes cuando sea posible.

## Límites de CSS y recursos

Los plugins declarativos se validan como entrada no confiable, así que mantén los recursos autocontenidos:

- No uses `@import`.
- No referencies imágenes remotas, fuentes externas ni CSS remoto.
- Puedes usar CSS normal, propiedades personalizadas y sustituciones de valores de ajustes ofrecidas por Voyager.
- Usa el prefijo `gv-plugin-` en las clases para no contaminar el sitio anfitrión ni Voyager.

Si el plugin necesita ajustes, empieza preferiblemente con valores numéricos. Por ejemplo, un plugin de ancho de lectura puede escribir el valor en una variable CSS y consumirlo desde CSS.

## Límites de operaciones DOM

Los plugins declarativos soportan actualmente:

- `addClass`: añade una clase a los elementos objetivo.
- `setAttribute`: establece un atributo.
- `setStyle`: establece estilos inline o variables CSS. Termina el valor con `!important` para aplicarlo con esa prioridad; las versiones antiguas de Voyager descartan ese valor, así que pon `engine` en `>=1.9.0` si tu plugin lo necesita. Los atajos como `margin` se registran propiedad por propiedad, de modo que desactivar un plugin nunca borra el `margin-top` de otro plugin.
- `hide`: oculta elementos objetivo.

El objetivo puede ser un selector CSS o una de las claves semánticas listadas arriba, escrita como `{ "kind": "semantic", "key": "userTurn" }`. Las claves semánticas suelen ser más estables, pero el adaptador del sitio debe declarar esa clave.

Las operaciones declarativas deben ser reversibles y seguras al ejecutarse repetidamente. No dependas de un estado puntual de la página ni asumas que el DOM nunca cambia.

### Primitivas

Algunos comportamientos no se pueden describir con CSS y una edición reversible del DOM. Una primitiva es código propio que viaja dentro de Voyager y que un manifest puede invocar por nombre mediante la operación `native`:

```json
{
  "engine": ">=1.3.0",
  "requires": { "handlers": ["formulaCopy"] },
  "contributes": {
    "domOps": [{ "op": "native", "handler": "formulaCopy", "params": {} }]
  }
}
```

El manifest elige una primitiva y la configura; nunca aporta lógica, y la propia primitiva valida `params` antes de ejecutarse.

Se aplican dos reglas a cualquier plugin que use una:

- Cada sitio que cubre el plugin debe declarar las claves semánticas que lee la primitiva (`mermaid`, por ejemplo, lee `assistantTurn` y `codeBlock`). `requires.handlers` es opcional: la operación `native` ya implica su primitiva.
- `engine` debe ser al menos la versión del motor que la publicó por primera vez. `formulaCopy` llegó en el motor 1.3.0, así que un plugin que la use declara `">=1.3.0"`. Un rango menor hace fallar `bun run catalog:build`, porque una versión antigua de Voyager informaría de un handler ausente en vez de pedir al usuario que actualice.

Las primitivas solo crecen: un parámetro nuevo siempre es opcional y un cambio incompatible se publica con un nombre nuevo.

Un plugin que cambie de comportamiento también puede llevar un `changelog` de una línea, que el popup muestra junto a la versión. Tradúcelo en `i18n.<locale>.changelog`, junto a `name` y `description`.

## Cuándo no usar un plugin normal

Si la función debe ejecutar JavaScript, interceptar peticiones, leer o escribir datos internos de Voyager, o depender de lógica compleja en tiempo de ejecución, no encaja como plugin declarativo normal.

Abre primero una Issue y explica la necesidad. Si realmente requiere una capacidad integrada, podemos considerar implementarla en el repositorio de Voyager como plugin builtin/native, como Formula Copy.

## Antes de abrir una PR

Ejecuta `bun run plugin:check <directorio del plugin>` y pega su salida en la PR. Informa de todos los problemas a la vez: el manifest y el CSS, si `matches` se sale del sitio, las primitivas, las claves semánticas, los diez idiomas y el README; CI ejecuta la misma comprobación sobre todos los plugins incluidos.

- El plugin está desactivado por defecto y el usuario lo activa manualmente.
- Revisaste que no exista un plugin casi idéntico; si existe, prioriza mejorarlo.
- Probaste el sitio objetivo en tema claro y oscuro.
- `matches` no cubre sitios sin relación.
- No hay recursos remotos.
- El directorio del plugin contiene `plugin.json`, los CSS necesarios y un README breve.
- Si es un plugin oficial, el directorio está en `catalog/sites/<site>/plugins/<id>/`, sus `matches` quedan dentro de los del sitio y `catalog/marketplace.json` lo lista (salvo los plugins de Gemini y AI Studio, que se incluyen con Voyager).
- La PR describe páginas de prueba, capturas o grabaciones, y las zonas de página afectadas.

Manténlo simple, enfocado y reversible. Un plugin que resuelve un problema claro es mucho más fácil de fusionar y mantener.
