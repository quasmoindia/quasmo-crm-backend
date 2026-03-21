import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Complaint } from '../models/Complaint.js';
import type { ComplaintStatus, ComplaintPriority } from '../models/Complaint.js';
import { imagekit, isImageKitConfigured } from '../lib/imagekit.js';
import { validateAttachmentFile, MAX_ATTACHMENT_BYTES } from '../lib/uploadAttachment.js';
import { allocateNextComplaintTicketId } from '../lib/complaintTicketId.js';

/** Assign ticket ids to lean list rows missing them (legacy data). */
async function ensureLeanComplaintsHaveTicketIds(
  docs: Array<{ _id: mongoose.Types.ObjectId; ticketId?: string | null | undefined }>
): Promise<void> {
  for (const doc of docs) {
    if (doc.ticketId) continue;
    const tid = await allocateNextComplaintTicketId();
    await Complaint.updateOne({ _id: doc._id }, { $set: { ticketId: tid } });
    doc.ticketId = tid;
  }
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 500;
const BULK_MAX = 100;

type BulkComplaintItem = {
  subject?: string;
  description?: string;
  phone?: string;
  priority?: ComplaintPriority;
  productModel?: string;
  serialNumber?: string;
  orderReference?: string;
  assignedTo?: string;
};

export async function createComplaint(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!._id;
    const {
      subject,
      description,
      phone,
      priority,
      productModel,
      serialNumber,
      orderReference,
      assignedTo,
    } = req.body as {
      subject?: string;
      description?: string;
      phone?: string;
      priority?: ComplaintPriority;
      productModel?: string;
      serialNumber?: string;
      orderReference?: string;
      assignedTo?: string;
    };

    if (!subject?.trim() || !description?.trim()) {
      res.status(400).json({ message: 'Subject and description are required' });
      return;
    }

    const ticketId = await allocateNextComplaintTicketId();
    const complaint = await Complaint.create({
      ticketId,
      user: userId,
      createdBy: userId,
      subject: subject.trim(),
      description: description.trim(),
      phone: phone?.trim(),
      priority: priority ?? 'medium',
      productModel: productModel?.trim(),
      serialNumber: serialNumber?.trim(),
      orderReference: orderReference?.trim(),
      assignedTo: assignedTo || undefined,
    });

    await complaint.populate('user', 'fullName email phone');
    await complaint.populate('assignedTo', 'fullName email');
    await complaint.populate('createdBy', 'fullName email');

    res.status(201).json(complaint);
  } catch (err) {
    const error = err as Error & { name?: string };
    console.error('Create complaint error:', error);
    if (error.name === 'ValidationError') {
      res.status(400).json({ message: error.message });
      return;
    }
    res.status(500).json({
      message: 'Failed to create complaint',
      ...(process.env.NODE_ENV !== 'production' && { detail: error.message }),
    });
  }
}

export async function createComplaintsBulk(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!._id;
    const { complaints: items } = req.body as { complaints?: BulkComplaintItem[] };

    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ message: 'complaints array is required and must not be empty' });
      return;
    }
    if (items.length > BULK_MAX) {
      res.status(400).json({ message: `Maximum ${BULK_MAX} complaints per request` });
      return;
    }

    const toCreate: BulkComplaintItem[] = [];
    for (const item of items) {
      if (item?.subject?.trim() && item?.description?.trim()) {
        toCreate.push({
          subject: item.subject.trim(),
          description: item.description.trim(),
          phone: item.phone?.trim(),
          priority: item.priority ?? 'medium',
          productModel: item.productModel?.trim(),
          serialNumber: item.serialNumber?.trim(),
          orderReference: item.orderReference?.trim(),
          assignedTo: item.assignedTo,
        });
      }
    }

    if (toCreate.length === 0) {
      res.status(400).json({ message: 'No valid complaints (subject and description required for each)' });
      return;
    }

    const ticketIds = await Promise.all(
      Array.from({ length: toCreate.length }, () => allocateNextComplaintTicketId())
    );
    const created = await Complaint.insertMany(
      toCreate.map((c, i) => ({
        ticketId: ticketIds[i],
        user: userId,
        createdBy: userId,
        subject: c.subject,
        description: c.description,
        phone: c.phone,
        priority: c.priority ?? 'medium',
        productModel: c.productModel,
        serialNumber: c.serialNumber,
        orderReference: c.orderReference,
        assignedTo: c.assignedTo || undefined,
      }))
    );

    const populated = await Complaint.find({ _id: { $in: created.map((d) => d._id) } })
      .populate('user', 'fullName email phone')
      .populate('assignedTo', 'fullName email')
      .populate('createdBy', 'fullName email')
      .lean();

    res.status(201).json({
      message: `${created.length} complaint(s) created`,
      created: created.length,
      data: populated,
    });
  } catch (err) {
    const error = err as Error & { name?: string };
    console.error('Bulk create complaints error:', error);
    res.status(500).json({
      message: 'Failed to create complaints in bulk',
      ...(process.env.NODE_ENV !== 'production' && { detail: error.message }),
    });
  }
}

