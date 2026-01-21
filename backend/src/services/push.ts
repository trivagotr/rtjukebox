import admin from 'firebase-admin';

// Initialize Firebase Admin (requires serviceAccountKey.json)
// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
// });

export const pushService = {
    async sendToUser(fcmToken: string, title: string, body: string, data?: any) {
        if (!fcmToken) return;

        try {
            await admin.messaging().send({
                token: fcmToken,
                notification: { title, body },
                data,
            });
        } catch (error) {
            console.error('Push send error:', error);
        }
    },

    async sendToTopic(topic: string, title: string, body: string, data?: any) {
        try {
            await admin.messaging().send({
                topic,
                notification: { title, body },
                data,
            });
        } catch (error) {
            console.error('Topic push error:', error);
        }
    }
};
