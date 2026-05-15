// Hardcoded Master-User UUIDs (Mario Tolj, Igor Petreski).
// Diese User dürfen Unteraufgaben jedes Erstellers bearbeiten/löschen
// und sehen die privaten CEO-/CTO-Bereiche.
export const MASTER_USER_IDS = [
  '3e60592f-f1df-4618-b9bf-db7d35dbdc29', // Mario Tolj (CEO)
  '6da81b97-5ab7-4601-9130-8ebbb4a70e3e', // Igor Petreski (CTO)
  'bb4492e4-2f06-46f1-80b4-1d41ae322f5b', // js@santoslab.de
] as const;

export const isMasterUser = (userId: string | null | undefined): boolean =>
  !!userId && (MASTER_USER_IDS as readonly string[]).includes(userId);
