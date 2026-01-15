const admin = require('firebase-admin');
const logger = require('../utils/logger');

let firebaseApp = null;

function initializeFirebase() {
  if (!firebaseApp) {
    try {
      const serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      };

      if (!serviceAccount.projectId || !serviceAccount.privateKey || !serviceAccount.clientEmail) {
        logger.warn('Firebase credentials not configured. Push notifications will be disabled.');
        return null;
      }

      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });

      logger.info('Firebase initialized');
    } catch (error) {
      logger.error('Firebase initialization error', error);
      return null;
    }
  }
  return firebaseApp;
}

async function sendPush(userId, message, data = {}) {
  try {
    const app = initializeFirebase();
    if (!app) {
      throw new Error('Push notification service not configured');
    }

    // In a real implementation, you would fetch the FCM token from user service
    // For now, we'll use a mock approach
    const fcmToken = await getFCMToken(userId);

    if (!fcmToken) {
      logger.warn('No FCM token found for user', { userId });
      return { success: false, error: 'No FCM token' };
    }

    const payload = {
      notification: {
        title: 'RescueMesh Alert',
        body: message,
      },
      data: {
        ...data,
        message: message,
      },
      token: fcmToken,
    };

    const response = await admin.messaging().send(payload);
    logger.info('Push notification sent', { userId, messageId: response });
    return { success: true, messageId: response };
  } catch (error) {
    logger.error('Push notification error', { userId, error: error.message });
    throw error;
  }
}

async function getFCMToken(userId) {
  // In production, fetch from user service or database
  // For MVP, return null (mock)
  return null;
}

// Mock push for development/testing
async function sendPushMock(userId, message, data = {}) {
  logger.info('Push Notification Mock (Development)', { userId, message, data });
  return { success: true, messageId: 'mock-' + Date.now() };
}

module.exports = {
  sendPush: process.env.NODE_ENV === 'production' && process.env.FIREBASE_PROJECT_ID ? sendPush : sendPushMock,
};
