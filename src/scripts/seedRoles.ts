import { Role } from '../models/Role.js';
import { DEFAULT_ROLES } from '../config/roles.js';
import { loadRoleCache } from '../services/roleCache.js';

export async function seedRolesIfNeeded(): Promise<void> {
  const count = await Role.countDocuments();
  if (count > 0) {
    await loadRoleCache();
    return;
  }
  await Role.insertMany(DEFAULT_ROLES);
  await loadRoleCache();
}
