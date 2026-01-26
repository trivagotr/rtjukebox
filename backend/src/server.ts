import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
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
const io = new Server(httpServer, {
    cors: { origin: process.env.CORS_ORIGIN || '*' }
});

// Middleware
app.use(helmet({
    contentSecurityPolicy: false, // Allow inline scripts for kiosk
}));
app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 60000, max: 100 }));

// Static: Kiosk Web App
app.use('/kiosk', express.static(path.join(__dirname, '../../kiosk-web')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/podcasts', podcastRoutes);
app.use('/api/v1/radio', radioRoutes);

// Jukebox: Kiosk endpoints (no auth required)
app.use('/jukebox', jukeboxRoutes);

// Jukebox: User endpoints (auth required) 
app.use('/api/v1/jukebox', authMiddleware, jukeboxRoutes);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Socket.IO
setupSocketHandlers(io);

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

export { io };
