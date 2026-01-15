const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/database');
const logger = require('../utils/logger');
const smsService = require('./smsService');
const pushService = require('./pushService');
const axios = require('axios');

/**
 * Process notification from message queue or API
 */
async function processNotification(notificationData) {
  try {
    const { event, data } = notificationData;

    // Handle different event types
    if (event === 'match.created') {
      return await sendMatchNotification(data);
    } else if (event === 'sos_request') {
      return await sendSOSNotification(data);
    } else if (event === 'disaster_alert') {
      return await sendDisasterAlert(data);
    } else if (event === 'match_accepted') {
      return await sendMatchAcceptedNotification(data);
    }

    // Generic notification
    return await sendNotification(data);
  } catch (error) {
    logger.error('Error processing notification', error);
    throw error;
  }
}

/**
 * Send notification
 */
async function sendNotification(notificationData) {
  const {
    recipientId,
    recipientPhone,
    channels = ['sms', 'push'],
    type,
    priority = 'medium',
    data: notificationPayload,
  } = notificationData;

  const notificationId = `notif-${uuidv4()}`;
  const message = buildMessage(type, notificationPayload);

  // Get user details if needed
  let userPhone = recipientPhone;
  if (!userPhone && recipientId) {
    try {
      const userResponse = await axios.get(
        `${process.env.USER_SERVICE_URL}/api/users/${recipientId}`,
        { timeout: 5000 }
      );
      userPhone = userResponse.data.profile?.phone;
    } catch (error) {
      logger.warn('Could not fetch user details', { recipientId, error: error.message });
    }
  }

  // Save notification to database
  await saveNotification(notificationId, {
    recipientId,
    recipientPhone: userPhone,
    type,
    priority,
    channels,
    message,
    data: notificationPayload,
  });

  // Send through channels
  const channelStatus = {};
  const sendPromises = [];

  if (channels.includes('sms') && process.env.SMS_ENABLED === 'true' && userPhone) {
    sendPromises.push(
      smsService
        .sendSMS(userPhone, message)
        .then((result) => {
          channelStatus.sms = { status: 'sent', sentAt: new Date().toISOString() };
          return result;
        })
        .catch((error) => {
          channelStatus.sms = { status: 'failed', error: error.message };
          logger.error('SMS send failed', error);
        })
    );
  }

  if (channels.includes('push') && process.env.PUSH_ENABLED === 'true') {
    sendPromises.push(
      pushService
        .sendPush(recipientId, message, notificationPayload)
        .then((result) => {
          channelStatus.push = { status: 'sent', sentAt: new Date().toISOString() };
          return result;
        })
        .catch((error) => {
          channelStatus.push = { status: 'failed', error: error.message };
          logger.error('Push notification failed', error);
        })
    );
  }

  await Promise.allSettled(sendPromises);

  // Update notification status
  const allFailed = Object.values(channelStatus).every((ch) => ch.status === 'failed');
  const status = allFailed ? 'failed' : 'sent';

  await updateNotificationStatus(notificationId, {
    status,
    channelStatus,
    sentAt: new Date().toISOString(),
  });

  return {
    notificationId,
    status,
    channels: channelStatus,
    sentAt: new Date().toISOString(),
  };
}

/**
 * Send match notification
 */
async function sendMatchNotification(data) {
  const { matchId, requestId, volunteerId, skillType, resourceType } = data;

  // Get request details
  let requestDetails = null;
  try {
    const requestResponse = await axios.get(
      `${process.env.SOS_SERVICE_URL || 'http://sos-service:3004'}/api/sos/requests/${requestId}`,
      { timeout: 5000 }
    );
    requestDetails = requestResponse.data;
  } catch (error) {
    logger.warn('Could not fetch request details', { requestId, error: error.message });
  }

  const message = `You have been matched to an emergency request. ${skillType || resourceType} needed at ${requestDetails?.location ? `${requestDetails.location.latitude}, ${requestDetails.location.longitude}` : 'location'}. Urgency: ${requestDetails?.urgency || 'high'}`;

  return await sendNotification({
    recipientId: volunteerId,
    channels: ['sms', 'push'],
    type: 'sos_match',
    priority: requestDetails?.urgency === 'critical' ? 'high' : 'medium',
    data: {
      matchId,
      requestId,
      message,
      location: requestDetails?.location,
      actionUrl: `https://app.rescuemesh.com/requests/${requestId}`,
    },
  });
}

