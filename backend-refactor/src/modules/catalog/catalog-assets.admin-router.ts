import { Router, type RequestHandler } from 'express';
import multer, { MulterError } from 'multer';
import { rateLimit } from 'express-rate-limit';
import { AppError, ValidationError } from '../../core/errors/app-error.js';
import type { JobQueue } from '../../core/ports/job-queue.port.js';
import { asyncHandler } from '../../core/http/async-handler.js';
import type { CatalogAssetsService } from './catalog-assets.service.js';
import { z } from 'zod';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024, files: 1, fields: 0, parts: 1 } });
const emptySchema = z.object({}).strict();
const processSongSchema = z.object({ song_id: z.string().uuid() }).strict();

function uploadSongMiddleware(): RequestHandler {
  const parse = upload.single('song');
  return (req, res, next) => parse(req, res, (error: unknown) => {
    if (error instanceof MulterError && error.code === 'LIMIT_FILE_SIZE') { next(new AppError('Audio upload exceeds the 50 MB limit', 413, 'UPLOAD_TOO_LARGE')); return; }
    if (error instanceof MulterError) { next(new AppError('Invalid audio upload', 400, 'INVALID_UPLOAD')); return; }
    next(error);
  });
}

export function createCatalogAssetsAdminRouter(assets: CatalogAssetsService, jobs: JobQueue) {
  const router = Router();
  const uploadRateLimit = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });

  router.post('/upload-song', uploadRateLimit, uploadSongMiddleware(), asyncHandler(async (req) => {
    if (!req.user) throw new ValidationError('Authenticated administrator required');
    if (!req.file || Object.keys(req.body ?? {}).length || Object.keys(req.query).length) throw new ValidationError('One audio file is required');
    const uploaded = await assets.uploadSong(req.file.originalname, req.file.buffer);
    if (uploaded.status === 'duplicate') throw new AppError('Song file already exists', 409, 'DUPLICATE_SONG');
    const job = uploaded.status === 'created'
      ? await jobs.enqueue('process-song', { requestedBy: req.user.userId, songId: uploaded.song.id }, { jobId: assets.createJobId() }).catch(() => null)
      : null;
    const response = { song: uploaded.song, filename: uploaded.filename, process_job_id: job?.jobId ?? null, processing_pending: uploaded.status === 'created' && !job };
    req.res!.status(uploaded.status === 'created' ? 201 : 200).json({ success: true, data: response, message: uploaded.status === 'reactivated' ? 'Song reactivated' : 'Song uploaded' });
  }));

  router.post('/scan-folder', asyncHandler(async (req) => {
    if (!req.user || !emptySchema.safeParse(req.body ?? {}).success || Object.keys(req.query).length) throw new ValidationError('Invalid scan request');
    const job = await jobs.enqueue('scan-folder', { requestedBy: req.user.userId }, { jobId: assets.createJobId() });
    req.res!.status(202).json({ success: true, data: { job_id: job.jobId, state: 'queued' }, message: 'Folder scan queued' });
  }));

  router.post('/process-song', asyncHandler(async (req) => {
    const body = processSongSchema.safeParse(req.body);
    if (!req.user || !body.success || Object.keys(req.query).length) throw new ValidationError('Invalid process-song request');
    const job = await jobs.enqueue('process-song', { requestedBy: req.user.userId, songId: body.data.song_id }, { jobId: assets.createJobId() });
    req.res!.status(202).json({ success: true, data: { job_id: job.jobId, state: 'queued' }, message: 'Song processing queued' });
  }));

  router.post('/sync-metadata', asyncHandler(async (req) => {
    if (!req.user || !emptySchema.safeParse(req.body ?? {}).success || Object.keys(req.query).length) throw new ValidationError('Invalid metadata sync request');
    const job = await jobs.enqueue('sync-metadata', { requestedBy: req.user.userId }, { jobId: assets.createJobId() });
    req.res!.status(202).json({ success: true, data: { job_id: job.jobId, state: 'queued' }, message: 'Metadata sync queued' });
  }));

  return router;
}
