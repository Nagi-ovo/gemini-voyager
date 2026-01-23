# Sitios Web Personalizados para el Gestor de Prompts

El Gestor de Prompts ahora se puede utilizar en cualquier sitio web que elijas, no solo en Gemini y AI Studio.

## Cómo Funciona

Cuando añades un sitio web personalizado:

1. La extensión solicitará permiso para acceder a ese sitio web específico.
2. El Gestor de Prompts se inyectará en ese sitio web.
3. **Solo** se activará la función del Gestor de Prompts (sin línea de tiempo, carpetas u otras funciones).

## Añadir un Sitio Web

1. Haz clic en el icono de la extensión para abrir la ventana emergente.
2. Desplázate hasta la sección **Gestor de Prompts**.
3. Ingresa la URL del sitio web (por ejemplo: `chatgpt.com` o `claude.ai`).
4. Haz clic en **Añadir sitio web**.
5. Concede los permisos cuando se te solicite.

## Formatos de URL Soportados

Puedes ingresar URLs en varios formatos:

- `chatgpt.com`
- `www.chatgpt.com`
- `https://chatgpt.com`
- `claude.ai`

La extensión normalizará automáticamente la URL y solicitará permisos para ambas versiones `https://` y `https://www.`.

## Privacidad y Seguridad

- **Control del Usuario**: Añades explícitamente los sitios web donde quieres usar el Gestor de Prompts.
- **Limitación de Funciones**: Solo se activa el Gestor de Prompts en sitios personalizados (sin línea de tiempo, carpetas, etc.).
- **Gestión Fácil**: Añade o elimina sitios web en cualquier momento desde la ventana emergente de la extensión.

## Ejemplos

Sitios web de chat de IA populares donde podrías querer usar el Gestor de Prompts:

- `chatgpt.com` - ChatGPT
- `claude.ai` - Claude
- `copilot.microsoft.com` - Microsoft Copilot
- `bard.google.com` - Google Bard (Antiguo)
- `poe.com` - Poe

## Eliminar un Sitio Web

1. Abre la ventana emergente de la extensión.
2. Encuentra el sitio web en la lista.
3. Haz clic en **Eliminar**.
4. El script de contenido se desactivará automáticamente.

## Solución de Problemas

### El Gestor de Prompts no aparece después de añadir un sitio

1. **Recarga la página**: La extensión solo se activa cuando la página se carga.
2. Verifica si el formato de la URL es correcto (por ejemplo: `chatgpt.com` en lugar de `chat.openai.com/chatgpt`).
3. Abre la consola del navegador (F12) para ver los registros de `[Gemini Voyager]`.

### Cómo comprobar si está funcionando correctamente

Abre la consola del navegador (F12) y busca:

```
[Gemini Voyager] Checking custom websites: ...
[Gemini Voyager] Is custom website: true
[Gemini Voyager] Custom website detected, starting Prompt Manager only
```

### ¿Quieres usar otras funciones en sitios personalizados?

Actualmente, solo el Gestor de Prompts es compatible con sitios web personalizados. Otras funciones (Línea de tiempo, Carpetas, etc.) están diseñadas específicamente para Gemini y AI Studio y no funcionarán en otros sitios.
