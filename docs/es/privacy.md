# Política de Privacidad

Última actualización: 16 de marzo de 2026

## Introducción

Voyager (en adelante "nosotros") se compromete a proteger su privacidad. Esta política de privacidad explica cómo nuestra extensión de navegador recopila, utiliza y protege su información.

## Recopilación y Uso de Datos

**No recopilamos ninguna información personal.**

Voyager se ejecuta completamente en local en su navegador. Todos los datos generados o gestionados por la extensión (como carpetas, plantillas de prompts, mensajes favoritos y configuraciones) se almacenan en:

1. Su dispositivo local (`chrome.storage.local`)
2. El almacenamiento sincronizado de su navegador (`chrome.storage.sync`, si está disponible), para sincronizar configuraciones entre sus dispositivos.

No tenemos acceso a sus datos personales, historial de chat ni ninguna otra información privada. Tampoco rastreamos su historial de navegación.

## Sincronización con Google Drive (Opcional)

Si activa la sincronización con Google Drive, Chrome, Edge y Firefox usan la API de identidad del navegador; la aplicación directa de Safari usa Google Sign-In nativo y guarda las credenciales en el Llavero de macOS. Ambas rutas solicitan únicamente el scope limitado `drive.file` y transfieren los datos directamente entre su dispositivo y **su propio Google Drive**. Los tokens OAuth no se envían a ningún servidor de Voyager.

## Permisos

Esta extensión solo solicita los permisos mínimos necesarios para funcionar:

- **Storage (Almacenamiento)**: Para guardar sus preferencias, carpetas, prompts, mensajes favoritos y opciones de personalización de la interfaz localmente y entre dispositivos.
- **Identity (Identidad)**: Para la autenticación de Google de la función opcional de sincronización con Google Drive. Solo se usa cuando activa explícitamente la sincronización en la nube.
- **Scripting (Scripts)**: Para inyectar dinámicamente scripts de contenido en las páginas de Gemini y en sitios web personalizados especificados por el usuario para la función Gestor de Prompts. Solo se inyectan scripts incluidos en la propia extensión — no se descarga ni ejecuta código remoto.
- **Host Permissions (Permisos de host)** (gemini.google.com, aistudio.google.com, etc.): Para inyectar scripts de contenido que mejoran la interfaz de Gemini con funciones como carpetas, exportación, línea de tiempo y cita de respuesta. Los dominios adicionales de Google (googleapis.com, accounts.google.com) son necesarios para la autenticación de la sincronización con Google Drive.
- **Optional Host Permissions (Permisos de host opcionales)** (todas las URL): Solo se solicitan en tiempo de ejecución cuando usted añade explícitamente sitios web personalizados para el Gestor de Prompts. Nunca se activan sin su acción.

## Servicios de Terceros

Voyager no comparte datos con ningún servicio de terceros, anunciantes o proveedores de análisis.

## Cambios en la Política

Podemos actualizar nuestra política de privacidad de vez en cuando. Le notificaremos cualquier cambio publicando la nueva política de privacidad en esta página.

## Contáctenos

Si tiene alguna pregunta sobre esta política de privacidad, contáctenos a través de nuestro [repositorio de GitHub](https://github.com/Nagi-ovo/voyager).
