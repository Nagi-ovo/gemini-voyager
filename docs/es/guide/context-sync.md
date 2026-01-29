# Sincronización de Contexto: Transferencia de Memorias (Experimental)

**Diferentes dimensiones, intercambio fluido**

Desarrolla la lógica en la web e implementa el código en el IDE. Gemini Voyager rompe las barreras dimensionales, dotando instantáneamente a tu IDE del "proceso de pensamiento" de la web.

## Di adiós a los constantes cambios de pestaña

El mayor dolor de cabeza de los desarrolladores: después de discutir a fondo una solución en la web, regresas a VS Code/Trae/Cursor y tienes que volver a explicar los requisitos como si fueras un extraño. Debido a las cuotas y la velocidad de respuesta, la web es el "cerebro" y el IDE son las "manos". Voyager les permite compartir una misma alma.

## Tres sencillos pasos para sincronizar

1. **Activa CoBridge**: Instala la extensión **CoBridge** desde el Marketplace de VS Code y iníciala. Es el puente que conecta la web con tu máquina local.
   ![Extensión CoBridge](/assets/CoBridge-extension.png)

   ![Servidor CoBridge activado](/assets/CoBridge-on.png)

2. **Conexión y saludo**:
   - Activa la "Sincronización de contexto" en los ajustes de Voyager.
   - Alinea los números de puerto. Cuando veas "IDE en línea", significa que están conectados.

   ![Consola de sincronización de contexto](/assets/context-sync-console.png)

3. **Sincronización con un clic**: Haz clic en **"Sincronizar con IDE"**.

   ![Sincronización completada](/assets/sync-done.png)

## Arraigando en el IDE

Una vez completada la sincronización, aparecerá un archivo `.vscode/AI_CONTEXT_SYNC.md` en el directorio raíz de tu IDE. Ya sea Trae, Cursor o Copilot, leerán automáticamente esta "memoria" a través de sus respectivos archivos de reglas. **Los modelos de IA ya no sufrirán de pérdida de memoria y estarán listos para trabajar de inmediato.**

## Principios

- **Cero contaminación**: CoBridge gestiona automáticamente el archivo `.gitignore`, garantizando que tus conversaciones privadas nunca se suban a los repositorios de Git.
- **Optimizado para IA**: Formato Markdown completo, lo que hace que la lectura por parte de la IA en tu IDE sea tan fluida como leer un manual de instrucciones.
- **Consejo**: Si la conversación es de hace tiempo, desplázate primero hacia arriba usando la [Línea de tiempo] para que la web "recuerde" el contexto y obtener mejores resultados de sincronización.
