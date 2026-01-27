import multer from 'multer';
import path from 'path';
import fs from 'fs';

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

const songStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, songUploadDir);
    },
    filename: (req, file, cb) => {
        // Multer handles filenames as Latin1. We need to convert it back to UTF-8
        // to preserve Turkish characters correctly.
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');

        // Keep original filename but sanitize it fairly (allow Turkish characters and spaces)
        let safeName = originalName.replace(/[^a-zA-Z0-9çÇğĞıİöÖşŞüÜ\-_. ]/g, '');

        // Ensure no multiple spaces or weirdness
        safeName = safeName.trim();

        cb(null, safeName);
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
