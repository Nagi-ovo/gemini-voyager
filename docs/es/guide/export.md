# Libertad total

Voyager Export te permite descargar cualquier conversación de Gemini o ChatGPT como archivo Markdown, PDF, JSON o imagen. Extrae el contenido completo del chat, incluidos los bloques de código, las imágenes y el formato, y te da una copia permanente y portátil de cada conversación con IA que tengas.

Los datos encerrados son el enemigo.
Creemos que, si lo creaste, es tuyo.

## Comparativa de formatos

| Característica    | Markdown                             | PDF                        | JSON                               | Imagen                   |
| ----------------- | ------------------------------------ | -------------------------- | ---------------------------------- | ------------------------ |
| Ideal para        | Apps de notas (Obsidian, Notion)     | Compartir e imprimir       | Desarrolladores, análisis de datos | Compartir en el móvil    |
| Imágenes          | Incrustadas                          | Incluidas por completo     | Codificadas en Base64              | Renderizadas en su lugar |
| Bloques de código | Se conserva el resaltado de sintaxis | Renderizados visualmente   | Se conserva el texto sin formato   | Renderizados visualmente |
| Tamaño            | El más pequeño                       | El más grande              | Medio                              | Grande                   |
| Búsqueda          | Texto plano                          | Búsqueda del lector de PDF | Acceso programático                | No                       |

## Exporta todo

Voyager te permite sacar tus datos de la nube y tenerlos en tus manos.

### Los formatos

- **Markdown**: Para tu vault de Obsidian o para Notion. Texto limpio y con formato, con las imágenes incrustadas.
- **PDF**: Para compartir o imprimir. Maquetación cuidada, con las imágenes incluidas.
- **JSON**: Datos en bruto. Para desarrolladores que quieran construir sobre su historial.
- **Imagen**: Un PNG largo, ideal para compartir en el móvil. Elige un diseño estrecho, medio o ancho.

### Cómo exportar

1. Haz clic en el botón **Exportar** de la esquina superior derecha de la página (ChatGPT y los diseños actuales de Gemini). En Gemini también puedes elegir **Exportar historial de conversación** en el menú ⋮ de una conversación o de una respuesta; en los diseños antiguos de Gemini, pasa el ratón sobre el logo de Gemini para ver el **icono de exportación**.
2. Elige el formato.
3. Listo.

Son tus datos. Haz con ellos lo que quieras.

<div style="display: flex; gap: 20px; margin-top: 20px;">
  <div style="flex: 1; text-align: center;">
    <p><b>Paso 1: busca Exportar</b></p>
    <img src="/assets/gemini-export-guide-1.png" alt="Guía de exportación, paso 1" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>
  </div>
  <div style="flex: 1; text-align: center;">
    <p><b>Paso 2: elige el formato</b></p>
    <img src="/assets/gemini-export-guide-2.png" alt="Guía de exportación, paso 2" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>
  </div>
</div>

### Nota sobre la exportación a PDF en Safari

En Safari, la exportación a PDF requiere un proceso algo distinto (impresión manual):

1. Haz clic en el botón **Exportar** y selecciona el formato PDF.
2. **Espera un segundo aproximadamente** (para que la página prepare los estilos de impresión).
3. Pulsa `Command + P` para abrir el diálogo de impresión.
4. Selecciona **"Guardar como PDF"** en el diálogo de impresión.

<img src="/assets/safari-export-pdf.png" alt="Exportar PDF en Safari" style="max-width: 100%; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 20px;"/>

## Exportación de Deep Research

El modo Deep Research de Gemini genera informes estructurados con fuentes, pasos de razonamiento y citas. Voyager puede exportar estas sesiones con todos sus metadatos intactos:

1. Abre una conversación de Deep Research que ya esté terminada.
2. Abre el menú **Compartir y exportar** del informe y elige **Save Report**.
3. Elige el formato.
4. La exportación incluye el informe final con sus enlaces a las fuentes. Para guardar también el proceso de pensamiento, consulta [Exportación de Deep Research](/es/guide/deep-research).

Esto resulta útil en investigación académica, análisis de la competencia y documentación técnica, cuando necesitas conservar la cadena de razonamiento y la atribución de las fuentes.

## Cuándo exportar

- **Archivo de conocimiento**: Guarda las conversaciones importantes antes de que queden enterradas en tu historial de chat.
- **Compartir con el equipo**: Exporta una sesión de depuración a PDF para enviarla a compañeros que no usan Gemini.
- **Crear una base de conocimiento**: Exporta las conversaciones en Markdown y organízalas en Obsidian o Notion.
- **Análisis de datos**: Usa las exportaciones JSON para analizar patrones de conversación de forma programática o extraer datos estructurados.
- **Cumplimiento y auditoría**: Conserva registros de las decisiones tomadas con ayuda de la IA para tener pistas de auditoría.

## Plataformas compatibles

La exportación funciona en Gemini y ChatGPT en Chrome, Edge, Firefox, Safari, Opera y Brave. En Safari, la exportación a PDF usa un paso de impresión manual (Command+P después de hacer clic en exportar); las exportaciones a Markdown y JSON siguen incluyendo imágenes.
