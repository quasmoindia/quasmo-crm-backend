import type { Request, Response } from 'express';
import { Complaint } from '../models/Complaint.js';
import type { ComplaintStatus, ComplaintPriority } from '../models/Complaint.js';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 500;
const BULK_MAX = 100;

type BulkComplaintItem = {
  subject?: string;
  description?: string;
  priority?: ComplaintPriority;
  productModel?: string;
  serialNumber?: string;
  orderReference?: string;
};

export async function createComplaint(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!._id;
    const {
      subject,
      description,
      priority,
      productModel,
      serialNumber,
      orderReference,
    } = req.body as {
      subject?: string;
      description?: string;
      priority?: ComplaintPriority;
      productModel?: string;
      serialNumber?: string;
      orderReference?: string;
    };

    if (!subject?.trim() || !description?.trim()) {
      res.status(400).json({ message: 'Subject and description are required' });
      return;
    }

    const complaint = await Complaint.create({
      user: userId,
      subject: subject.trim(),
      description: description.trim(),
      priority: priority ?? 'medium',
      productModel: productModel?.trim(),
      serialNumber: serialNumber?.trim(),
      orderReference: orderReference?.trim(),
    });

    await complaint.populate('user', 'fullName email');

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
          priority: item.priority ?? 'medium',
          productModel: item.productModel?.trim(),
          serialNumber: item.serialNumber?.trim(),
          orderReference: item.orderReference?.trim(),
        });
      }
    }

    if (toCreate.length === 0) {
      res.status(400).json({ message: 'No valid complaints (subject and description required for each)' });
      return;
    }

    const created = await Complaint.insertMany(
      toCreate.map((c) => ({
        user: userId,
        subject: c.subject,
        description: c.description,
        priority: c.priority ?? 'medium',
        productModel: c.productModel,
        serialNumber: c.serialNumber,
        orderReference: c.orderReference,
      }))
    );

    const populated = await Complaint.find({ _id: { $in: created.map((d) => d._id) } })
      .populate('user', 'fullName email')
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
      search: searchQuery,
      dateFrom,
      dateTo,
      page = DEFAULT_PAGE,
      limit = DEFAULT_LIMIT,
    } = req.query as {
      status?: ComplaintStatus;
      priority?: ComplaintPriority;
      user?: string;
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
    if (searchQuery?.trim()) {
      const term = searchQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
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
        .populate('user', 'fullName email')
        .lean(),
      Complaint.countDocuments(filter),
    ]);

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
    const complaint = await Complaint.findById(id).populate('user', 'fullName email');

    if (!complaint) {
      res.status(404).json({ message: 'Complaint not found' });
      return;
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
      status,
      priority,
      productModel,
      serialNumber,
      orderReference,
      internalNotes,
    } = req.body as {
      subject?: string;
      description?: string;
      status?: ComplaintStatus;
      priority?: ComplaintPriority;
      productModel?: string;
      serialNumber?: string;
      orderReference?: string;
      internalNotes?: string;
    };

    const complaint = await Complaint.findById(id);
    if (!complaint) {
      res.status(404).json({ message: 'Complaint not found' });
      return;
    }

    if (subject !== undefined) complaint.subject = subject.trim();
    if (description !== undefined) complaint.description = description.trim();
    if (status !== undefined) complaint.status = status;
    if (priority !== undefined) complaint.priority = priority;
    if (productModel !== undefined) complaint.productModel = productModel?.trim();
    if (serialNumber !== undefined) complaint.serialNumber = serialNumber?.trim();
    if (orderReference !== undefined) complaint.orderReference = orderReference?.trim();
    if (internalNotes !== undefined) complaint.internalNotes = internalNotes?.trim();

    await complaint.save();
    await complaint.populate('user', 'fullName email');

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
