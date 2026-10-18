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

## Cómo se comporta

**Solo local.** El puente se comunica con los programas de este equipo únicamente a través de `127.0.0.1`, y solo después de vincularlos.

**Su propia pestaña.** Cada tarea se ejecuta en una pestaña de ChatGPT que abre Voyager, y la pestaña se cierra al terminar.

**Una tarea a la vez.** Solo se ejecuta una tarea a la vez.

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
```

La respuesta se guarda como `response.md`, y las preguntas usan por defecto GPT-6 Pro en modo chat.

Cómo esperar respuestas largas, qué significa cada código de salida y todos los comandos están en el [README del CLI](https://github.com/voyager-crew/voyager-cli#readme). Las instrucciones para Claude Code, Codex y otros agentes están en [SKILL.md](https://github.com/voyager-crew/voyager-cli/blob/main/skills/voyager/SKILL.md).
