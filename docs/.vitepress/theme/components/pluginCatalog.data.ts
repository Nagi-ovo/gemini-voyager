import { type CatalogPlugin, readCatalog } from './pluginCatalog';

declare const data: CatalogPlugin[];
export { data };

export default {
  watch: ['../../../../src/features/plugins/catalog/**/*.json'],
  load: (): CatalogPlugin[] => readCatalog(),
};
