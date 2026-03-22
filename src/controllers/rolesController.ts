import type { Request, Response } from 'express';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { loadRoleCache, setRoleInCache } from '../services/roleCache.js';
import { MODULE_IDS, MODULE_LABELS } from '../config/roles.js';

export async function listRoles(req: Request, res: Response): Promise<void> {
  try {
    const roles = await Role.find().sort({ name: 1 }).lean();
    res.json({ data: roles });
  } catch {
    res.status(500).json({ message: 'Failed to list roles' });
  }
}

export async function createRole(req: Request, res: Response): Promise<void> {
  try {
    const { name, label, moduleIds } = req.body as {
      name?: string;
      label?: string;
      moduleIds?: string[];
    };
    const trimmedName = name?.trim()?.toLowerCase();
    if (!trimmedName || !label?.trim()) {
      res.status(400).json({ message: 'Name and label are required' });
      return;
    }
    const existing = await Role.findOne({ name: trimmedName });
    if (existing) {
      res.status(409).json({ message: 'A role with this name already exists' });
      return;
    }
    const validModuleIds = Array.isArray(moduleIds)
      ? moduleIds.filter(
          (id) => typeof id === 'string' && (id === '*' || MODULE_IDS.includes(id as typeof MODULE_IDS[number]))
        )
      : [];
    const role = await Role.create({
      name: trimmedName,
      label: label.trim(),
      moduleIds: validModuleIds,
    });
    setRoleInCache(role.name, role.moduleIds);
    res.status(201).json(role);
  } catch (err) {
    const error = err as Error & { name?: string };
    if (error.name === 'ValidationError') {
      res.status(400).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: 'Failed to create role' });
  }
}

export async function updateRole(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { label, moduleIds } = req.body as { label?: string; moduleIds?: string[] };
    const role = await Role.findById(id);
    if (!role) {
      res.status(404).json({ message: 'Role not found' });
      return;
    }
    if (label !== undefined) role.label = label.trim();
    if (Array.isArray(moduleIds)) {
      role.moduleIds = moduleIds.filter(
        (id) => typeof id === 'string' && (id === '*' || MODULE_IDS.includes(id as typeof MODULE_IDS[number]))
      );
    }
    await role.save();
    setRoleInCache(role.name, role.moduleIds);
    res.json(role);
  } catch (err) {
    const error = err as Error & { name?: string };
    if (error.name === 'ValidationError') {
      res.status(400).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: 'Failed to update role' });
  }
}

export async function deleteRole(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const role = await Role.findById(id);
    if (!role) {
      res.status(404).json({ message: 'Role not found' });
      return;
    }
    if (role.name === 'admin') {
      res.status(403).json({ message: 'The admin role cannot be deleted' });
      return;
    }
    const assigned = await User.countDocuments({ role: role.name });
    if (assigned > 0) {
      res.status(409).json({
        message: `Cannot delete this role: ${assigned} user(s) are still assigned to "${role.label}". Reassign them first.`,
      });
      return;
    }
    await Role.deleteOne({ _id: id });
    await loadRoleCache();
    res.json({ message: 'Role deleted' });
  } catch {
    res.status(500).json({ message: 'Failed to delete role' });
  }
}

export async function getModules(_req: Request, res: Response): Promise<void> {
  try {
    const modules = MODULE_IDS.map((id) => ({ id, label: MODULE_LABELS[id] ?? id }));
    res.json({ data: modules });
  } catch {
    res.status(500).json({ message: 'Failed to load modules' });
  }
}
