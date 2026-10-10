/**
 * Bundled in place of `webextension-polyfill`, which refuses to load outside
 * an extension. Exports the same in-memory API the bench installs as `chrome`.
 */
import { installExtensionApiStub } from './extensionApi';

const browser = installExtensionApiStub();

export default browser;
