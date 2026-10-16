# Gems recientes en la barra lateral

::: info No disponible por ahora
La nueva barra lateral de Gemini ha movido Gems al menú «Más» y ya no tiene una entrada de Gems. Por ahora, esta función no se muestra y su interruptor en la ventana emergente de Voyager está desactivado y en gris.
:::

El rediseño de Gemini 2026 primero movió los Gems al menú de ajustes, y luego añadió silenciosamente una entrada de navegación en la parte superior de la barra lateral — pero es solo un enlace que te lleva a `/gems/view`.

Voyager hace que esa entrada nativa de Gems se "expanda" en una lista de tus gems, directamente en la barra lateral: primero los gems fijados y después los que has usado más recientemente.

## Cómo se ve

- **Cuelga de la entrada nativa de Gems.** Sangrado para alinearse con la etiqueta "Gems" de Gemini, de modo que se lee como una sub-lista de esa entrada, no como un panel pegado.
- **Interruptor con flecha.** Un pequeño botón `›` en el lado derecho de la entrada de Gems gira a `⌄` cuando se abre. Haz clic para plegar/expandir. El estado se guarda localmente y se sincroniza entre pestañas.
- **Lo usado recientemente, primero.** Al abrir cualquier gem, tuyo o de los gems predefinidos de Google, pasa al principio de la lista.
- **Los gems fijados se quedan donde están.** Los gems fijados siempre van primero, en el orden en que los fijaste, y no cuentan para el límite del deslizador.
- **Cero tráfico de red.** Todo procede de lo que Voyager ve en las páginas que abres. Sin llamadas a API, sin polling, sin fetches en segundo plano.

## Cómo usarlo

1. Abre el popup de Voyager (icono de la extensión en la barra de herramientas).
2. Comprueba que **Complementos** → **Gems recientes en la barra lateral** esté activado (lo está por defecto). Mientras esté activado, debajo de la fila aparece un deslizador de cantidad; por defecto muestra 3 gems.
3. Arrastra al número que quieras (1–10). **`0` solo oculta la lista de Gems recientes**; no desactiva la función. Para desactivarla, apaga el interruptor de la fila.

Para fijar uno de tus gems, abre `gemini.google.com/gems/view` y haz clic en el botón de fijar de su fila (**Pin to sidebar**). Haz clic de nuevo para quitarlo.

::: tip Primera configuración
La lista se completa a medida que la usas: abre un gem y aparecerá. Para ver gems que no has abierto recientemente, visita una vez `gemini.google.com/gems/view`; Voyager toma allí una instantánea de tu lista de gems.
:::

## Cuándo se actualiza la lista

- **Abrir un gem** (`/gem/<id>`) lo registra como usado recientemente.
- **Visitar `/gems/view`** actualiza la instantánea de tu lista de gems; reordenar, renombrar, crear o eliminar un gem allí se sincroniza al momento.
- No se lee nada de otras páginas.

Así que si añades un gem desde otro dispositivo, Voyager no lo sabrá "mágicamente". Ábrelo, o abre `/gems/view`, una vez en esta máquina.

## Privacidad

- La instantánea de la lista de gems y el historial de uso reciente se guardan en el **almacenamiento local del navegador** (`chrome.storage.local`).
- El valor del deslizador y los IDs de los gems fijados se guardan junto con el resto de los ajustes de Voyager en el **almacenamiento de sincronización del navegador**, así que te siguen entre dispositivos con el mismo perfil de navegador. Los nombres y los iconos nunca se sincronizan.
- No leemos ni cacheamos el contenido de las conversaciones del gem — solo el nombre, descripción, enlace y primera letra para el avatar.
- Desactivar la función (recuento = 0) deja los datos locales en su sitio, así que reactivar es instantáneo.

## Plataforma

Solo Gemini (`gemini.google.com`). La entrada de gem de AI Studio tiene una forma diferente y no está cubierta.
