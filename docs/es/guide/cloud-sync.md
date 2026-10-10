# Sincronización en la Nube

Sincroniza tus carpetas, biblioteca de prompts y otros datos en Google Drive para mantener tu experiencia consistente en todos tus dispositivos.

## Características

- **Sincronización multidispositivo**: Mantén tus configuraciones sincronizadas en varias computadoras usando Google Drive.
- **Privacidad de datos**: Los datos se almacenan directamente en tu propio almacenamiento de Google Drive, lo que garantiza la privacidad sin servidores de terceros.
- **Sincronización flexible**: Soporte para carga manual y descarga/fusión de datos.

## Datos destacados y límites de sincronización

Las copias en la nube incluyen el **texto completo de los prompts de usuario que marcas con estrella** (hasta 16 KiB UTF-8 por prompt) en tu propio Google Drive o iCloud. Las copias de estrellas no almacenan respuestas del modelo. La copia v1 conserva solo vistas previas; la nueva v2 incluye el texto y los registros de eliminación.

Los registros de eliminación se conservan 180 días. Las versiones antiguas de Voyager los ignoran y pueden mostrar o subir estrellas eliminadas; las nuevas bloquean copias antiguas con la misma marca de tiempo. Marcar de nuevo con una fecha posterior, o la caducidad del registro, puede restaurar una estrella. Los periodos largos sin conexión y las diferencias entre relojes también afectan a las eliminaciones.

La sincronización combina y verifica los datos escritos, con un máximo de tres intentos, pero no es una transacción atómica entre dispositivos: las cargas simultáneas pueden sobrescribirse. Una sincronización posterior desde un dispositivo que conserva los datos faltantes puede repararlos; sin ella, la recuperación no está garantizada. Los fallos parciales conservan las escrituras aceptadas; vuelve a sincronizar para completar la reparación.

## Cómo usar

1. Haz clic en el icono de la extensión en la esquina inferior derecha de la página de Gemini™ para abrir el panel de configuración.
2. Localiza la sección **Sincronización en la Nube**.
3. Haz clic en **Iniciar sesión con Google** y completa la autorización.
4. Una vez autorizado, haz clic en **Subir a la Nube** para sincronizar tus datos locales con la nube, o en **Descargar y Fusionar** para traer los datos de la nube a tu máquina local.

### 💡 Sincronización rápida

La forma más sencilla es hacer clic en los botones **"Subir a la Nube"** o **"Descargar y Fusionar"** en la parte superior del área de carpetas en la barra lateral izquierda.

<img src="/assets/cloud-sync.png" alt="Botones de sincronización rápida en la nube" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>

::: warning
**Recomendación de seguridad: Protección doble**  
Si bien la sincronización en la nube ofrece una gran comodidad, le recomendamos encarecidamente que también realice periódicamente copias de seguridad de sus datos principales mediante **archivos locales**.

1. **Exportación completa**: Exporta un paquete completo con todas las configuraciones, carpetas y prompts desde "Copia de seguridad y restauración" al final del panel.
   <img src="/assets/manual-export-all.png" alt="Exportación completa" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>
2. **Exportar todas las carpetas**: Haz clic en "Exportar" en la sección "Carpetas" del panel para guardar todas tus carpetas y conversaciones, excluyendo los prompts.
   <img src="/assets/manual-folder-export.png" alt="Exportar todas las carpetas" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>
   :::
