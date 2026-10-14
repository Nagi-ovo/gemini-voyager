# Sincronización en la Nube

La sincronización en la nube de Voyager guarda una copia de seguridad de tus carpetas, tu biblioteca de prompts, los mensajes destacados y los ajustes compatibles. Elige Google Drive en cualquier navegador compatible, o iCloud en Safari. Los datos viajan directamente entre Voyager y la cuenta en la nube personal que selecciones; Voyager no gestiona ningún servidor de sincronización.

## Qué se sincroniza

| Tipo de dato             | Sincronizado | Detalles                                                                                                       |
| ------------------------ | ------------ | -------------------------------------------------------------------------------------------------------------- |
| Estructura de carpetas   | Sí           | Todas las carpetas, su anidamiento, colores y las conversaciones asignadas                                     |
| Biblioteca de prompts    | Sí           | Todos los prompts guardados, con etiquetas y organización por carpetas                                         |
| Mensajes destacados      | Sí           | Marcadores de la línea de tiempo de cualquier conversación                                                     |
| Ajustes de la extensión  | Sí           | Preferencias compartidas entre dispositivos, como el orden, los colores y el comportamiento de la entrada      |
| Configuración de plugins | Sí           | Estado de instalación y activación, y ajustes del plugin; los permisos del sitio siguen siendo por dispositivo |
| Respuestas del modelo    | No           | Las copias de destacados contienen los prompts del usuario, no las respuestas del modelo                       |

## Datos destacados y límites de sincronización

Las copias en la nube incluyen el **texto completo de los prompts de usuario que marcas con estrella** (hasta 16 KiB UTF-8 por prompt) en tu propio Google Drive o iCloud. Las copias de estrellas no almacenan respuestas del modelo. La copia v1 conserva solo vistas previas; la nueva v2 incluye el texto y los registros de eliminación.

Los registros de eliminación se conservan 180 días. Las versiones antiguas de Voyager los ignoran y pueden mostrar o subir estrellas eliminadas; las nuevas bloquean copias antiguas con la misma marca de tiempo. Marcar de nuevo con una fecha posterior, o la caducidad del registro, puede restaurar una estrella. Los periodos largos sin conexión y las diferencias entre relojes también afectan a las eliminaciones.

La sincronización combina y verifica los datos escritos, con un máximo de tres intentos, pero no es una transacción atómica entre dispositivos: las cargas simultáneas pueden sobrescribirse. Una sincronización posterior desde un dispositivo que conserva los datos faltantes puede repararlos; sin ella, la recuperación no está garantizada. Los fallos parciales conservan las escrituras aceptadas; vuelve a sincronizar para completar la reparación.

## Características

- **Sincronización multidispositivo**: Mantén tus configuraciones sincronizadas en varias computadoras.
- **Privacidad de datos**: Los datos se guardan en tu propio Google Drive o en tu base de datos privada de iCloud, sin pasar por un servidor de Voyager.
- **Sincronización flexible**: Soporte para carga manual y descarga/fusión de datos.

::: info
Los identificadores de dispositivo, los tokens de acceso, las cachés, las coordenadas de la ventana y el estado temporal de ejecución no se sincronizan a propósito como ajustes personales.
:::

## Cómo usar

1. Haz clic en el icono de Voyager en la barra de herramientas del navegador para abrir el popup.
2. Localiza la sección **Sincronización en Nube**.
3. En Safari, elige **Google Drive** o **iCloud**. Los demás navegadores usan Google Drive.
4. En Google Drive, haz clic en **Iniciar sesión con Google** y completa la autorización. En iCloud, asegúrate de que el Mac tenga la sesión de iCloud iniciada.
5. Haz clic en **Subir** para sincronizar tus datos locales con la nube, o en **Fusionar** para traer los datos de la nube a este navegador. **Sobrescribir** sustituye los datos locales por la copia de la nube en lugar de fusionarlos, así que se pierde todo lo que no hayas subido.

Con iCloud, **Eliminar copia de iCloud** elimina de iCloud todas las copias de seguridad de Voyager; los datos locales del Mac no cambian.

### 💡 Sincronización rápida

La forma más sencilla es hacer clic en los botones **"Subir a la nube"** o **"Sincronizar desde la nube"** en la parte superior del área de carpetas en la barra lateral izquierda.

<img src="/assets/cloud-sync.png" alt="Botones de sincronización rápida en la nube" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>

::: warning
**Recomendación de seguridad: Protección doble**\
Si bien la sincronización en la nube ofrece una gran comodidad, le recomendamos encarecidamente que también realice periódicamente copias de seguridad de sus datos principales mediante **archivos locales**.

1. **Carpetas**: Abre el menú del área de carpetas, elige **Importar/Exportar carpetas** y, después, **Exportar carpetas** para guardar todas tus carpetas y las asignaciones de conversaciones.
2. **Prompts**: En el **Gestor de prompts**, haz clic en **Exportar** para guardar tu biblioteca de prompts.
   :::

## Sincronización en la nube frente a copia de seguridad manual

| Aspecto                    | Copia manual (exportar/importar)   | Sincronización en la nube                                          |
| -------------------------- | ---------------------------------- | ------------------------------------------------------------------ |
| Frecuencia                 | Cuando te acuerdes                 | Bajo demanda, con un solo clic                                     |
| Ubicación de datos         | Archivo local en tu ordenador      | Tu Google Drive o tu base de datos privada de iCloud               |
| Entre dispositivos         | Requiere transferir archivos       | Dispositivos con sesión iniciada en la cuenta de nube seleccionada |
| Comportamiento al fusionar | Sustituye o requiere fusión manual | Fusión inteligente sin duplicar                                    |
| Privacidad                 | El archivo permanece en tu máquina | Almacenado en tu cuenta de nube personal                           |

## Cómo funciona

1. **Proveedor**: Google Drive usa el permiso limitado `drive.file`, así que Voyager solo puede acceder a los archivos que ha creado. En Safari, iCloud usa la base de datos privada CloudKit de la aplicación y no expone a Voyager ningún token de Apple ID.
2. **Subida**: Al hacer clic en **Subir**, Voyager escribe en el proveedor seleccionado archivos de copia separados para las carpetas, los prompts, los destacados, los forks, la jerarquía de la línea de tiempo, los ajustes de personalización y la configuración de plugins. Los datos de resaltado se incluyen cuando la sincronización de resaltados está activada.
3. **Descarga y fusión**: Al hacer clic en **Fusionar** en otro dispositivo, Voyager lee esos archivos y los fusiona por tipo de dato. Las carpetas y los prompts nuevos se añaden sin duplicarse, se restauran las preferencias de la nube y las entradas de plugins se fusionan por ID de plugin.
4. **Sin sincronización en segundo plano**: La sincronización es manual y bajo demanda. Voyager nunca sincroniza sin tu acción explícita.

Cambiar de proveedor no copia datos entre ellos ni escribe en los dos a la vez. Si quieres que los datos locales actuales estén en el nuevo proveedor, sube los datos una vez después de cambiar.

## Plataformas compatibles

La sincronización con Google Drive funciona en Chrome, Edge, Firefox y Safari. La sincronización con iCloud solo está disponible en la aplicación de Safari distribuida directamente y usa la cuenta de iCloud iniciada en el Mac.
