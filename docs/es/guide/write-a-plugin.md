# Escribe tu propio plugin

Un plugin local es un plugin que haces para ti. Cambia el aspecto o la disposición de Gemini, AI Studio, ChatGPT, Claude o DeepSeek, vive solo en tu navegador y no necesita ninguna pull request ni una copia del código fuente de Voyager.

Como todos los plugins de Voyager, es declarativo: un manifest `plugin.json` más CSS. No ejecuta código propio. Voyager lo revisa al importarlo, aplica sus cambios y los retira todos cuando lo desactivas. Un plugin importado empieza desactivado, así que puedes revisarlo antes de encenderlo.

## Tres formas de crearlo

### Descríbelo y deja que cualquier IA lo escriba

1. Abre el sitio que quieres cambiar, abre el popup de Voyager y busca la tarjeta **Complementos locales** (en Gemini y AI Studio es la última entrada de los ajustes).
2. Elige **Describir un cambio**, escribe una frase («Haz mis mensajes más estrechos y oculta la barra lateral») y elige **Redactar el prompt**.
3. Copia tú mismo el prompt en el chat de IA que prefieras, pega de vuelta su respuesta completa y elige **Revisar respuesta**.
4. Voyager te explica con palabras sencillas qué cambia el plugin. Impórtalo y actívalo en la lista de plugins.

Voyager nunca envía el prompt a ningún sitio: tú eliges la IA y llevas el texto de un lado a otro.

### Pásaselo a un agente de código

Si usas un agente de código (Claude Code, Codex, Cursor y similares), dale la skill de plugins de Voyager:

```text
https://voyager.nagi.fun/skills/write-voyager-plugin/SKILL.md
```

En la tarjeta **Complementos locales**, abre **Describir un cambio** y encontrarás el botón **Copiar enlace de la skill**. La skill contiene el contrato completo: los campos del manifest, lo que declara cada sitio, las primitivas y lo que un plugin no puede hacer. Pídele al agente el cambio que quieres; creará una carpeta, escribirá `plugin.json` y `style.css` y los comprobará sin conexión. Después elige **Importar archivos** en el popup y selecciona los dos archivos.

Para tener la skill siempre instalada, guarda el archivo como `write-voyager-plugin/SKILL.md` en la carpeta de skills de tu agente (en Claude Code, `~/.claude/skills/`).

### Escríbelo a mano

Con Node.js 18 o posterior:

```sh
npx create-voyager-plugin@latest init my-plugin --site claude
# edita my-plugin/plugin.json y my-plugin/style.css
npx create-voyager-plugin@latest check my-plugin
```

`init` genera un `plugin.json` y un `style.css` que ya pasan las comprobaciones, además de un `AGENTS.md` con las reglas de ese sitio. `--site` acepta `gemini`, `aistudio`, `chatgpt`, `claude` o `deepseek`.

`check` ejecuta sin conexión las mismas comprobaciones que la importación del popup. Termina con código 0 cuando el plugin se podría importar y, si no, imprime una línea `path: message` por cada problema. Añade `--json` para obtener una salida legible por máquinas.

## Qué puede hacer un plugin

- Añadir CSS, acotado bajo una clase `gv-` que el plugin añade a la página.
- Añadir una clase, establecer un atributo seguro o un estilo en línea, u ocultar elementos. Los objetivos son claves semánticas que declara el sitio (`userTurn`, `assistantTurn`, `composer`…) o selectores CSS.
- Ofrecer ajustes en el popup: interruptores, controles deslizantes y desplegables, cuyos valores llegan al CSS mediante tokens `{{key}}`.
- En ChatGPT, Claude y DeepSeek, activar una primitiva de Voyager (copia de fórmulas, la línea de tiempo, diagramas Mermaid y otras) y cambiar los colores de la propia interfaz de Voyager.

## Qué no puede hacer

Un plugin no puede ejecutar JavaScript, reaccionar a clics o teclas, cargar nada desde la red (fuentes, imágenes, hojas de estilo), leer ni reescribir lo que dice un mensaje, ni ejecutarse en otros sitios. Si una petición necesita algo de eso, el material de redacción le indica a la IA que lo diga claramente y que construya la versión más cercana que sí funcione.

## Reglas que comprueba la importación

Además de las comprobaciones comunes del manifest (consulta [Contribuir plugins](./plugin-contribution.md)), un plugin local debe:

- coincidir solo con URL dentro de un sitio compatible con Voyager;
- usar solo claves semánticas que declaren todos los sitios con los que coincide;
- añadir exactamente una clase por `addClass`, empezando por `gv-`;
- usar ajustes boolean, number o select (string y color aún no tienen control en el popup);
- no usar `theme` en Gemini ni en AI Studio, y usar solo las primitivas que cada sitio permite: `formulaCopy`, `vimInput`, `userLatex`, `codeCollapse`, `mermaid`, `wavedrom` y `echarts`, `sendShortcut`, `draftSave` en Gemini, `formulaCopy` y `sendShortcut` en AI Studio. Ejecutan el mismo código que los ajustes propios de Voyager. `formulaCopy` y `vimInput` (copiar fórmulas y modo Vim del campo de entrada) se ejecutan una sola vez por página, el ajuste integrado o un plugin, no ambos. Al cargar la página, o mientras ninguno se esté ejecutando, el ajuste integrado va primero; después, el que ya está en marcha sigue funcionando y el otro aparece en pausa. Desactiva uno para que el otro tome el relevo. Las demás reclaman la página elemento a elemento y funcionan junto al ajuste integrado: una línea o un bloque de código que el otro ya tiene se le deja a él.

Las traducciones (`i18n`) son opcionales.

## Compartirlo

Un plugin local se queda en tu navegador; exporta su JSON desde la lista de plugins para llevarlo a otro lugar. Si puede ser útil para todos, proponlo para el catálogo oficial: [Contribuir plugins](./plugin-contribution.md) describe ese camino.

Solo puede ejecutarse un plugin de atajo de envío por página; el siguiente muestra un conflicto. El parámetro opcional `mode` (sinceEngine `next`) es `ctrlEnterSends` (predeterminado) o `enterSends`. Confirmar el IME no envía el mensaje. Gemini/AI Studio habilitan esta primitiva tras migrar la función.

En Gemini, `sendShortcut` puede sustituir el envío oficial Ctrl/Cmd+Enter: desactiva su ajuste y activa el plugin local. Solo admite `ctrlEnterSends`; no se ejecuta en Enterprise. `composerRoot` incluye la entrada principal y la de edición; `sendButton` excluye Detener.

En AI Studio, `sendShortcut` requiere `params.mode: "enterSends"`. Desactiva el envío oficial con Enter para que un plugin local tome el relevo. Ctrl/Cmd+Enter añade una línea; Shift/Alt+Enter lo gestiona el sitio.

En Gemini, `draftSave` comparte los registros oficiales `gvDraft_<pathname completo>`, incluidas las rutas `/u/N` y Gem. Al desactivarlo se conservan los borradores guardados; varios plugins de la página pueden compartirlos. Antes de cerrar intenta guardar la última entrada, pero el cierre del navegador no garantiza que termine el almacenamiento asíncrono.
