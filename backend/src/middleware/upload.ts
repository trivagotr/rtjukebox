import multer from 'multer';
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import type { RequestHandler } from 'express';
import { normalizeFilename } from '../utils/textNormalization';

const uploadDir = 'uploads/avatars';

// Ensure directory exists
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, `avatar-${randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
    }
});

const fileFilter = (req: any, file: any, cb: any) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only images are allowed!'), false);
    }
};

export const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 2 * 1024 * 1024 // 2MB
    }
});

// Song upload configuration
export const songUploadDir = 'uploads/songs';

if (!fs.existsSync(songUploadDir)) {
    fs.mkdirSync(songUploadDir, { recursive: true });
}

export function normalizeUploadedSongFilename(originalName: string): string {
    return normalizeFilename(originalName);
}

const songStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, songUploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, `song-upload-${randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
    }
});

const songFileFilter = (req: any, file: any, cb: any) => {
    const allowedMimes = ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/mp3'];
    if (allowedMimes.includes(file.mimetype) || file.originalname.match(/\.(mp3|m4a|wav)$/i)) {
        cb(null, true);
    } else {
        cb(new Error('Only audio files (MP3, M4A, WAV) are allowed!'), false);
    }
};

export const songUpload = multer({
    storage: songStorage,
    fileFilter: songFileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB max per song
    }
});

async function readUploadHeader(filePath: string) {
    const handle = await fs.promises.open(filePath, 'r');
    try {
        const header = Buffer.alloc(12);
        const { bytesRead } = await handle.read(header, 0, header.length, 0);
        return header.subarray(0, bytesRead);
    } finally {
        await handle.close();
    }
}

export function detectAvatarExtension(header: Buffer): string | null {
    if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return '.jpg';
    if (header.length >= 8 && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
    if (header.length >= 6 && ['GIF87a', 'GIF89a'].includes(header.toString('ascii', 0, 6))) return '.gif';
    if (header.length >= 12 && header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP') return '.webp';
    return null;
}

export function detectSongExtension(header: Buffer): string | null {
    if (header.length >= 3 && header.toString('ascii', 0, 3) === 'ID3') return '.mp3';
    if (header.length >= 2 && header[0] === 0xff && (header[1] & 0xe0) === 0xe0) return '.mp3';
    if (header.length >= 12 && header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WAVE') return '.wav';
    if (header.length >= 8 && header.toString('ascii', 4, 8) === 'ftyp') return '.m4a';
    return null;
}

function probeSongFile(filePath: string, expectedExtension: string): Promise<boolean> {
    return new Promise((resolve) => {
        ffmpeg.ffprobe(filePath, (error, metadata) => {
            if (error) return resolve(false);
            const formatNames = String(metadata.format?.format_name || '').toLowerCase().split(',');
            const duration = Number(metadata.format?.duration);
            const hasAudio = metadata.streams?.some((stream) => stream.codec_type === 'audio') ?? false;
            const matchesContainer = expectedExtension === '.mp3'
                ? formatNames.includes('mp3')
                : expectedExtension === '.wav'
                    ? formatNames.includes('wav')
                    : formatNames.some((format) => ['mov', 'mp4', 'm4a', '3gp', '3g2', 'mj2'].includes(format));

            resolve(hasAudio && matchesContainer && Number.isFinite(duration) && duration > 0 && duration <= 4 * 60 * 60);
        });
    });
}

function validateUpload(detectExtension: (header: Buffer) => string | null, probeAudio = false): RequestHandler {
    return async (req, res, next) => {
        const file = req.file;
        if (!file) return next();

        try {
            const detectedExtension = detectExtension(await readUploadHeader(file.path));
            const suppliedExtension = path.extname(file.originalname).toLowerCase();
            const extensionsMatch = detectedExtension === '.jpg'
                ? ['.jpg', '.jpeg'].includes(suppliedExtension)
                : detectedExtension === suppliedExtension;

            const audioContainerValid = detectedExtension && probeAudio
                ? await probeSongFile(file.path, detectedExtension)
                : true;
            if (!detectedExtension || !extensionsMatch || !audioContainerValid) {
                await fs.promises.unlink(file.path).catch(() => undefined);
                return res.status(400).json({ success: false, error: 'Unsupported or invalid file content' });
            }

            next();
        } catch (error) {
            await fs.promises.unlink(file.path).catch(() => undefined);
            next(error);
        }
    };
}

export const validateAvatarUpload = validateUpload(detectAvatarExtension);
export const validateSongUpload = validateUpload(detectSongExtension, true);
