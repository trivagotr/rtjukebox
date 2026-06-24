import { getMessaging } from 'firebase-admin/messaging';

// Initialize Firebase Admin (requires serviceAccountKey.json)
// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
// });

export const pushService = {
    async sendToUser(fcmToken: string, title: string, body: string, data?: Record<string, string>) {
        if (!fcmToken) return;

        try {
            await getMessaging().send({
                token: fcmToken,
                notification: { title, body },
                data,
            });
        } catch (error) {
            console.error('Push send error:', error);
        }
    },

    async sendToTopic(topic: string, title: string, body: string, data?: Record<string, string>) {
        try {
            await getMessaging().send({
                topic,
                notification: { title, body },
                data,
            });
        } catch (error) {
            console.error('Topic push error:', error);
        }
    }
};
