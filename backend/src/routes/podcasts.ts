import { Router, Request, Response } from 'express';
import axios from 'axios';

const router = Router();
const WP_API_URL = process.env.WORDPRESS_API_URL || 'https://radiotedu.com/wp-json/wp/v2';
const PODCAST_CATEGORY_ID = process.env.PODCAST_CATEGORY_ID;

// Proxy to WordPress REST API
router.get('/', async (req: Request, res: Response) => {
    try {
        const { page = 1, per_page = 10 } = req.query;

        const response = await axios.get(`${WP_API_URL}/posts`, {
            params: {
                categories: PODCAST_CATEGORY_ID,
                page,
                per_page,
                _embed: 1, // To get featured image
            }
        });

        const items = response.data.map((post: any) => ({
            id: post.id,
            title: post.title.rendered,
            excerpt: post.excerpt.rendered.replace(/<[^>]*>?/gm, ''),
            featured_image: post._embedded?.['wp:featuredmedia']?.[0]?.source_url,
            audio_url: post.meta?._podcast_audio_url || null,
            external_url: post.meta?._podcast_external_url || post.link,
            published_at: post.date
        }));

        res.json({
            items,
            total: parseInt(response.headers['x-wp-total'] || '0'),
            total_pages: parseInt(response.headers['x-wp-totalpages'] || '0')
        });
    } catch (error) {
        console.error('WordPress API Error:', error);
        res.status(500).json({ error: 'Failed to fetch podcasts' });
    }
});

export default router;
