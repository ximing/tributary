export const SETTINGS_SECTIONS = ['appearance', 'canvas', 'account', 'models', 'agent', 'usage'] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];
