import type { Express } from 'express';

/**
 * Shared rules for complaint/lead file uploads (ImageKit).
 * Allows most document/media types; blocks common executable extensions and risky MIME types.
 */
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

const BLOCKED_EXTENSIONS = new Set([
  'exe',
  'bat',
  'cmd',
  'scr',
  'msi',
  'dll',
  'com',
  'pif',
  'vbs',
  'app',
  'deb',
  'dmg',
  'pkg',
]);

const BLOCKED_MIME_SUBSTRINGS = ['x-msdownload', 'x-dosexec', 'x-msdos-program'];

function extensionFromOriginalName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? '';
  const i = base.lastIndexOf('.');
  return i >= 0 ? base.slice(i + 1).toLowerCase() : '';
}

/** Returns an error message if invalid, or null if OK. */
export function validateAttachmentFile(file: Express.Multer.File): string | null {
  const ext = extensionFromOriginalName(file.originalname || '');
  if (ext && BLOCKED_EXTENSIONS.has(ext)) {
    return `${file.originalname}: this file type cannot be uploaded for security reasons`;
  }
  const mime = (file.mimetype || '').toLowerCase();
  for (const bad of BLOCKED_MIME_SUBSTRINGS) {
    if (mime.includes(bad)) {
      return `${file.originalname}: executable files are not allowed`;
    }
  }
  return null;
}
