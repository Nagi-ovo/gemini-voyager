# Guía de Contribución

> [!CAUTION]
> **Este proyecto actualmente NO acepta PRs para nuevas funcionalidades.** Si tienes una funcionalidad que realmente te gustaría desarrollar, sigue este proceso:
>
> 1. **Abre un Issue primero** para discutir tu idea y enfoque con el mantenedor
> 2. **Espera la aprobación y un plan de implementación sólido** antes de escribir código o enviar un PR
>
> Los PRs de nuevas funcionalidades enviados sin discusión previa serán cerrados sin revisión. Gracias por tu comprensión.

> [!IMPORTANT]
> **Estado del proyecto: Mantenimiento bajo.** Espere retrasos en las respuestas. Se priorizan los PR con pruebas.

¡Gracias por considerar contribuir a Voyager! 🚀

Este documento proporciona pautas e instrucciones para contribuir. Damos la bienvenida a correcciones de errores, mejoras en la documentación y traducciones. Para nuevas funcionalidades, por favor discútelo primero mediante un Issue.

## Política de PR asistidas por IA

**Las contribuciones asistidas por IA son bienvenidas, pero cada PR debe ser revisada y verificada personalmente por quien la envía.**

Las herramientas de IA pueden ayudar, pero las contribuciones copiadas y pegadas sin un objetivo claro, un alcance enfocado ni una verificación real hacen perder tiempo a los mantenedores.

- Eres responsable del objetivo, el alcance, los cambios de comportamiento y los resultados de verificación de tu PR. No necesitas comprender por completo cada línea generada por un agente, pero debes poder explicar qué resuelve la PR y por qué el enfoque es razonable.
- Antes de programar, aclara con el agente los requisitos, el alcance afectado, el comportamiento esperado y cómo verificar el cambio.
- Mantén la PR enfocada: una PR debe resolver un problema o realizar un cambio coherente, sin agrupar modificaciones no relacionadas.
- La verificación es lo más importante: prueba personalmente el flujo real después del cambio. Para cambios de UI o comportamiento, intenta usarlo durante unos 15 minutos cuando sea posible.
- Envía la PR después de verificarla e incluye evidencia visual, como capturas de pantalla, grabaciones o comparaciones antes/después.

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

- **Bun 1.3.12** (coincide con `packageManager` y CI)
- Chrome y Firefox para las pruebas reales predeterminadas de cambios en el runtime compartido
- Edge para cambios de Chromium, permisos, manifest o empaquetado
- Safari/macOS para cambios que afecten a Safari antes de fusionarlos

Consulta [Carga y pruebas de humo en navegadores](BROWSER_TESTING.md) para conocer la matriz de riesgos y los procedimientos exactos. Si no dispones de un entorno, registra `Needs <browser> test` y asigna a una persona responsable; una inferencia de IA no es evidencia de prueba.

`bun run build:edge` y `bun run verify:pr` requieren la herramienta de línea de comandos `zip`. En Windows, usa WSL o indica en la PR qué comprobaciones no ejecutaste y quién las completará.

### Inicio Rápido

```bash
# Clonar el repositorio
git clone https://github.com/Nagi-ovo/voyager.git
cd voyager

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

En un problema no asignado **sin** la etiqueta `community-only`, comenta `/claim` para asignártelo automáticamente. Un bot confirmará la asignación.

### 3. Problemas exclusivos de la comunidad

Los problemas con la etiqueta `community-only` están reservados para miembros verificados de la comunidad Voyager:

1. El miembro de la comunidad comenta `/claim`.
2. Un mantenedor verifica su membresía y comenta `/approve @usuario`.
3. Empieza la implementación o abre un PR solo después de que el bot asigne el problema.

La etiqueta elimina automáticamente `help wanted` y `good first issue`. Otros colaboradores pueden unirse al [Discord de Voyager](https://discord.gg/TEUFxdMbGb) o elegir un problema sin `community-only`.

### 4. Liberar si es Necesario

Si ya no puedes trabajar en un problema, comenta `/unclaim` para liberarlo para otros.

### 5. Casilla de Verificación de Contribución

Al crear problemas, puedes marcar la casilla "I am willing to contribute code" para indicar tu interés en implementar la funcionalidad o corrección.

---

## Configuración de Desarrollo

### Instalar Dependencias

```bash
bun install
```

### Comandos Disponibles

| Comando                  | Descripción                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `bun run dev`            | Iniciar modo desarrollo Chrome con recarga automática                                    |
| `bun run dev:firefox`    | Iniciar modo desarrollo Firefox                                                          |
| `bun run dev:safari`     | Iniciar modo desarrollo Safari (solo macOS)                                              |
| `bun run build`          | Compilación de producción para Chrome                                                    |
| `bun run build:edge`     | Compilación y paquete independientes para Edge                                           |
| `bun run build:all`      | Compila Chrome + Firefox + Safari (no incluye Edge)                                      |
| `bun run build:browsers` | Compila Chrome + Edge + Firefox + Safari                                                 |
| `bun run lint`           | Ejecutar ESLint con corrección automática                                                |
| `bun run typecheck`      | Ejecutar comprobación de tipos TypeScript                                                |
| `bun run test`           | Ejecutar conjunto de pruebas                                                             |
| `bun run verify:pr`      | Validación automática local estándar (sin macOS nativo ni pruebas reales en navegadores) |

### Cargar la Extensión

Para el desarrollo habitual en Chrome, ejecuta `bun run dev:chrome` y carga `dist_chrome_dev` desde `chrome://extensions/`. Consulta [Carga y pruebas de humo en navegadores](BROWSER_TESTING.md) para conocer los artefactos exactos, los procedimientos de carga y recarga, y los criterios de aprobación para Chrome, Edge, Firefox y Safari.