export async function listComplaints(req: Request, res: Response): Promise<void> {
  try {
    const {
      status,
      priority,
      user: userIdFilter,
      assignedTo: assignedToFilter,
      search: searchQuery,
      dateFrom,
      dateTo,
      page = DEFAULT_PAGE,
      limit = DEFAULT_LIMIT,
    } = req.query as {
      status?: ComplaintStatus;
      priority?: ComplaintPriority;
      user?: string;
      assignedTo?: string;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
      page?: string;
      limit?: string;
    };

    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (userIdFilter) filter.user = userIdFilter;
    if (assignedToFilter) filter.assignedTo = assignedToFilter;
    if (searchQuery?.trim()) {
      const term = searchQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { ticketId: { $regex: term, $options: 'i' } },
        { subject: { $regex: term, $options: 'i' } },
        { description: { $regex: term, $options: 'i' } },
      ];
    }
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) (filter.createdAt as Record<string, Date>).$gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        (filter.createdAt as Record<string, Date>).$lte = end;
      }
    }

    const pageNum = Math.max(1, parseInt(String(page), 10) || DEFAULT_PAGE);
    const limitNum = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(String(limit), 10) || DEFAULT_LIMIT)
    );
    const skip = (pageNum - 1) * limitNum;

    const [complaints, total] = await Promise.all([
      Complaint.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('user', 'fullName email phone')
        .populate('assignedTo', 'fullName email')
        .populate('createdBy', 'fullName email')
        .populate('updatedBy', 'fullName email')
        .populate('closedBy', 'fullName email')
        .lean(),
      Complaint.countDocuments(filter),
    ]);

    await ensureLeanComplaintsHaveTicketIds(complaints);

    res.json({
      data: complaints,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch {
    res.status(500).json({ message: 'Failed to list complaints' });
  }
}

export async function getComplaintById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const complaint = await Complaint.findById(id)
      .populate('user', 'fullName email phone')
      .populate('assignedTo', 'fullName email')
      .populate('createdBy', 'fullName email')
      .populate('updatedBy', 'fullName email')
      .populate('closedBy', 'fullName email')
      .populate('comments.author', 'fullName email');

    if (!complaint) {
      res.status(404).json({ message: 'Complaint not found' });
      return;
    }

    if (!complaint.ticketId) {
      complaint.ticketId = await allocateNextComplaintTicketId();
      await complaint.save();
    }

    res.json(complaint);
  } catch {
    res.status(500).json({ message: 'Failed to get complaint' });
  }
}

export async function updateComplaint(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const {
      subject,
      description,
      phone,
      status,
      priority,
      productModel,
      serialNumber,
      orderReference,
      internalNotes,
      assignedTo,
    } = req.body as {
      subject?: string;
      description?: string;
      phone?: string;
      status?: ComplaintStatus;
      priority?: ComplaintPriority;
      productModel?: string;
      serialNumber?: string;
      orderReference?: string;
      internalNotes?: string;
      assignedTo?: string | null;
    };

    const complaint = await Complaint.findById(id);
    if (!complaint) {
      res.status(404).json({ message: 'Complaint not found' });
      return;
    }

    if (!complaint.ticketId) {
      complaint.ticketId = await allocateNextComplaintTicketId();
    }

    const currentUserId = req.user!._id;
    complaint.updatedBy = currentUserId as unknown as mongoose.Types.ObjectId;

    if (subject !== undefined) complaint.subject = subject.trim();
    if (description !== undefined) complaint.description = description.trim();
    if (phone !== undefined) complaint.phone = phone?.trim();
    if (status !== undefined) {
      complaint.status = status;
      if (status === 'closed') {
        complaint.closedBy = currentUserId as unknown as mongoose.Types.ObjectId;
        complaint.closedAt = new Date();
      }
    }
    if (priority !== undefined) complaint.priority = priority;
    if (productModel !== undefined) complaint.productModel = productModel?.trim();
    if (serialNumber !== undefined) complaint.serialNumber = serialNumber?.trim();
    if (orderReference !== undefined) complaint.orderReference = orderReference?.trim();
    if (internalNotes !== undefined) complaint.internalNotes = internalNotes?.trim();
    if (assignedTo !== undefined) complaint.assignedTo = assignedTo ? (assignedTo as unknown as mongoose.Types.ObjectId) : undefined;

    await complaint.save();
    await complaint.populate('user', 'fullName email phone');
    await complaint.populate('assignedTo', 'fullName email');
    await complaint.populate('createdBy', 'fullName email');
    await complaint.populate('updatedBy', 'fullName email');
    await complaint.populate('closedBy', 'fullName email');
    await complaint.populate('comments.author', 'fullName email');

    res.json(complaint);
  } catch (err) {
    const error = err as Error & { name?: string };
    if (error.name === 'ValidationError') {
      res.status(400).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: 'Failed to update complaint' });
  }
}

