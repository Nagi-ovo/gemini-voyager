# Guía de Contribución

> [!IMPORTANT]
> **Estado del proyecto: Mantenimiento bajo.** Espere retrasos en las respuestas. Se priorizan los PR con pruebas.

¡Gracias por considerar contribuir a Gemini Voyager! 🚀

Este documento proporciona pautas e instrucciones para contribuir. Damos la bienvenida a todas las contribuciones, ya sea corrección de errores, nuevas funcionalidades, mejoras en la documentación o traducciones.

## 🚫 Política de IA

**Rechazamos explícitamente los PR generados por IA que no hayan sido verificados manualmente.**

Aunque las herramientas de IA son grandes asistentes, las contribuciones de "copiar y pegar" sin revisión hacen perder tiempo a los mantenedores.

- **Los PR de IA de baja calidad** se cerrarán inmediatamente sin discusión.
- **Los PR sin explicación** de la lógica o que carezcan de las pruebas necesarias serán rechazados.
- Debes entender y asumir la responsabilidad de cada línea de código que envíes.

## Tabla de Contenidos

- [Comenzando](#comenzando)
- [Reclamar un Problema](#reclamar-un-problema)
- [Configuración de Desarrollo](#configuración-de-desarrollo)
- [Realizando Cambios](#realizando-cambios)
- [Enviar un Pull Request](#enviar-un-pull-request)
- [Estilo de Código](#estilo-de-código)
- [Agregar Soporte para Gem](#agregar-soporte-para-gem)
- [Licencia](#licencia)

---

## Comenzando

### Requisitos Previos

- **Bun** 1.0+ (Requerido)
- Un navegador basado en Chromium para pruebas (Chrome, Edge, Brave, etc.)

### Inicio Rápido

```bash
# Clonar el repositorio
git clone https://github.com/Nagi-ovo/gemini-voyager.git
cd gemini-voyager

# Instalar dependencias
bun install

# Iniciar modo de desarrollo
bun run dev
```

---

## Reclamar un Problema

Para evitar trabajo duplicado y coordinar contribuciones:

### 1. Verificar Trabajo Existente

Antes de comenzar, verifica si el problema ya está asignado a alguien mirando la sección **Assignees**.

### 2. Reclamar un Problema

Comenta `/claim` en cualquier problema no asignado para asignártelo automáticamente. Un bot confirmará la asignación.

### 3. Liberar si es Necesario

Si ya no puedes trabajar en un problema, comenta `/unclaim` para liberarlo para otros.

### 4. Casilla de Verificación de Contribución

Al crear problemas, puedes marcar la casilla "I am willing to contribute code" para indicar tu interés en implementar la funcionalidad o corrección.

---

## Configuración de Desarrollo

### Instalar Dependencias

```bash
bun install
```

### Comandos Disponibles

| Comando               | Descripción                                           |
| --------------------- | ----------------------------------------------------- |
| `bun run dev`         | Iniciar modo desarrollo Chrome con recarga automática |
| `bun run dev:firefox` | Iniciar modo desarrollo Firefox                       |
| `bun run dev:safari`  | Iniciar modo desarrollo Safari (solo macOS)           |
| `bun run build`       | Compilación de producción para Chrome                 |
| `bun run build:all`   | Compilación de producción para todos los navegadores  |
| `bun run lint`        | Ejecutar ESLint con corrección automática             |
| `bun run typecheck`   | Ejecutar comprobación de tipos TypeScript             |
| `bun run test`        | Ejecutar conjunto de pruebas                          |

### Cargar la Extensión

1. Ejecuta `bun run dev` para iniciar la compilación de desarrollo
2. Abre Chrome y ve a `chrome://extensions/`
3. Habilita el "Modo de desarrollador"
4. Haz clic en "Cargar descomprimida" y selecciona la carpeta `dist_chrome`

---

## Realizando Cambios

### Antes de Empezar

1. **Crea una rama** desde `main`:

   ```bash
   git checkout -b feature/nombre-de-tu-funcionalidad
   # o
   git checkout -b fix/tu-correccion-de-error
   ```

2. **Vincular Issues** - Al implementar una nueva funcionalidad, **primero debes abrir un Issue de discusión**. Los PR de nuevas funcionalidades enviados sin discusión previa serán cerrados. Al enviar un PR, por favor enlaza ese Issue.
3. **Mantén los cambios enfocados** - una funcionalidad o corrección por PR

### Lista de Verificación Pre-Commit

Antes de enviar, ejecuta siempre:

```bash
bun run lint       # Corregir problemas de linting
bun run format     # Formatear código
bun run typecheck  # Comprobar tipos
bun run build      # Verificar que la compilación tiene éxito
bun run test       # Ejecutar pruebas
```

Asegúrate de que:

1. Tus cambios logran la funcionalidad deseada.
2. Tus cambios no afectan negativamente a las funciones existentes.

---

## Estrategia de Pruebas

Seguimos una estrategia de pruebas basada en el ROI: **Prueba la lógica, no el DOM.**

1. **Imprescindible (Lógica)**: Servicios principales (Almacenamiento, Copia de seguridad), analizadores de datos y utilidades. Aquí se requiere TDD.
2. **Recomendable (Estado)**: Estado de UI complejo (ej: Reducer de carpetas).
3. **Omitir (Frágil)**: Manipulación directa del DOM (Content Scripts) y componentes de UI puros. Usa programación defensiva en su lugar.

---

## Enviar un Pull Request

### Pautas de PR

1. **Título**: Usa un título claro y descriptivo (ej: "feat: add dark mode toggle" o "fix: timeline scroll sync")
2. **Descripción**: Explica qué cambios hiciste y por qué
3. **Impacto en el Usuario**: Describe cómo se verán afectados los usuarios
4. **Prueba Visual (Estricto)**: Para CUALQUIER cambio de UI o nueva funcionalidad, **DEBES** proporcionar capturas de pantalla o grabaciones. **Sin captura = Sin revisión/respuesta.**
5. **Referencia de Problema**: Enlaza problemas relacionados (ej: "Closes #123")

### Formato de Mensaje de Commit

Sigue [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - Nuevas funcionalidades
- `fix:` - Corrección de errores
- `docs:` - Cambios en documentación
- `chore:` - Tareas de mantenimiento
- `refactor:` - Refactorización de código
- `test:` - Agregar o actualizar pruebas

---

## Estilo de Código

### Pautas Generales

- **Prefiere retornos tempranos** sobre condicionales anidados
- **Usa nombres descriptivos** - evita abreviaciones
- **Evita números mágicos** - usa constantes con nombre
- **Sigue el estilo existente** - consistencia sobre preferencia

### Convenciones TypeScript

- **PascalCase**: Clases, interfaces, tipos, enums, componentes React
- **camelCase**: Funciones, variables, métodos
- **UPPER_SNAKE_CASE**: Constantes

### Orden de Importación

1. React e importaciones relacionadas
2. Bibliotecas de terceros
3. Importaciones absolutas internas (`@/...`)
4. Importaciones relativas (`./...`)
5. Importaciones solo de tipo

```typescript
import React, { useState } from 'react';

import { marked } from 'marked';

import { Button } from '@/components/ui/Button';
import { StorageService } from '@/core/services/StorageService';
import type { FolderData } from '@/core/types/folder';

import { parseData } from './parser';
```

---

## Agregar Soporte para Gem

Para agregar soporte para un nuevo Gem (Gems oficiales de Google o Gems personalizados):

1. Abre `src/pages/content/folder/gemConfig.ts`
2. Agrega una nueva entrada al array `GEM_CONFIG`:

```typescript
{
  id: 'your-gem-id',           // De la URL: /gem/your-gem-id/...
  name: 'Your Gem Name',       // Nombre para mostrar
  icon: 'material_icon_name',  // Icono de Google Material Symbols
}
```

### Encontrar el ID del Gem

- Abre una conversación con el Gem
- Verifica la URL: `https://gemini.google.com/app/gem/[GEM_ID]/...`
- Usa la parte `[GEM_ID]` en tu configuración

### Elegir un Icono

Usa nombres de iconos válidos de [Google Material Symbols](https://fonts.google.com/icons):

| Icono          | Caso de Uso            |
| -------------- | ---------------------- |
| `auto_stories` | Aprendizaje, Educación |
| `lightbulb`    | Ideas, Lluvia de ideas |
| `work`         | Carrera, Profesional   |
| `code`         | Programación, Técnica  |
| `analytics`    | Datos, Análisis        |

---

## Alcance del Proyecto

Gemini Voyager mejora la experiencia de chat de Gemini AI con:

- Navegación por línea de tiempo
- Organización de carpetas
- Bóveda de prompts
- Exportación de chat
- Personalización de UI

**Fuera de alcance**: Scraping de sitios, intercepción de red, automatización de cuentas.

---

## Obtener Ayuda

- 💬 [GitHub Discussions](https://github.com/Nagi-ovo/gemini-voyager/discussions) - Haz preguntas
- 🐛 [Issues](https://github.com/Nagi-ovo/gemini-voyager/issues) - Reporta errores
- 📖 [Documentación](https://gemini-voyager.vercel.app/) - Lee la documentación

---

## Licencia

Al contribuir, aceptas que tus contribuciones se licenciarán bajo la [Licencia GPLv3](../LICENSE).
