# Gems recientes en la barra lateral

La nueva barra lateral de Gemini movió los Gems al menú «Más», donde solo son un enlace a la página completa `/gems/view`. Voyager añade a la barra lateral su propia sección Gems con tus gems a un clic: primero los gems fijados y después los que has usado más recientemente.

## Cómo se ve

- **Su propia sección Gems.** La lista está bajo la navegación superior de la barra lateral (el grupo con «Más»), con un encabezado **Gems**. Si Gemini aún muestra una entrada nativa de Gems, la lista cuelga de esa entrada.
- **Plegable.** Haz clic en el encabezado **Gems** (o en la flecha de una entrada nativa de Gems) para plegar o expandir; su `›` gira a `⌄` al abrirse. El estado se guarda localmente y se sincroniza entre pestañas.
- **Lo usado recientemente, primero.** Al abrir cualquier gem, tuyo o de los gems predefinidos de Google, pasa al principio de la lista.
- **Los gems fijados se quedan donde están.** Los gems fijados siempre van primero, en el orden en que los fijaste, y no cuentan para el límite del deslizador.
- **Cero tráfico de red.** Todo procede de lo que Voyager ve en las páginas que abres. Sin llamadas a API, sin polling, sin fetches en segundo plano.

## Cómo usarlo

1. Abre el popup de Voyager (icono de la extensión en la barra de herramientas).
2. Comprueba que **Barra lateral** → **Gems recientes en la barra lateral** esté activado (lo está por defecto). Mientras esté activado, debajo de la fila aparece un deslizador de cantidad; por defecto muestra 3 gems.
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
- Desactivar la fila deja los datos locales en su sitio, así que volver a activarla es instantáneo.

## Plataforma

Solo Gemini (`gemini.google.com`). La entrada de gem de AI Studio tiene una forma diferente y no está cubierta.