export async function deleteComplaint(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const complaint = await Complaint.findByIdAndDelete(id);

    if (!complaint) {
      res.status(404).json({ message: 'Complaint not found' });
      return;
    }

    res.status(204).send();
  } catch {
    res.status(500).json({ message: 'Failed to delete complaint' });
  }
}

export async function listAssignableUsers(req: Request, res: Response): Promise<void> {
  try {
    const { User } = await import('../models/User.js');
    const users = await User.find()
      .select('_id fullName email')
      .sort({ fullName: 1 })
      .lean();
    res.json({ data: users });
  } catch {
    res.status(500).json({ message: 'Failed to list users' });
  }
}

export async function addComplaintComment(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { text } = req.body as { text?: string };

    if (!text?.trim()) {
      res.status(400).json({ message: 'Comment text is required' });
      return;
    }

    const complaint = await Complaint.findById(id);
    if (!complaint) {
      res.status(404).json({ message: 'Complaint not found' });
      return;
    }

    complaint.comments = complaint.comments ?? [];
    complaint.comments.push({
      author: req.user!._id,
      text: text.trim(),
      createdAt: new Date(),
    });
    if (!complaint.ticketId) {
      complaint.ticketId = await allocateNextComplaintTicketId();
    }
    await complaint.save();

    await complaint.populate('user', 'fullName email phone');
    await complaint.populate('assignedTo', 'fullName email');
    await complaint.populate('createdBy', 'fullName email');
    await complaint.populate('updatedBy', 'fullName email');
    await complaint.populate('closedBy', 'fullName email');
    await complaint.populate('comments.author', 'fullName email');

    res.status(201).json(complaint);
  } catch (err) {
    console.error('Add complaint comment error:', err);
    res.status(500).json({ message: 'Failed to add comment' });
  }
}

const MAX_FILES_PER_UPLOAD = 10;

export async function uploadComplaintImages(req: Request, res: Response): Promise<void> {
  try {
    if (!isImageKitConfigured()) {
      res.status(503).json({ message: 'File upload is not configured' });
      return;
    }

    const { id } = req.params;
    const complaint = await Complaint.findById(id);
    if (!complaint) {
      res.status(404).json({ message: 'Complaint not found' });
      return;
    }

    if (!complaint.ticketId) {
      complaint.ticketId = await allocateNextComplaintTicketId();
      await complaint.save();
    }

    const status = complaint.status as ComplaintStatus;
    if (status !== 'in_progress' && status !== 'resolved') {
      res.status(400).json({
        message: 'Files can only be uploaded when status is In progress or Resolved',
      });
      return;
    }

    const files = (req as Request & { files?: Express.Multer.File[] }).files;
    if (!Array.isArray(files) || files.length === 0) {
      res.status(400).json({ message: 'No files uploaded. Use field name "images".' });
      return;
    }
    if (files.length > MAX_FILES_PER_UPLOAD) {
      res.status(400).json({ message: `Maximum ${MAX_FILES_PER_UPLOAD} files per upload` });
      return;
    }

    const urls: string[] = [];
    const errors: string[] = [];

    for (const file of files) {
      if (!file.buffer) {
        errors.push(`${file.originalname}: no file data`);
        continue;
      }
      const blocked = validateAttachmentFile(file);
      if (blocked) {
        errors.push(blocked);
        continue;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        errors.push(`${file.originalname}: file too large (max ${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))}MB)`);
        continue;
      }

      const base = file.originalname?.replace(/[^a-zA-Z0-9._-]/g, '_') || 'file';
      const extFromName = base.includes('.') ? base.slice(base.lastIndexOf('.')) : '';
      const mime = file.mimetype || '';
      const fallbackExt =
        extFromName ||
        (mime === 'application/pdf'
          ? '.pdf'
          : mime.startsWith('image/')
            ? '.jpg'
            : '');
      const fileName = `complaints/${id}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}${fallbackExt}`;

      try {
        const result = await imagekit.upload({
          file: file.buffer,
          fileName,
          folder: '/crm/complaints',
          useUniqueFileName: true,
        });
        const data = result as { url?: string };
        if (data?.url) {
          urls.push(data.url);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        errors.push(`${file.originalname}: ${msg}`);
      }
    }

    if (urls.length > 0) {
      complaint.images = complaint.images ?? [];
      complaint.images.push(...urls);
      await complaint.save();
    }

    res.status(201).json({
      uploaded: urls.length,
      failed: errors.length,
      urls,
      errors: errors.slice(0, 20),
    });
  } catch (err) {
    console.error('Upload complaint images error:', err);
    res.status(500).json({ message: 'Failed to upload files' });
  }
}
