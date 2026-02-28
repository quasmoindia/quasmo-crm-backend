import { Role } from '../models/Role.js';

/** In-memory cache: role name -> module ids. Refreshed on startup and when roles change. */
const roleModuleCache = new Map<string, string[]>();

export async function loadRoleCache(): Promise<void> {
  roleModuleCache.clear();
  const roles = await Role.find().lean();
  for (const r of roles) {
    roleModuleCache.set(r.name, r.moduleIds ?? []);
  }
}

export function setRoleInCache(name: string, moduleIds: string[]): void {
  roleModuleCache.set(name, moduleIds);
}

export function getRoleModuleIds(roleName: string | undefined): string[] | null {
  if (!roleName || roleName === '') return null;
  const ids = roleModuleCache.get(roleName);
  return ids ?? null;
}

/**
 * Check if role can access module. No role / unknown role = full access (existing users).
 */
export function canAccessModule(roleName: string | undefined, moduleId: string): boolean {
  const moduleIds = getRoleModuleIds(roleName);
  if (moduleIds === null) return true;
  if (moduleIds.includes('*')) return true;
  return moduleIds.includes(moduleId);
}