/**
 * Send SOS request notification
 */
async function sendSOSNotification(data) {
  return await sendNotification({
    recipientId: data.recipientId,
    recipientPhone: data.recipientPhone,
    channels: data.channels || ['sms', 'push'],
    type: 'sos_request',
    priority: data.urgency === 'critical' ? 'high' : 'medium',
    data: data,
  });
}

/**
 * Send disaster alert
 */
async function sendDisasterAlert(data) {
  return await sendNotification({
    recipientId: data.recipientId,
    recipientPhone: data.recipientPhone,
    channels: ['sms', 'push'],
    type: 'disaster_alert',
    priority: 'high',
    data: data,
  });
}

/**
 * Send match accepted notification
 */
async function sendMatchAcceptedNotification(data) {
  return await sendNotification({
    recipientId: data.recipientId,
    channels: ['push'],
    type: 'match_accepted',
    priority: 'medium',
    data: data,
  });
}

/**
 * Build message based on type
 */
function buildMessage(type, data) {
  const templates = {
    sos_match: `Emergency Match: ${data.message || 'You have been matched to an emergency request'}`,
    sos_request: `New SOS Request: ${data.message || 'Emergency assistance needed'}`,
    disaster_alert: `Disaster Alert: ${data.message || 'New disaster in your area'}`,
    match_accepted: `Match Accepted: ${data.message || 'A volunteer has accepted your match'}`,
  };

  return templates[type] || data.message || 'Notification from RescueMesh';
}

/**
 * Save notification to database
 */
async function saveNotification(notificationId, notification) {
  try {
    await pool.query(
      `INSERT INTO notifications (
        notification_id, recipient_id, recipient_phone, type, priority,
        channels, message, data, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        notificationId,
        notification.recipientId,
        notification.recipientPhone,
        notification.type,
        notification.priority,
        JSON.stringify(notification.channels),
        notification.message,
        JSON.stringify(notification.data || {}),
        'pending',
      ]
    );
  } catch (error) {
    logger.error('Error saving notification', error);
    throw error;
  }
}

/**
 * Update notification status
 */
async function updateNotificationStatus(notificationId, updates) {
  try {
    const fields = [];
    const values = [];
    let paramCount = 0;

    if (updates.status) {
      paramCount++;
      fields.push(`status = $${paramCount}`);
      values.push(updates.status);
    }

    if (updates.channelStatus) {
      paramCount++;
      fields.push(`channel_status = $${paramCount}`);
      values.push(JSON.stringify(updates.channelStatus));
    }

    if (updates.sentAt) {
      paramCount++;
      fields.push(`sent_at = $${paramCount}`);
      values.push(updates.sentAt);
    }

    if (updates.deliveredAt) {
      paramCount++;
      fields.push(`delivered_at = $${paramCount}`);
      values.push(updates.deliveredAt);
    }

    if (updates.failedAt) {
      paramCount++;
      fields.push(`failed_at = $${paramCount}`);
      values.push(updates.failedAt);
    }

    if (updates.failureReason) {
      paramCount++;
      fields.push(`failure_reason = $${paramCount}`);
      values.push(updates.failureReason);
    }

    if (fields.length > 0) {
      paramCount++;
      values.push(notificationId);
      await pool.query(
        `UPDATE notifications SET ${fields.join(', ')} WHERE notification_id = $${paramCount}`,
        values
      );
    }
  } catch (error) {
    logger.error('Error updating notification status', error);
    throw error;
  }
}

/**
 * Send batch notifications
 */
async function sendBatchNotifications(notifications) {
  const results = [];
  for (const notification of notifications) {
    try {
      const result = await sendNotification(notification);
      results.push(result);
    } catch (error) {
      logger.error('Error sending batch notification', error);
      results.push({ error: error.message });
    }
  }
  return results;
}

module.exports = {
  processNotification,
  sendNotification,
  sendBatchNotifications,
  sendMatchNotification,
  sendSOSNotification,
  sendDisasterAlert,
};
