# Gems recientes en la barra lateral

El rediseño de Gemini 2026 primero movió los Gems al menú de ajustes, y luego añadió silenciosamente una entrada de navegación en la parte superior de la barra lateral — pero es solo un enlace que te lleva a `/gems/view`.

Voyager hace que esa entrada nativa de Gems se "expanda" en una lista de tus gems más recientes, directamente en la barra lateral.

## Cómo se ve

- **Cuelga de la entrada nativa de Gems.** Sangrado para alinearse con la etiqueta "Gems" de Gemini, de modo que se lee como una sub-lista de esa entrada, no como un panel pegado.
- **Interruptor con flecha.** Un pequeño botón `›` en el lado derecho de la entrada de Gems gira a `⌄` cuando se abre. Haz clic para plegar/expandir. El estado se guarda en `chrome.storage.local` y se sincroniza entre pestañas.
- **Cero tráfico de red.** La lista se lee de una caché local que se rellena la última vez que visitaste `https://gemini.google.com/gems/view`. Sin llamadas a API, sin polling, sin fetches en segundo plano.

## Cómo usarlo

1. Abre el popup de Voyager (icono de la extensión en la barra de herramientas).
2. Busca el deslizador **Gems recientes en la barra lateral**.
3. Arrastra al número que quieras (1–10). **`0` oculta la sección por completo** — déjalo ahí si no quieres la función.

::: tip Primera configuración
Después de habilitarlo, si no ves ningún gem, significa que la caché local está vacía. Visita `gemini.google.com/gems/view` una vez — Voyager hará una instantánea silenciosa de tu lista de gems. La próxima vez que estés en cualquier página de Gemini, la lista estará ahí.
:::

## Cuándo se actualiza la caché

Voyager solo refresca la caché mientras estás **activamente en `/gems/view`**:

- Visitar la página, reordenar, renombrar, crear, eliminar un gem — todo se sincroniza con la caché en tiempo real.
- Fuera de `/gems/view`, no ocurre scraping.

Así que si añades un gem desde otro dispositivo, Voyager no lo sabrá "mágicamente". Abre `/gems/view` una vez en esta máquina y se sincronizará.

## Privacidad

- Los datos permanecen en el **almacenamiento local del navegador** (`chrome.storage.local`). Nada se sube a ningún sitio.
- No leemos ni cacheamos el contenido de las conversaciones del gem — solo el nombre, descripción, enlace y primera letra para el avatar.
- Desactivar la función (recuento = 0) deja la caché en su sitio, así que reactivar es instantáneo.

## Plataforma

Solo Gemini (`gemini.google.com`). La entrada de gem de AI Studio tiene una forma diferente y no está cubierta.
