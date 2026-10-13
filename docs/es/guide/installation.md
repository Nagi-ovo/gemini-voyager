# Instalación

::: info Novedades
🍎 **¡La extensión nativa de Safari ya está disponible!** Es completamente gratuita y se puede instalar con un solo clic.
:::

Elige tu camino.

> ⚠️ Nota: el Gestor de prompts es la única función compatible con Gemini™ para empresas.

## 1. Tiendas de extensiones (recomendado)

La forma más sencilla de empezar. Las actualizaciones son automáticas.

**Chrome / Edge / Brave / Opera / Vivaldi:**

[<img src="https://img.shields.io/badge/Chrome_Web_Store-Ir_a_descargar-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Instalar desde Chrome Web Store" height="40"/>](https://chromewebstore.google.com/detail/iifacdnjakkhjjiengaffnegbndgingi?utm_source=github&utm_medium=docs&utm_campaign=organic_growth&utm_content=es)

**Microsoft Edge:**

[<img src="https://img.shields.io/badge/Microsoft_Edge-Ir_a_descargar-0078D7?style=for-the-badge&logo=microsoft-edge&logoColor=white" alt="Instalar desde Microsoft Edge Add-ons" height="40"/>](https://microsoftedge.microsoft.com/addons/detail/voyager/gibmkggjijalcjinbdhcpklodjkhhlne)

> **Usuarios de Edge:** Voyager sigue manteniéndose en [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/voyager/gibmkggjijalcjinbdhcpklodjkhhlne), sobre todo para quienes necesitan Edge en el móvil o la tableta. Si la revisión se retrasa, siguen disponibles Chrome Web Store y los paquetes manuales de GitHub.

**Firefox:**

[<img src="https://img.shields.io/badge/Firefox_Add--ons-Ir_a_descargar-FF7139?style=for-the-badge&logo=firefox&logoColor=white" alt="Instalar desde Firefox Add-ons" height="40"/>](https://addons.mozilla.org/firefox/addon/gemini-voyager/)

## 2. Instalación manual (funciones más recientes)

La revisión de las tiendas puede tardar. Si quieres la versión más reciente cuanto antes, instálala manualmente.

**Chrome / Edge / Brave / Opera:**

1. Descarga el último `voyager-chrome-vX.Y.Z.zip` desde [GitHub Releases](https://github.com/voyager-crew/voyager/releases).
2. Descomprime el archivo.
3. Abre la página de extensiones de tu navegador (`chrome://extensions`).
4. Activa el **Modo de desarrollador** (arriba a la derecha).
5. Haz clic en **Cargar descomprimida** y selecciona la carpeta que acabas de descomprimir.

**Firefox:**

1. Descarga el último `voyager-firefox-vX.Y.Z.xpi` desde [Releases](https://github.com/voyager-crew/voyager/releases).
2. Abre el gestor de complementos (`about:addons`).
3. Arrastra el archivo `.xpi` hasta esa página para instalarlo (o haz clic en el icono de engranaje ⚙️ y elige **Instalar complemento desde archivo**).

> 💡 El archivo XPI está firmado oficialmente por Mozilla y puede instalarse de forma permanente en todas las versiones de Firefox.

## 3. Safari (macOS)

¡Safari ahora admite distribución directa! Descarga la aplicación ya firmada:

::: warning Actualizar desde `Gemini Voyager.app`
La aplicación contenedora ahora se llama `Voyager.app`. Como macOS no sustituye las aplicaciones cuyo nombre de archivo es distinto, no dejes instaladas las dos copias.

1. En la extensión antigua, abre las pestañas de Gemini y AI Studio que uses y ejecuta **Sincronización en Nube > Subir a la nube**. Si usas los resaltados sincronizados, activa su sincronización antes de subir.
2. Exporta la biblioteca de prompts como archivo JSON local, como copia de seguridad independiente.
3. Cierra Safari y la aplicación contenedora.
4. Mueve `/Applications/Gemini Voyager.app` a la Papelera. No hagas clic en el botón **Desinstalar** de Safari y no borres los datos de extensiones, los datos de sitios web ni los contenedores de Safari.
5. Copia `Voyager.app` en `/Applications`, ábrela una vez y, si Safari te lo pide, activa Voyager.
6. Comprueba tus carpetas, prompts, ajustes y elementos destacados. Si falta algo, usa **Fusionar** o importa el JSON de prompts.

Voyager conserva los identificadores de paquete de la aplicación y de la extensión existentes, así que macOS y Safari siguen reconociendo la misma identidad del producto. Los pasos de copia de seguridad son una precaución para las instalaciones manuales antiguas.
:::

1. Descarga la <SafariDownloadLink>última versión para Safari (.dmg)</SafariDownloadLink>.
2. Ábrelo con doble clic y sigue las instrucciones para instalarlo.
3. Haz doble clic para iniciar la aplicación.
4. Activa la extensión en **Preferencias de Safari > Extensiones**.

> 💡 La versión para Safari ahora está firmada directamente para su distribución, ¡no hace falta convertirla con Xcode!
>
> ✅ **Compatibilidad oficial con Safari**: desde la v1.6.0 se admiten la eliminación de marcas de agua, la exportación de imágenes, la sincronización con Google Drive e iCloud, las notificaciones de respuesta y las actualizaciones con Sparkle.

---

_¿Quieres contribuir con código? Si eres desarrollador, consulta la [Guía de contribución](https://github.com/voyager-crew/voyager/blob/main/.github/CONTRIBUTING.md)._
