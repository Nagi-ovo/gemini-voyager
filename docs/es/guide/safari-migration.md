# Migración de la extensión de Safari

::: warning Requiere una acción manual, solo una vez
A partir de la **v1.6.0**, la aplicación anfitriona de Safari cambia de nombre de «**Gemini Voyager**» a «**Voyager**». macOS identifica las aplicaciones por su nombre, así que instalar la nueva versión directamente la deja conviviendo con la antigua, lo que puede provocar una extensión duplicada o un comportamiento confuso. Haz este reemplazo una vez y las actualizaciones automáticas seguirán funcionando como siempre.
:::

## Tus datos están a salvo

El Bundle ID de la aplicación no ha cambiado. Tus carpetas, biblioteca de prompts, sincronización en la nube y todos los ajustes se conservan. Este paso solo reemplaza la aplicación en sí; nunca toca tus datos.

## Pasos de migración

1. **Cierra Safari por completo** (pulsa `⌘Q` dentro de Safari, no basta con cerrar la ventana).
2. Abre **Finder → Aplicaciones** y arrastra la antigua «**Gemini Voyager.app**» a la Papelera.
3. Abre el DMG recién descargado y arrastra «**Voyager.app**» a **Aplicaciones**.
4. Vuelve a abrir Safari → **Ajustes → Extensiones** y activa «**Voyager Extension**».

## Dos cosas que no debes hacer

- ❌ **No conserves las dos aplicaciones.** Si dejas la antigua «Gemini Voyager.app», las dos extensiones entrarán en conflicto.
- ❌ **No pulses «Desinstalar» en la extensión antigua dentro del panel de Extensiones de Safari.** Eso apunta a la aplicación antigua y lo complica más. Simplemente arrastra la aplicación antigua a la Papelera, como en el paso 2.

## Después

Una vez hecho este reemplazo, las futuras versiones de Safari actualizan el nuevo «Voyager» mediante el actualizador automático integrado (Sparkle); ya no hará falta reemplazar nada a mano.

¿Dudas? Escríbenos en [GitHub Issues](https://github.com/Nagi-ovo/voyager/issues).
