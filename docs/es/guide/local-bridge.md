# Puente local de ChatGPT

ChatGPT · Puente local es un plugin oficial de Voyager. Viene desactivado.

Cuando lo activas y lo vinculas, Voyager pone a disposición de los programas locales de este equipo un conjunto de acciones sobre la página de ChatGPT. Un programa dice qué quiere hacer y Voyager lo hace en una pestaña que abre él mismo, con el ChatGPT en el que ya tienes la sesión iniciada en tu navegador. Para ChatGPT, es un chat normal desde tu propio navegador.

## Qué ofrece

- Abrir una conversación: nueva o existente
- Elegir el modelo: solo en modo chat; nunca cambia ChatGPT al modo Work
- Enviar una instrucción, con archivos adjuntos
- Esperar la respuesta y leerla
- Leer la última respuesta de una conversación existente
- Listar y crear proyectos
- Listar, subir y eliminar archivos de un proyecto (eliminar es inmediato y permanente)
- Volver a descargar ahora los datos de página (los datos del sitio con los que Voyager reconoce las páginas de ChatGPT), sin esperar a la próxima comprobación programada

## Cómo se comporta

**Solo local.** El puente se comunica con los programas de este equipo únicamente a través de `127.0.0.1`, y solo después de vincularlos.

**Su propia pestaña.** Cada tarea se ejecuta en una pestaña de ChatGPT que abre Voyager, y la pestaña se cierra al terminar.

**Una tarea a la vez, salvo que permitas más.** Por defecto las tareas se ejecutan una tras otra. Activa **Ejecutar tareas en paralelo** en la tarjeta **Puente local** de la ventana emergente y elige **Tareas a la vez** (de 2 a 10, 3 por defecto): cada tarea usa su propia pestaña, y escribir y hacer clic sigue siendo por turnos. Las tareas en paralelo requieren una Voyager CLI posterior a la 0.4.0; con un `voyager serve` anterior, siguen ejecutándose de una en una.

**El inicio de sesión y las verificaciones son cosa tuya.** Si ChatGPT te pide iniciar sesión o resolver una verificación, el puente se detiene y te avisa. Nunca intenta saltársela.

**Tu plan, a la vista.** Cada resultado indica tu plan de ChatGPT (`Pro Lite ($100)`, `Pro ($200)`, …) según lo informó la página por última vez.

**Navegadores.** Probado en Chrome. Las versiones de Voyager para Edge y Firefox también incluyen el puente; la de Safari, no.

## Uso de referencia: Voyager CLI

[Voyager CLI](https://github.com/voyager-crew/voyager-cli) (npm `@voyager-crew/cli`, comando `voyager`) es un cliente de referencia construido sobre estas acciones: pregúntale a ChatGPT desde la terminal, o deja que lo haga tu agente de programación.

### En tres pasos

1. Instala el CLI (Node.js 20.3 o posterior):

   ```sh
   npm install -g @voyager-crew/cli
   ```

2. En la ventana emergente de Voyager, abre **Complementos**, activa **ChatGPT · Puente local** y permite el acceso a chatgpt.com.
3. Vincúlalos una vez:

   ```sh
   voyager pair
   ```

   Escribe el código de ocho caracteres que muestra en los ajustes de «Puente local» de la ventana emergente.

### Algunos ejemplos

```sh
voyager ask "Explica este stack trace" --attach crash.log
voyager ask --chat <link|id> "¿Y los casos límite?"     # seguir en una conversación
voyager read <link|id>                                  # guardar la última respuesta de una conversación
voyager project upload "Tesis" ./thesis                 # cualquier chat del proyecto puede leerlo
voyager ask --project "Tesis" "¿Dónde es más débil el argumento?"
voyager ask --drive ./paper.pdf "Resume la sección de métodos"  # a Google Drive; lo lee la app de Drive de ChatGPT
voyager ask --repo owner/name "¿Por qué falla el CI?"           # la app de GitHub de ChatGPT lee el repositorio
```

La respuesta se guarda como `response.md`, y las preguntas usan por defecto GPT-6 Pro en modo chat.

Ambas usan las propias apps de Google Drive y GitHub de ChatGPT, así que conéctalas antes en ChatGPT; solo añaden texto al prompt y no necesitan una versión nueva de Voyager. `--drive` sube los archivos con rclone a una carpeta nueva dentro de `VOYAGER_DRIVE_REMOTE` (por ejemplo, `gdrive:Voyager`), que debe ser la misma cuenta de Google que la app de Drive de ChatGPT; no tiene el límite de 64 MiB de `--attach`, y los archivos se quedan en Drive. `--repo` pide a ChatGPT que haga commits solo en una rama nueva `chatgpt/*`, pero es una petición, no una restricción: la app puede escribir en cualquier sitio al que llegue su instalación de GitHub. Si ChatGPT no puede acceder al repositorio, voyager se detiene con el código de salida 3; añade el repositorio en la [configuración de instalaciones de GitHub](https://github.com/settings/installations).

Cómo esperar respuestas largas, qué significa cada código de salida y todos los comandos están en el [README del CLI](https://github.com/voyager-crew/voyager-cli#readme). Las instrucciones para Claude Code, Codex y otros agentes están en [SKILL.md](https://github.com/voyager-crew/voyager-cli/blob/main/skills/voyager/SKILL.md).

## Aviso

- Voyager y Voyager CLI son proyectos comunitarios de código abierto. No están afiliados a OpenAI ni cuentan con su aprobación.
- El puente automatiza ChatGPT en la web dentro de tu propio navegador con sesión iniciada. Los [Términos de uso](https://openai.com/policies/terms-of-use/) de OpenAI restringen la extracción de resultados por medios automáticos o programáticos, así que decide por tu cuenta si tu uso los cumple antes de depender de él. Cualquier limitación que reciba tu cuenta por ello corre de tu cuenta.
- Las herramientas similares adoptan la misma postura: [oracle](https://github.com/steipete/oracle), por ejemplo, deja su modo navegador como una función experimental que hay que activar y recomienda la API a quien quiera evitar el riesgo. Si necesitas una vía con soporte, usa la API de OpenAI.
- El puente es para tu propia comodidad en tu propio ordenador: conecta solo tu cuenta, no lo uses para dar servicio a otras personas, compartir una cuenta o revender tu uso, y úsalo solo con fines legales.
