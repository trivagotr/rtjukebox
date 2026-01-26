import { useState } from 'react';
import axios from 'axios';
import {
    Shield,
    SkipForward,
    Activity
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL ||
    `${window.location.protocol}//${window.location.hostname}:3000`;

interface AdminDashboardProps {
    token: string;
    device: any; // Connected device info
}

export function AdminDashboard({ token, device }: AdminDashboardProps) {
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('');

    const skipSong = async () => {
        if (!device) return alert('No device connected');
        if (!confirm('Are you sure you want to skip the current song?')) return;

        try {
            setLoading(true);
            await axios.post(`${API_URL}/api/v1/jukebox/admin/skip`,
                { device_id: device.id },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setStatus('Song skipped successfully');
        } catch (err) {
            console.error(err);
            setStatus('Failed to skip song');
        } finally {
            setLoading(false);
            setTimeout(() => setStatus(''), 3000);
        }
    };

    const processSong = async () => {
        // This is a manual trigger for testing/demo
        const songId = prompt("Enter Song ID to process (trim silence):");
        if (!songId) return;

        try {
            setLoading(true);
            setStatus('Processing audio...');
            const res = await axios.post(`${API_URL}/api/v1/jukebox/admin/process-song`,
                { song_id: songId },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setStatus(`Success! New path: ${res.data.data.new_path}`);
        } catch (err: any) {
            console.error(err);
            setStatus('Failed: ' + (err.response?.data?.error || err.message));
        } finally {
            setLoading(false);
        }
    };

    if (!device) return null;

    return (
        <div className="card border-l-4 border-l-rose-500 mt-8">
            <div className="flex items-center gap-2 mb-4 text-rose-500 font-bold uppercase tracking-wider">
                <Shield size={18} /> Admin Controls
            </div>

            <div className="grid grid-cols-2 gap-4">
                <button
                    onClick={skipSong}
                    disabled={loading}
                    className="flex flex-col items-center justify-center p-4 bg-surface hover:bg-surface-hover border border-border rounded-xl transition-colors"
                >
                    <SkipForward size={24} className="mb-2 text-rose-500" />
                    <span className="font-bold text-sm">Force Skip</span>
                </button>

                <button
                    onClick={processSong}
                    disabled={loading}
                    className="flex flex-col items-center justify-center p-4 bg-surface hover:bg-surface-hover border border-border rounded-xl transition-colors"
                >
                    <Activity size={24} className="mb-2 text-blue-500" />
                    <span className="font-bold text-sm">Trim Audio</span>
                </button>
            </div>

            {status && (
                <div className="mt-4 p-2 bg-background/50 rounded text-center text-xs font-mono">
                    {status}
                </div>
            )}
        </div>
    );
}