---

## Realizando Cambios

### Antes de Empezar

1. **Crea una rama** desde `main`:

   ```bash
   git checkout -b feature/nombre-de-tu-funcionalidad
   # o
   git checkout -b fix/tu-correccion-de-error
   ```

2. **Vincular Issues** - Para una nueva funcionalidad, **abre un Issue y espera la aprobación explícita del mantenedor sobre el enfoque**. Usar `/claim` o recibir una asignación solo identifica a la persona responsable; no significa que la funcionalidad esté aprobada. Enlaza el Issue desde la PR.
3. **Usa siempre una PR** - Envía cada cambio del repositorio desde una rama temática a una PR dirigida a `main`; nunca envíes commits directamente a `main`.

### Lista de Verificación Pre-Commit

Antes de enviar, ejecuta siempre:

```bash
bun run format     # Formatear código
bun run lint       # Aplicar correcciones seguras de linting
bun run verify:pr  # Validación local estándar; no incluye macOS nativo ni pruebas reales en navegadores
```

Asegúrate de que:

1. Tus cambios logran la funcionalidad deseada.
2. Tus cambios no afectan negativamente a las funciones existentes.
3. La PR registra las versiones de navegador, los artefactos, los resultados y las evidencias exigidas por la [matriz de pruebas de navegador](BROWSER_TESTING.md).

---

## Estrategia de Pruebas

Las pruebas deben cubrir la interfaz con mayor riesgo de regresión, en lugar de omitirlas según el tipo de archivo:

1. **Lógica y estado**: Los servicios principales, el almacenamiento, los analizadores, las utilidades y el estado complejo de la UI requieren pruebas automatizadas.
2. **Content scripts / DOM**: Cuando cambien los selectores, el montaje y desmontaje, la navegación SPA o los contratos con el DOM de terceros, añade una prueba de regresión con un fixture DOM mínimo.
3. **Navegadores reales**: Las pruebas automatizadas no sustituyen la carga de la extensión ni la comprobación del flujo real. Sigue la [matriz de pruebas de navegador](BROWSER_TESTING.md). Un cambio puramente visual puede explicar por qué no resulta útil añadir una prueba unitaria.

---

## Enviar un Pull Request

### Pautas de PR

1. **Título**: Usa un título claro y descriptivo (ej: "feat: add dark mode toggle" o "fix: timeline scroll sync")
2. **Descripción**: Explica qué cambios hiciste y por qué
3. **Impacto en el Usuario**: Describe cómo se verán afectados los usuarios
4. **Prueba Visual (Estricto)**: Para CUALQUIER cambio de UI o nueva funcionalidad, **DEBES** proporcionar capturas de pantalla o grabaciones. **Sin captura = Sin revisión/respuesta.**
5. **Referencia de Problema**: Enlaza problemas relacionados (ej: "Closes #123")
6. **Pruebas y Lógica**: Los cambios de comportamiento deben incluir pruebas automatizadas de regresión pertinentes. Si ninguna prueba resulta útil, explica el motivo y describe claramente la lógica. No se aceptan correcciones "mágicas" sin contexto.
7. **Evidencia por Navegador**: Registra por separado el estado de Chrome, Edge, Firefox y Safari. Si no está disponible un navegador requerido, indica `Needs <browser> test` y una persona responsable; no presentes una compilación correcta como una extensión cargada o probada en el flujo real.

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

Voyager mejora la experiencia de chat de Gemini AI con:

- Navegación por línea de tiempo
- Organización de carpetas
- Bóveda de prompts
- Exportación de chat
- Personalización de UI

> [!NOTE]
> **Consideramos que el conjunto de funcionalidades de Voyager ya es completo y suficiente.** Añadir demasiadas funciones especializadas o excesivamente personalizadas no mejora el software, solo aumenta la carga de mantenimiento. A menos que consideres que una función es verdaderamente esencial y beneficiaría a la mayoría de los usuarios, te pedimos que reconsideres enviar un Feature Request.

**Fuera de alcance**: Scraping de sitios, intercepción de red, automatización de cuentas.

---

## Obtener Ayuda

- 💬 [GitHub Discussions](https://github.com/Nagi-ovo/voyager/discussions) - Haz preguntas
- 🐛 [Issues](https://github.com/Nagi-ovo/voyager/issues) - Reporta errores
- 📖 [Documentación](https://voyager.nagi.fun/) - Lee la documentación

---

## Licencia

Al contribuir, aceptas que tus contribuciones se licenciarán bajo la [Licencia GPLv3](../LICENSE).
