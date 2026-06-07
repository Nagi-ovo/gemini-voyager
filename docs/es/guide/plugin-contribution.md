# Guía para contribuir plugins

El sistema de plugins de Voyager prioriza los plugins declarativos: `plugin.json` describe la información del plugin y las operaciones DOM, mientras que CSS describe los estilos. El plugin no ejecuta JavaScript remoto; el motor integrado de Voyager interpreta el manifest y los estilos.

Esto hace que los plugins sean más fáciles de revisar y mantener. Si quieres contribuir un plugin, empieza por este camino.

## Ruta recomendada

1. Confirma primero que la idea encaja como plugin: ancho de lectura, arreglos de diseño, ajustes de tema, ocultar o marcar elementos de la página y adaptaciones simples de sitios suelen ser buenos casos.
2. Abre primero una Issue o PR en el repositorio principal de Voyager. Explica el problema, el sitio objetivo y en qué se diferencia de los plugins existentes.
3. Usa `plugin.json` para los metadatos, sitios coincidentes, ajustes y contribuciones.
4. Coloca los estilos en `style.css` dentro del mismo directorio y referencia el archivo desde `contributes.styles`.
5. Prueba en local y adjunta páginas de prueba, capturas o una grabación breve en la PR. Los mantenedores decidirán si está listo para el catalog oficial.

## Alcance del plugin

El alcance debe seguir el problema del usuario, no dividirse mecánicamente por plataforma.

Si la misma función tiene una experiencia y ajustes casi idénticos en varias plataformas, prefiere un plugin multiplataforma. Por ejemplo, ancho de lectura, paginación o diseño de bloques de código pueden cubrir Claude, ChatGPT y otros sitios con varios `matches`.

Si cada plataforma necesita ajustes, lógica DOM o textos muy distintos, es más claro separarlo. No metas funciones no relacionadas en un solo plugin solo para que "lo cubra todo"; un plugin debería resolver un problema claro.

Regla rápida:

- Mismo objetivo de usuario, mismos ajustes, solo cambian los selectores: prefiere un plugin.
- Mismo tema, pero la experiencia cambia mucho por plataforma: puedes separarlo manteniendo nombres y descripciones relacionados.
- Objetivos distintos: no los mezcles.

## Evitar plugins duplicados

Antes de enviar, revisa el marketplace y los plugins oficiales existentes. Si ya hay un buen plugin, mejora ese plugin en vez de crear uno similar.

Un duplicado solo merece aceptarse si aporta una mejora clara, por ejemplo:

- Cubre una plataforma importante que el plugin original no soporta.
- Arregla un problema de compatibilidad que el original no puede resolver.
- Mejora claramente el rendimiento, la accesibilidad o el mantenimiento.
- Ofrece una experiencia de usuario distinta y útil, no solo otro nombre o pequeños cambios de estilo.

Así el marketplace se mantiene limpio y los usuarios pueden elegir mejor.

## Ejemplo mínimo

```json
{
  "id": "your-name.example-plugin",
  "name": "Example Plugin",
  "version": "1.0.0",
  "description": "A short description of what this plugin improves.",
  "author": "your-name",
  "category": "readability",
  "license": "MIT",
  "engine": ">=1.0.0",
  "tier": "declarative",
  "matches": ["https://claude.ai/*"],
  "contributes": {
    "styles": [{ "file": "style.css" }],
    "domOps": [
      {
        "op": "addClass",
        "target": "body",
        "className": "gv-plugin-example"
      }
    ]
  }
}
```

`style.css` puede escribirse como CSS normal, pero conviene mantener todos los estilos bajo tu propia clase `gv-plugin-*`:

```css
.gv-plugin-example .some-target {
  max-width: 880px;
}
```

## Notas del manifest

- Usa un prefijo de autor o estilo de dominio inverso para `id`, como `your-name.reading-width`, para evitar conflictos.
- Mantén `matches` limitado a los sitios donde el plugin realmente necesita ejecutarse.
- Un plugin puede incluir varios `matches` si esas plataformas comparten un objetivo funcional claro.
- Valores recomendados para `category`: `render-fix`, `theme`, `layout`, `readability`, `productivity`, `integration` u `other`.
- Indica en `engine` la versión del motor de plugins que necesitas. Los plugins oficiales sirven como referencia.
- Añade `i18n` para chino, inglés y otros idiomas comunes cuando sea posible.

## Límites de CSS y recursos

Los plugins declarativos se validan como entrada no confiable, así que mantén los recursos autocontenidos:

- No uses `@import`.
- No referencies imágenes remotas, fuentes externas ni CSS remoto.
- Puedes usar CSS normal, propiedades personalizadas y sustituciones de valores de ajustes ofrecidas por Voyager.
- Usa el prefijo `gv-plugin-` en las clases para no contaminar el sitio anfitrión ni Voyager.

Si el plugin necesita ajustes, empieza preferiblemente con valores numéricos. Por ejemplo, un plugin de ancho de lectura puede escribir el valor en una variable CSS y consumirlo desde CSS.

## Límites de operaciones DOM

Los plugins declarativos soportan actualmente:

- `addClass`: añade una clase a los elementos objetivo.
- `setAttribute`: establece un atributo.
- `setStyle`: establece estilos inline o variables CSS.
- `hide`: oculta elementos objetivo.

El objetivo puede ser un selector CSS o un selector semántico ofrecido por los adaptadores de sitio de Voyager. Los selectores semánticos suelen ser más estables, pero requieren que el adaptador del sitio exponga ese objetivo.

Las operaciones declarativas deben ser reversibles y seguras al ejecutarse repetidamente. No dependas de un estado puntual de la página ni asumas que el DOM nunca cambia.

## Cuándo no usar un plugin normal

Si la función debe ejecutar JavaScript, interceptar peticiones, leer o escribir datos internos de Voyager, o depender de lógica compleja en tiempo de ejecución, no encaja como plugin declarativo normal.

Abre primero una Issue y explica la necesidad. Si realmente requiere una capacidad integrada, podemos considerar implementarla en el repositorio de Voyager como plugin builtin/native, como Formula Copy.

## Antes de abrir una PR

- El plugin está desactivado por defecto y el usuario lo activa manualmente.
- Revisaste que no exista un plugin casi idéntico; si existe, prioriza mejorarlo.
- Probaste el sitio objetivo en tema claro y oscuro.
- `matches` no cubre sitios sin relación.
- No hay recursos remotos.
- El directorio del plugin contiene `plugin.json`, los CSS necesarios y un README breve.
- La PR describe páginas de prueba, capturas o grabaciones, y las zonas de página afectadas.

Manténlo simple, enfocado y reversible. Un plugin que resuelve un problema claro es mucho más fácil de fusionar y mantener.
