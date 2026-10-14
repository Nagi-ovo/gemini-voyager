# Política de Privacidad

Última actualización: 14 de octubre de 2026

## Resumen

Voyager es una extensión de navegador de uso local (local-first) para organizar y mejorar los espacios de chat con IA compatibles. Solo trata datos limitados del usuario para ofrecer las funciones que el usuario solicita. Voyager no gestiona ningún backend que reciba conversaciones, prompts, actividad de navegación, imágenes ni identificadores de cuenta, y no utiliza rastreadores publicitarios ni de analítica.

## Datos que se tratan

Según las funciones que uses, Voyager puede tratar:

- **Contenido de sitios web y comunicaciones personales**: texto de las conversaciones, prompts, borradores, imágenes, enlaces y otro contenido de las páginas compatibles, usado para las carpetas, la navegación, la exportación, la gestión de prompts, la investigación y las funciones de la interfaz.
- **Identificadores de cuenta**: un servicio de Google compatible puede exponer la dirección de correo con la que has iniciado sesión. Voyager la convierte en un identificador de cuenta local para que los datos de cuentas distintas permanezcan separados. Voyager no envía la dirección de correo sin procesar.
- **Historial web y actividad del usuario**: URL de los sitios compatibles, rutas de conversación y eventos limitados de página, interacción y red necesarios para la navegación, los atajos, los indicadores de uso, las notificaciones de respuesta completada y otras funciones solicitadas. Estos datos no se usan para elaborar perfiles ni con fines publicitarios.
- **Información de autenticación**: un token OAuth2 con el scope `drive.file`, solo cuando el usuario activa explícitamente la sincronización con Google Drive.
- **Datos y ajustes de la extensión**: carpetas, plantillas de prompts, borradores, mensajes destacados, instantáneas de uso, estado de los plugins y preferencias de la interfaz.

Estos datos se guardan localmente en `chrome.storage.local` o, para los ajustes compatibles, en `chrome.storage.sync`. Permanecen en el dispositivo del usuario o en su cuenta de sincronización del navegador, salvo que el usuario utilice explícitamente una de las transferencias descritas más abajo.

## Transferencias solicitadas por el usuario

- **Sincronización con Google Drive (opcional)**: los datos de copia de seguridad seleccionados se transfieren directamente entre el dispositivo del usuario y su propio Google Drive. Chrome, Edge y Firefox usan la API de identidad del navegador; la aplicación directa de Safari usa el inicio de sesión nativo de Google y guarda las credenciales en el Llavero de macOS. Ambas vías solicitan únicamente el scope limitado `drive.file`, y los tokens OAuth no se envían a ningún servidor de Voyager.
- **Sincronización con iCloud en Safari (opcional)**: la extensión nativa de Safari transfiere los datos de copia de seguridad seleccionados directamente a la base de datos privada de CloudKit de la cuenta de iCloud del usuario. Voyager no recibe el Apple ID del usuario ni ningún token de autenticación de iCloud, y el desarrollador no puede acceder a los registros de esa base de datos privada.
- **Exportaciones e imágenes**: cuando el usuario solicita una exportación, Voyager puede descargar imágenes de las fuentes que ya aloja la propia página y puede solicitar acceso temporal para capturar el contenido de la interfaz generado. El archivo resultante se crea para el usuario; no se sube a ningún servidor de Voyager.
- **Recursos públicos del proyecto**: Voyager puede solicitar recursos públicos de publicaciones, anuncios o documentación. Estas solicitudes no incluyen contenido de conversaciones ni de prompts.
- **Actualizaciones del catálogo de plugins**: en un sitio donde el usuario haya activado al menos un plugin, Voyager puede descargar por HTTPS el archivo de catálogo actualizado de ese sitio desde `https://voyager.nagi.fun/catalog/hosts/<host del sitio>.json`, por ejemplo `https://voyager.nagi.fun/catalog/hosts/chat.deepseek.com.json`. La comprobación se realiza al abrir una página así, o al abrir el popup de la extensión en ella, y solo si la última comprobación es más antigua que el intervalo elegido por el usuario (6 horas por defecto; 1 hora, 6 horas, 24 horas o solo manual). Gemini y AI Studio solo usan los plugins oficiales incluidos en la extensión y nunca generan una solicitud. La solicitud es un GET normal que no lleva cookies, ni identificadores de cuenta o de la extensión, ni contenido de la página o de la conversación; como en cualquier solicitud web, el servidor ve la dirección IP del solicitante y el user agent del navegador, además del nombre de host del sitio en la ruta de la URL. En los sitios con plugins, el popup muestra un interruptor de «Actualizaciones en línea de complementos» y el selector del intervalo de comprobación; ambos ajustes se guardan en el almacenamiento de sincronización del navegador y se incluyen en la copia de seguridad de la configuración. Con el interruptor desactivado, Voyager no contacta con voyager.nagi.fun salvo que el usuario pulse «Buscar actualizaciones de complementos ahora». Si la solicitud falla o el sitio no tiene archivo de catálogo, se sigue usando la instantánea de plugins incluida en la extensión. Un catálogo descargado contiene solo CSS y JSON, que se validan y se depuran antes de usarse; no se descarga ni se ejecuta ningún JavaScript. Esta comprobación es independiente de la de anuncios, que tiene su propio ajuste. voyager.nagi.fun es un alojamiento estático tras un proxy de Cloudflare; el proyecto Voyager no registra ni conserva estas solicitudes, y los metadatos de conexión (dirección IP, User-Agent) los gestionan los proveedores de alojamiento según sus propias políticas de privacidad.

