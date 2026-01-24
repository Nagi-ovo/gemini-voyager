// Convenience function for backward compatibility
import { getFormulaCopyService } from './FormulaCopyService';

/**
 * Formula Copy Feature Entry Point
 * Exports the service and provides a simple initialization function
 */

export { FormulaCopyService, getFormulaCopyService } from './FormulaCopyService';
export type { FormulaCopyConfig } from './FormulaCopyService';

export function startFormulaCopy(): void {
  const service = getFormulaCopyService();
  service.initialize();
}

export function stopFormulaCopy(): void {
  const service = getFormulaCopyService();
  service.destroy();
}
