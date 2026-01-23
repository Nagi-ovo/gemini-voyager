# Instalación

Elige tu camino.

> ⚠️ El Gestor de Prompts es la única función compatible con Gemini para Empresas.

## 1. Tiendas Oficiales (Recomendado)

La forma más sencilla de empezar. Las actualizaciones son automáticas.

**Chrome / Brave / Opera / Vivaldi:**

[<img src="https://img.shields.io/badge/Chrome_Web_Store-Ir_a_descargar-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Instalar desde Chrome Web Store" height="40"/>](https://chromewebstore.google.com/detail/kjdpnimcnfinmilocccippmododhceol)

**Microsoft Edge:**

[<img src="https://img.shields.io/badge/Microsoft_Edge-Ir_a_descargar-0078D7?style=for-the-badge&logo=microsoft-edge&logoColor=white" alt="Instalar desde Microsoft Edge Add-ons" height="40"/>](https://microsoftedge.microsoft.com/addons/detail/gemini-voyager/gibmkggjijalcjinbdhcpklodjkhhlne)

**Firefox:**

[<img src="https://img.shields.io/badge/Firefox_Add--ons-Ir_a_descargar-FF7139?style=for-the-badge&logo=firefox&logoColor=white" alt="Instalar desde Firefox Add-ons" height="40"/>](https://addons.mozilla.org/firefox/addon/gemini-voyager/)

## 2. Manual (Versión más reciente)

Las revisiones de la tienda son lentas. Si quieres las últimas funciones, toma este camino.

**Chrome / Edge / Brave / Opera:**

1. Ve a [GitHub Releases](https://github.com/Nagi-ovo/gemini-voyager/releases) y descarga el último `gemini-voyager-chrome-vX.Y.Z.zip`.
2. Descomprímelo.
3. Abre la página de extensiones (`chrome://extensions`).
4. Activa el **Modo de desarrollador** (arriba a la derecha).
5. Haz clic en **Cargar descomprimida** y selecciona la carpeta que acabas de descomprimir.

**Firefox:**

1. Ve a [Releases](https://github.com/Nagi-ovo/gemini-voyager/releases) y descarga el último `gemini-voyager-firefox-vX.Y.Z.xpi`.
2. Abre la gestión de complementos (`about:addons`).
3. Arrastra el archivo `.xpi` descargado allí para instalarlo (o haz clic en el engranaje ⚙️ arriba a la derecha -> **Instalar complemento desde archivo**).

> 💡 El archivo XPI está firmado oficialmente por Mozilla y se puede instalar permanentemente en todas las versiones de Firefox.

## 3. Safari (macOS)

1. Ve a [Releases](https://github.com/Nagi-ovo/gemini-voyager/releases) y descarga `gemini-voyager-safari-vX.Y.Z.zip`.
2. Descomprímelo.
3. Ejecuta este comando en la terminal (necesitas Xcode):
   ```bash
   xcrun safari-web-extension-converter dist_safari --macos-only --app-name "Gemini Voyager"
   ```
4. Ejecuta en Xcode.
5. Actívalo en Safari Preferencias > Extensiones.

---

_¿Quieres contribuir con código? Desarrolladores, por favor consulten la [Guía de Contribución](https://github.com/Nagi-ovo/gemini-voyager/blob/main/.github/CONTRIBUTING.md)._