Voyager no vende datos de usuario ni los transfiere con fines publicitarios, de solvencia crediticia o para fines no relacionados con las funciones de cara al usuario de la extensión.

## Permisos

- **Storage (almacenamiento)**: guarda los datos y las preferencias de la extensión en local y, cuando es compatible, a través de la sincronización del navegador. Chrome, Edge y Firefox también conceden `unlimitedStorage` para que los datos locales no se vean limitados por la cuota predeterminada del navegador; Voyager sigue aplicando su propio límite de almacenamiento. En Safari es opcional.
- **Identity (identidad)**: autentica la sincronización opcional con Google Drive tras una acción explícita del usuario. La sincronización con iCloud en Safari usa la cuenta de iCloud del sistema del Mac en lugar de este permiso del navegador.
- **Scripting (scripts)**: inyecta únicamente scripts incluidos en la extensión en los sitios compatibles; no se ejecuta JavaScript remoto ni WebAssembly.
- **Active tab y contenido declarativo**: identifica el sitio compatible que abre el usuario y muestra los controles específicos de ese sitio. El contenido declarativo solo se usa en Chrome y Edge.
- **Alarms (alarmas)**: ejecuta comprobaciones periódicas para los anuncios públicos de compatibilidad.
- **Notifications (notificaciones, opcional)**: se solicita solo cuando el usuario activa las notificaciones de respuesta completada.
- **Host permissions (permisos de host)**: se conceden al instalar para Gemini, Gemini Enterprise y AI Studio, además de los dominios de Google necesarios para las operaciones de Google Drive e imágenes que solicita el usuario.
- **Optional host permissions (permisos de host opcionales)**: se accede a Claude, ChatGPT, DeepSeek y los sitios personalizados solo después de que el usuario active Voyager o un plugin para ese sitio y apruebe la solicitud de permiso del navegador. `<all_urls>` también puede solicitarse de forma temporal cuando el usuario elige una exportación que captura contenido de la interfaz generado; si se deniega, la exportación continúa sin esa captura.

## Conservación y control del usuario

Los datos locales y los de sincronización del navegador se conservan hasta que el usuario los elimina, borra el almacenamiento de la extensión o desinstala la extensión. Las copias de seguridad en la nube permanecen en la cuenta de Google Drive o iCloud seleccionada por el usuario hasta que este las elimine de esa cuenta. Los usuarios pueden desactivar las funciones opcionales y revocar el acceso opcional a sitios o la autorización de Google desde Voyager y desde los ajustes del navegador.

## Uso limitado de las API de Google

El uso y la transferencia de la información recibida de las API de Google por parte de Voyager cumplen la Política de datos de usuario de la Chrome Web Store, incluidos los requisitos de uso limitado.

## Cambios en la Política

Podemos actualizar nuestra política de privacidad de vez en cuando. Le notificaremos cualquier cambio publicando la nueva política de privacidad en esta página.

## Contáctenos

Si tiene alguna pregunta sobre esta política de privacidad, contáctenos a través de nuestro [repositorio de GitHub](https://github.com/voyager-crew/voyager).
