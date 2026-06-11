/** Pure leaderboard display helpers (medals, avatar initials). */

export type Medal = 'gold' | 'silver' | 'bronze';

/** Top-3 medal tint for a 1-based rank, or null below the podium. */
export function medalFor(rank: number): Medal | null {
  switch (rank) {
    case 1:
      return 'gold';
    case 2:
      return 'silver';
    case 3:
      return 'bronze';
    default:
      return null;
  }
}

/** Uppercased first letter for the avatar-initial disc ('?' when unknown). */
export function initialOf(name?: string | null): string {
  const trimmed = name?.trim();
  if (!trimmed) return '?';
  return trimmed.charAt(0).toLocaleUpperCase();
}
