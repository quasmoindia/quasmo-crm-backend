/**
 * Dynamic roles and modules config.
 * Add new roles and modules here; existing users with no/unknown role get full access.
 */

export const MODULE_IDS = [
  'dashboard',
  'users',
  'roles',
  'complaints',
  'leads',
  'invoices',
  // 'sales',
  // 'finance',
  // 'content',
] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

export const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  users: 'User management',
  roles: 'Role management',
  complaints: 'Complaint management',
  leads: 'Lead management',
  invoices: 'Tax invoices',
  // sales: 'Sales management',
  // finance: 'Finance management',
  // content: 'Content',
};

/** Role id -> display label */
export const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  user: 'User',
  viewer: 'Viewer',
  // content_writer: 'Content writer',
  // sales_manager: 'Sales manager',
  technician: 'Technician',
};

/** Role id -> module ids (use '*' for full access) */
export const ROLE_MODULE_MAP: Record<string, readonly string[]> = {
  admin: ['*'],
  user: ['dashboard', 'complaints', 'leads', 'invoices'],
  viewer: ['dashboard'],
  // content_writer: ['dashboard', 'content'],
  // sales_manager: ['dashboard', 'sales', 'leads'],
  technician: ['dashboard', 'complaints'],
};

export function getRolesForApi(): { id: string; label: string }[] {
  return Object.entries(ROLE_LABELS).map(([id, label]) => ({ id, label }));
}

export function getModulesForApi(): { id: string; label: string }[] {
  return MODULE_IDS.map((id) => ({ id, label: MODULE_LABELS[id] ?? id }));
}

export function isKnownRole(role: string): boolean {
  return role in ROLE_LABELS;
}

/** Default roles to seed when DB is empty (also used by seed) */
export const DEFAULT_ROLES: { name: string; label: string; moduleIds: string[] }[] = [
  { name: 'admin', label: 'Admin', moduleIds: ['*'] },
  { name: 'user', label: 'User', moduleIds: ['dashboard', 'complaints', 'leads', 'invoices'] },
  { name: 'viewer', label: 'Viewer', moduleIds: ['dashboard'] },
  // { name: 'content_writer', label: 'Content writer', moduleIds: ['dashboard', 'content'] },
  // { name: 'sales_manager', label: 'Sales manager', moduleIds: ['dashboard', 'sales', 'leads'] },
  { name: 'technician', label: 'Technician', moduleIds: ['dashboard', 'complaints'] },
];
