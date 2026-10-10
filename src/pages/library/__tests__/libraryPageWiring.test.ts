import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { LIBRARY_PAGE_PATH } from '@/features/savedLibrary/openLibraryPage';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Library page packaging', () => {
  it('does not expose the Library HTML to web pages', () => {
    for (const name of ['manifest.json', 'manifest.dev.json']) {
      const manifest = JSON.parse(read(name)) as {
        web_accessible_resources?: Array<{ resources: string[] }>;
      };
      const resources =
        manifest.web_accessible_resources?.flatMap((entry) => entry.resources) ?? [];
      expect(resources, name).not.toContain(LIBRARY_PAGE_PATH);
      expect(
        resources.some((resource) => resource.includes('library')),
        name,
      ).toBe(false);
      expect(resources, name).not.toContain('src/*');
    }
  });

  it('packages the emitted Library HTML and chunks under Safari folder resources', () => {
    const project = read('Voyager/Voyager.xcodeproj/project.pbxproj');
    for (const directory of ['src', 'assets']) {
      expect(project).toContain(
        `lastKnownFileType = folder; name = ${directory}; path = ../../dist_safari/${directory}`,
      );
      expect(project).toContain(`/* ${directory} in Resources */`);
    }
  });
});
