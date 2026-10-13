---
title: Vista Actividad
description: Ordena las conversaciones de las carpetas por la actividad real del chat para que primero aparezca el trabajo que sigue en marcha.
---

# Actividad: mantén la atención en las conversaciones en curso

Las carpetas responden a una pregunta: ¿dónde pertenece esta conversación? A medida que crece tu archivo, aparece otra pregunta con más frecuencia: ¿qué conviene mirar ahora?

Actividad es una vista temporal sobre las carpetas. Haz clic en la campana situada junto a **Carpetas** para sustituir el árbol de carpetas por las conversaciones ordenadas según la actividad real del chat. No cambia tus carpetas, las asignaciones de conversaciones ni el estado de Destacar.

**Inspiración del diseño:** esta vista se inspira en la barra lateral de Codex / ChatGPT Desktop de OpenAI. Voyager retoma la idea de mostrar primero las conversaciones que siguen activas y la adapta a una vista temporal sobre las carpetas de Gemini.

<img src="/assets/activity-view.png" alt="La vista Actividad en la barra lateral de Gemini" style="display: block; width: 100%; max-width: 517px; margin: 24px auto; border-radius: 14px; box-shadow: 0 12px 32px rgba(0,0,0,0.12);"/>

## Prioridad sigue la actividad reciente

Prioridad contiene las conversaciones con un turno nuevo en las últimas **tres horas**. Usa la hora real de la conversación, no el momento en que abriste o consultaste el chat.

Una conversación que está en Prioridad no aparece también en Hoy. Cuando termina su periodo activo de tres horas, Actividad la devuelve automáticamente a Hoy o al grupo de fecha que le corresponda. No hace falta recargar la página.

Destacar sigue disponible como marca manual independiente. Destacar una conversación no la mueve a Prioridad, y quitar el destacado no saca de Prioridad a una conversación activa.

## Una ventana corta de los últimos días

Debajo de Prioridad aparecen Hoy (Today), Ayer (Yesterday) y los días de la semana anteriores. Actividad cubre hoy y los cuatro días naturales anteriores, para mantener la lista cerca del trabajo actual.

Las conversaciones más antiguas y los registros sin hora de actividad no aparecen aquí. No se ocultan ni se eliminan. Vuelve a pulsar la campana para regresar al árbol de carpetas y encontrarlas en su ubicación original.

## Una conversación, una fila

Una conversación puede pertenecer a varias carpetas. Actividad combina esas referencias en una sola fila y muestra los nombres de las carpetas debajo del título. Pasa el cursor sobre esa información para ver las rutas completas.

Así, una misma conversación no ocupa varios lugares en Prioridad o en Hoy, y conserva el contexto de sus proyectos.

## Tres señales con funciones distintas

| Señal     | Origen                              | Pregunta que responde                      |
| --------- | ----------------------------------- | ------------------------------------------ |
| Carpetas  | Proyectos y temas que organizas tú  | ¿Dónde pertenece esta conversación?        |
| Actividad | Hora del último turno real del chat | ¿Qué trabajo se ha movido recientemente?   |
| Destacar  | Marca manual                        | ¿Qué conversaciones deben seguir marcadas? |

Las carpetas sirven para recuperar algo del archivo. Actividad reduce las opciones que hay que volver a valorar cada vez que regresas a Gemini. Empieza por una conversación que aún tenga impulso en Prioridad, continúa con Hoy o Ayer y vuelve al árbol completo cuando necesites material más antiguo.

## Dónde funciona

Actividad está disponible en la barra lateral de carpetas de Gemini y en la sección de carpetas de ChatGPT (parte del plugin de carpetas integrado de ChatGPT).
