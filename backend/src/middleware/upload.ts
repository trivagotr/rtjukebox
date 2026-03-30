import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { looksMojibake, normalizeFilename } from '../utils/textNormalization';

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
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
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
        fileSize: 5 * 1024 * 1024 // 5MB
    }
});

// Song upload configuration
const songUploadDir = 'uploads/songs';

if (!fs.existsSync(songUploadDir)) {
    fs.mkdirSync(songUploadDir, { recursive: true });
}

export function normalizeUploadedSongFilename(originalName: string): string {
    const normalizedOriginal = normalizeFilename(originalName);
    if (!looksMojibake(originalName)) {
        return normalizedOriginal;
    }

    const utf8Name = Buffer.from(originalName, 'latin1').toString('utf8');
    return normalizeFilename(utf8Name);
}

const songStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, songUploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, normalizeUploadedSongFilename(file.originalname));
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
