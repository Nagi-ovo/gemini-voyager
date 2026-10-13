# Exportación de Deep Research

Exporta el informe final generado por Deep Research, o guarda su proceso de "pensamiento" completo como archivo Markdown.

## 1. Exportación del informe (PDF / imagen)

Los informes generados por Deep Research se pueden exportar como PDF con un formato cuidado o como imágenes únicas para compartir (también se admiten los formatos Markdown y JSON). Abre el menú **Compartir y exportar** del informe y elige **Save Report**.

![Exportación del informe](/assets/deep-research-report-export.png)

## 2. Exportación del proceso de pensamiento (Markdown)

Además del informe final, también puedes exportar el contenido completo de "pensamiento" de las conversaciones de Deep Research.

### Funciones

- **Exportación en un clic**: aparece una opción de descarga en el menú **Compartir y exportar** del informe.
- **Formato estructurado**: conserva las fases de pensamiento, los elementos de pensamiento y los sitios web consultados en su orden original.
- **Encabezados legibles**: los encabezados de sección están en inglés; si Voyager está configurado en otro idioma, cada encabezado muestra ese idioma junto al inglés.
- **Nombres automáticos**: los archivos llevan una marca de tiempo para facilitar su organización (por ejemplo, `deep-research-thinking-20240128-153045.md`).

### Cómo usarla

1. Abre una conversación de Deep Research en Gemini™.
2. Haz clic en el botón **Compartir y exportar** del informe.
3. Selecciona **Descargar contenido de pensamiento**.
4. El archivo Markdown se descargará automáticamente.

![Exportación del pensamiento de Deep Research](/assets/deepresearch_download_thinking.png)

### Formato del archivo exportado

El archivo Markdown exportado incluye:

- **Título**: el título de la conversación.
- **Metadatos**: la marca de tiempo de la exportación y el número total de fases de pensamiento.
- **Fases de pensamiento**: cada fase contiene:
  - Elementos de pensamiento (con encabezados y contenido).
  - Sitios web consultados (con enlaces y títulos).

#### Estructura de ejemplo

```markdown
# Deep Research Conversation Title

**Exported At:** 2025-12-28 17:25:35
**Total Phases:** 3

---

## Thinking Phase 1

### Thought Title 1

Thought content...

### Thought Title 2

Thought content...

#### Researched Websites

- [domain.com](https://example.com) - Page Title
- [another.com](https://another.com) - Another Title

---

## Thinking Phase 2

...
```

## Privacidad

Toda la extracción y el formateo se realizan al 100 % en local, en tu navegador. No se envía ningún dato a servidores externos.
