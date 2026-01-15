const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const notificationService = require('../services/notificationService');
const { validateNotificationRequest, validateBatchNotificationRequest } = require('../middleware/validation');
const logger = require('../utils/logger');

// Send notification
router.post('/send', validateNotificationRequest, async (req, res, next) => {
  try {
    const result = await notificationService.sendNotification(req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// Send batch notifications
router.post('/batch', validateBatchNotificationRequest, async (req, res, next) => {
  try {
    const { recipients, channels, type, data } = req.body;

    const notifications = recipients.map((recipient) => ({
      recipientId: recipient.recipientId,
      recipientPhone: recipient.recipientPhone,
      channels,
      type,
      data,
    }));

    const results = await notificationService.sendBatchNotifications(notifications);
    res.status(200).json({ results, total: results.length });
  } catch (error) {
    next(error);
  }
});

// Get notification status
router.get('/:notificationId/status', async (req, res, next) => {
  try {
    const { notificationId } = req.params;

    const result = await pool.query(
      'SELECT * FROM notifications WHERE notification_id = $1',
      [notificationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Notification not found' },
      });
    }

    const row = result.rows[0];
    res.json({
      notificationId: row.notification_id,
      status: row.status,
      channels: row.channel_status,
      createdAt: row.created_at,
      sentAt: row.sent_at,
      deliveredAt: row.delivered_at,
    });
  } catch (error) {
    next(error);
  }
});

// Get user notification history
router.get('/user/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    const result = await pool.query(
      'SELECT * FROM notifications WHERE recipient_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [userId, parseInt(limit), parseInt(offset)]
    );

    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM notifications WHERE recipient_id = $1',
      [userId]
    );

    const notifications = result.rows.map((row) => ({
      notificationId: row.notification_id,
      type: row.type,
      message: row.message,
      status: row.status,
      channels: row.channel_status,
      createdAt: row.created_at,
      sentAt: row.sent_at,
    }));

    res.json({
      notifications,
      total: parseInt(countResult.rows[0].total),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
