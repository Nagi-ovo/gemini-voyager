# Transporte de memoria: Sincronización de contexto (Experimental)

**Diferentes dimensiones, intercambio fluido**

Desarrolla la lógica en la web e implementa el código en el IDE. Gemini Voyager rompe las barreras dimensionales, dotando instantáneamente a tu IDE del "proceso de pensamiento" de la web.

## Adiós al salto constante entre pestañas

El mayor dolor de cabeza de los desarrolladores: después de discutir a fondo una solución en la web, regresas a VS Code/Trae/Cursor y tienes que volver a explicar los requisitos como si fueras un extraño. Debido a las cuotas y la velocidad de respuesta, la web es el "cerebro" y el IDE son las "manos". Voyager les permite compartir una misma alma.

## Tres pasos sencillos, respiración sincronizada

1. **Instalar y activar CoBridge**:
   Instala la extensión **CoBridge**. Es el puente central que conecta la web con tu IDE local.
   - **[Instalar desde el Marketplace](https://open-vsx.org/extension/windfall/co-bridge)**

   ![Extensión CoBridge](/assets/CoBridge-extension.png)

   Después de la instalación, haz clic en el icono de la derecha y activa el servidor.
   ![Servidor CoBridge activado](/assets/CoBridge-on.png)

2. **Conexión y saludo**:
   - Activa la "Sincronización de contexto" en los ajustes de Voyager.
   - Alinea los números de puerto. Cuando veas "IDE Online", significa que están conectados.

   ![Consola de sincronización de contexto](/assets/context-sync-console.png)

3. **Sincronización con un clic**: Haz clic en **"Sync to IDE"**. Ya sean **tablas de datos** complejas o **imágenes de referencia** intuitivas, todo se sincronizará instantáneamente con tu IDE.

   ![Sincronización completada](/assets/sync-done.png)

## Arraigando en el IDE

Una vez finalizada la sincronización, aparecerá un archivo `.cobridge/AI_CONTEXT.md` en el directorio raíz de tu IDE. Ya sea Trae, Cursor o Copilot, leerán automáticamente esta «memoria» a través de sus respectivos archivos Rule.

```
your-project/
├── .cobridge/
│   ├── images/
│   │   ├── context_img_1_1.png
│   │   └── context_img_1_2.png
│   └── AI_CONTEXT.md
├── .github/
│   └── copilot-instructions.md
├── .gitignore
├── .traerules
└── .cursorrules
```

## Sus principios

- **Cero contaminación**: CoBridge gestiona automáticamente el archivo `.gitignore`, garantizando que tus conversaciones privadas nunca se suban a los repositorios de Git.
- **Optimizado para IA**: Formato Markdown completo, lo que hace que la lectura por parte de la IA en tu IDE sea tan fluida como leer un manual de instrucciones.
- **Consejo**: Si la conversación es de hace tiempo, desplázate primero hacia arriba usando la [Línea de tiempo] para que la web "recuerde" el contexto y obtener mejores resultados de sincronización.

---

## Listos para el Despegue

**La lógica ya está lista en la nube; ahora, permite que eche raíces localmente.**

- **[Instalar la extensión CoBridge](https://open-vsx.org/extension/windfall/co-bridge)**: Encuentra tu portal dimensional y activa la "respiración sincronizada" con un solo clic.
- **[Visitar el repositorio en GitHub](https://github.com/Winddfall/CoBridge)**: Explora la lógica subyacente de CoBridge o dale una estrella a este proyecto de "sincronización de almas".

> **Los grandes modelos ya no sufren de amnesia; listos para la acción inmediata.**
