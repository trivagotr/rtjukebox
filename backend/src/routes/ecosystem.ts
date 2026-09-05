import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireErpPermission } from '../middleware/erpPermission';
import { fetchTicketsByEmail } from '../services/ecosystemClient';

const router = Router();

router.get('/tickets', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const tickets = await fetchTicketsByEmail(req.user!.email);
        return res.json({ data: tickets, meta: { count: tickets.length } });
    } catch (error) {
        console.error('Bilet adapter request failed');
        return res.status(502).json({ error: 'Bilet bilgileri şu anda alınamıyor' });
    }
});

router.get(
    '/room-access',
    authMiddleware,
    requireErpPermission('room.attendance'),
    (_req: AuthRequest, res: Response) => res.json({
        data: {
            enabled: true,
            mode: 'rotating_room_qr',
            display_url: 'https://radiotedu.com/qr',
            instructions: 'Odada gösterilen QR kodunu telefonunuzun kamerasıyla tarayın ve ERP hesabınızla onaylayın.',
        },
    }),
);

export default router;
