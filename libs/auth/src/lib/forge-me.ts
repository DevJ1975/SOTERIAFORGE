import type { Role } from '@assurance/shared';

/** `GET /api/me` from the Forge API (backend/apps/accounts/serializers.py). */
export interface ForgeMe {
  member: {
    id: string;
    uid: string;
    tenantId: string | null;
    email: string;
    displayName: string;
    role: Role;
    status: 'invited' | 'active' | 'deactivated';
  };
  tenant: { id: string; name: string; status: string; branding: Record<string, unknown> } | null;
  canAuthor: boolean;
}

/** Joins the configured API base URL and a path (`/api/me`). */
export function forgeApiUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
