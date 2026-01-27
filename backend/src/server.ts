import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { initIO } from './socket';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import authRoutes from './routes/auth';
import podcastRoutes from './routes/podcasts';
import radioRoutes from './routes/radio';
import jukeboxRoutes from './routes/jukebox';
import { authMiddleware } from './middleware/auth';
import { setupSocketHandlers } from './sockets';

const app = express();
const httpServer = createServer(app);
const io = initIO(httpServer);

// Middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Request logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});
app.use(rateLimit({ windowMs: 60000, max: 500 }));

// Static: Kiosk Web App
app.use('/kiosk', express.static(path.join(__dirname, '../../kiosk-web')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/podcasts', podcastRoutes);
app.use('/api/v1/radio', radioRoutes);

// Jukebox: Kiosk endpoints (no auth required)
app.use('/jukebox', jukeboxRoutes);

// Jukebox: User endpoints (auth handled per-route in jukeboxRoutes)
app.use('/api/v1/jukebox', jukeboxRoutes);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Socket.IO
setupSocketHandlers(io);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Global Error Handler:', err);
    return res.status(err.status || 500).json({
        success: false,
        error: err.name || 'InternalServerError',
        message: err.message || 'An unexpected error occurred'
    });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// io is now accessed via getIO() in other modules
