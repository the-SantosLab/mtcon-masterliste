/**
 * Benutzer, bei denen die farbliche Dringlichkeits-Markierung NIE ausgeblendet
 * wird – auch dann nicht, wenn alle eigenen Unteraufgaben erledigt sind.
 */
export const URGENCY_MUTE_EXEMPT_USER_IDS = new Set<string>([
  '3e60592f-f1df-4618-b9bf-db7d35dbdc29', // Mario Tolj
  'bb4492e4-2f06-46f1-80b4-1d41ae322f5b', // Johannes Schaffer
]);

export function urgencyMuteEnabled(userId?: string | null): boolean {
  return !!userId && !URGENCY_MUTE_EXEMPT_USER_IDS.has(userId);
}
