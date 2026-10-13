# Viaje en el tiempo

La línea de tiempo de Voyager es un sistema visual de navegación por conversaciones para Gemini, Claude y ChatGPT. Asigna cada mensaje de un chat a un nodo interactivo en el lado derecho de la pantalla y convierte las conversaciones largas con IA en un mapa navegable por el que puedes saltar al instante.

Las conversaciones largas se desordenan. Subes, bajas, pierdes el hilo.
Voyager convierte tu conversación en una línea de tiempo.

En los ajustes de Gemini, **Mostrar línea de tiempo** controla la barra y sus atajos de navegación. Si la desactivas, se conservan las estrellas guardadas y la jerarquía. Las marcas de tiempo de los mensajes dependen de **Mostrar marcas de tiempo de mensajes** por separado, así que puedes mantenerlas visibles con la línea de tiempo desactivada.

## Mira la forma de tu chat

Mira el lado derecho de la pantalla.
Cada nodo representa un mensaje. La línea de tiempo muestra el ritmo de tu diálogo.

## Navegación, resuelta

- **Teletransporte**: Haz clic en un nodo para saltar al instante a ese mensaje.
- **Vistazo**: Pasa el ratón por encima para ver lo que hay dentro sin moverte.
- **Marcador**: Mantén pulsado un nodo para **Destacar** (estrella). Es como un marcador para tu memoria.
- **Niveles (experimental)**: Haz clic derecho en un nodo para asignar niveles (1-3) o contraer sus hijos. Ideal para aclarar las conversaciones ramificadas.
- **Ancho**: Arrastra el borde interior de la línea de tiempo para ajustar su anchura.
- **Teclado**: Navega a la velocidad del pensamiento. Por defecto, `j`/`k`, y `gg`/`GG` para ir al primer o al último turno.

![Navegación por la línea de tiempo](/assets/teaser.png)

## Destacar: marca tus momentos clave

Las conversaciones largas esconden lo valioso. Destaca los momentos que importan.

**Cómo funciona**: mantén pulsado (unos 0,5 s) cualquier nodo de la línea de tiempo. Lo verás iluminarse: ese mensaje ya está destacado.

- Vuelve a mantenerlo pulsado para quitar el destacado.
- Los nodos destacados siguen resaltados para que los localices de un vistazo.
- Consulta todos tus mensajes destacados en la **Biblioteca guardada**: haz clic en **Ver biblioteca guardada** en el popup de Voyager, o ábrela desde el panel del Gestor de prompts.

Piensa en ello como clavar una bandera en la conversación: el momento en que tuviste una idea, la respuesta perfecta o algo a lo que quieres volver más tarde.

::: tip Consejo
Los destacados se sincronizan entre dispositivos si tienes activada la [Sincronización en la nube](/es/guide/cloud-sync).
:::

## Hazlo tuyo

En **Opciones de Línea de Tiempo** del popup de Voyager:

- **Estilo de cronología**: `Nodos`, `Escala` o `Compacto`.
- **Fijar panel de vista previa**: mantiene abierto el panel de vista previa junto a la línea de tiempo. Su cuadro de búsqueda filtra los mensajes mientras escribes.
- **Línea de tiempo arrastrable**: mueve la línea de tiempo a cualquier punto de la página. **Restablecer posición de la línea de tiempo** la devuelve a su lugar.

## Aún más rápido con el teclado

¿Prefieres no usar el ratón? Usa el teclado.

**Es como activar el modo Vim en Gemini.**

### Atajos predeterminados

- `k`: saltar al nodo anterior
- `j`: saltar al nodo siguiente
- `gg`: saltar al primer turno
- `GG`: saltar al último turno

### Personalízalos

Abre los ajustes de la extensión, haz clic en un recuadro de atajo y pulsa la tecla que quieras.
Cualquier tecla o combinación. ¿`n`/`p`? ¿`,`/`.`? Tú decides.

**Modo flujo**: las pulsaciones rápidas se encadenan con suavidad.
**Modo salto**: respuesta inmediata, velocidad máxima.

## Cuándo usar la línea de tiempo

La línea de tiempo es más útil en conversaciones de más de 10 mensajes, cuando desplazarse se vuelve ineficiente:

- **Sesiones de investigación**: pediste a Gemini que explorara un tema a lo largo de más de 30 turnos. La línea de tiempo te permite volver a la idea clave sin releerlo todo.
- **Depuración de código**: una conversación larga de depuración en la que la solución apareció en el turno 47. Destácala y encuéntrala después con un solo clic.
- **Aprendizaje y tutorías**: avanzar paso a paso por un tema complejo. Usa los niveles para contraer las secciones que ya dominas.
- **Repaso de lluvias de ideas**: revisar una sesión creativa para extraer las mejores ideas. Los destacados marcan los momentos que vale la pena conservar.

## Línea de tiempo frente a desplazamiento manual

| Capacidad                            | Sin línea de tiempo              | Con la línea de tiempo de Voyager                         |
| ------------------------------------ | -------------------------------- | --------------------------------------------------------- |
| Encontrar un mensaje concreto        | Subir y bajar repetidamente      | Hacer clic en un nodo o pulsar j/k                        |
| Marcar momentos clave                | Copiar y pegar en notas externas | Mantener pulsado para destacar; se sincroniza con la nube |
| Ver la estructura de la conversación | Leer en orden                    | Un mapa visual muestra toda la forma de un vistazo        |
| Navegación por teclado               | No disponible en Gemini          | Estilo Vim con j/k y gg/GG, totalmente personalizable     |
| Navegar por más de 100 mensajes      | Minutos de desplazamiento        | Salto instantáneo a cualquier punto                       |
| Organizar hilos largos               | No hay herramientas integradas   | Niveles (1-3) y los hijos pueden contraerse               |

## Navegadores compatibles

La línea de tiempo funciona en Google Gemini, y en Claude y ChatGPT como plugins integrados, en Chrome, Edge, Firefox, Safari, Opera y Brave. Los atajos de teclado, los destacados y los niveles funcionan igual en todas las plataformas. Los mensajes destacados se sincronizan entre dispositivos cuando la [Sincronización en la nube](/es/guide/cloud-sync) está activada.

La línea de tiempo no está disponible en AI Studio. DeepSeek tiene un plugin de línea de tiempo opcional en el catálogo de plugins (viene desactivado).
