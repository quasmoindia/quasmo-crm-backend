import type { Request, Response } from 'express';
import { Role } from '../models/Role.js';
import { getModulesForApi } from '../config/roles.js';

export async function getRolesConfig(req: Request, res: Response): Promise<void> {
  try {
    const roles = await Role.find().sort({ name: 1 }).select('name label moduleIds').lean();
    res.json({
      roles: roles.map((r) => ({ id: r.name, label: r.label, moduleIds: r.moduleIds ?? [] })),
      modules: getModulesForApi(),
    });
  } catch {
    res.status(500).json({ message: 'Failed to load config' });
  }
}
