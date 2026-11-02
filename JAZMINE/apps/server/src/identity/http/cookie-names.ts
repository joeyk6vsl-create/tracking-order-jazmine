import type { AppConfig } from '../../config';
export function sessionName(config: AppConfig) {
  return `${config.production ? '__Host-' : ''}${config.recoveryMode ? 'jazmine_recovery' : 'jazmine'}_session`;
}
export function csrfName(config: AppConfig) {
  return `${config.production ? '__Host-' : ''}${config.recoveryMode ? 'jazmine_recovery' : 'jazmine'}_csrf`;
}
