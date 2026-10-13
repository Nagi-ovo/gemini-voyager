# Gems recientes en la barra lateral

El rediseño de Gemini de 2026 primero trasladó los Gems al menú de ajustes y después volvió a poner discretamente una entrada en la barra lateral, pero solo es un enlace que te lleva a `/gems/view`.

Voyager permite que esa entrada nativa de Gems se "expanda" en una lista de tus gems, justo ahí, en la barra lateral: primero los gems fijados y después los que has usado más recientemente.

## Cómo se ve

- **Cuelga de la entrada nativa de Gems.** Tiene la misma sangría que la etiqueta "Gems" de Gemini, así que se lee como una sublista de esa entrada y no como un panel pegado.
- **Interruptor con flecha.** Un pequeño botón `›` a la derecha de la entrada de Gems gira hasta `⌄` cuando está abierto. Haz clic para plegar o desplegar. El estado se guarda localmente y se sincroniza entre pestañas.
- **Lo usado recientemente, primero.** Al abrir cualquier gem, tuyo o de los gems predefinidos de Google, pasa al principio de la lista.
- **Los gems fijados se quedan donde están.** Los gems fijados siempre van primero, en el orden en que los fijaste, y no cuentan para el límite del deslizador.
- **Cero tráfico de red.** Todo procede de lo que Voyager ve en las páginas que abres. Sin llamadas a API, sin consultas periódicas, sin peticiones en segundo plano.

## Cómo usarlo

1. Abre el popup de Voyager (icono de la extensión en la barra de herramientas).
2. Busca el deslizador **Gems recientes en la barra lateral**. Por defecto muestra 3 gems.
3. Arrástralo hasta la cantidad que quieras (1–10). **`0` oculta la sección por completo**; ponlo ahí si no quieres usar esta función.

Para fijar uno de tus gems, abre `gemini.google.com/gems/view` y haz clic en el botón de fijar de su fila (**Pin to sidebar**). Haz clic de nuevo para quitarlo.

::: tip Primera configuración
La lista se completa a medida que la usas: abre un gem y aparecerá. Para ver gems que no has abierto recientemente, visita una vez `gemini.google.com/gems/view`; Voyager toma allí una instantánea de tu lista de gems.
:::

## Cuándo se actualiza la lista

- **Abrir un gem** (`/gem/<id>`) lo registra como usado recientemente.
- **Visitar `/gems/view`** actualiza la instantánea de tu lista de gems; reordenar, renombrar, crear o eliminar un gem allí se sincroniza al momento.
- No se lee nada de otras páginas.

Así que, si añades un gem desde otro dispositivo, Voyager no lo sabrá por arte de magia. Ábrelo, o abre `/gems/view`, una vez en este equipo.

## Privacidad

- La instantánea de la lista de gems y el historial de uso reciente se guardan en el **almacenamiento local del navegador** (`chrome.storage.local`).
- El valor del deslizador y los IDs de los gems fijados se guardan junto con el resto de los ajustes de Voyager en el **almacenamiento de sincronización del navegador**, así que te siguen entre dispositivos con el mismo perfil de navegador. Los nombres y los iconos nunca se sincronizan.
- No leemos ni guardamos en caché el contenido de las conversaciones del gem; solo el nombre, la descripción, el enlace y la primera letra del avatar.
- Desactivar la función (cantidad = 0) deja los datos locales en su sitio, así que volver a activarla es instantáneo.

## Plataforma

Solo Gemini (`gemini.google.com`). La entrada de gems de AI Studio tiene otra forma y no está cubierta.
