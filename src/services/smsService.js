const twilio = require('twilio');
const logger = require('../utils/logger');

let twilioClient = null;

function getTwilioClient() {
  if (!twilioClient) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      logger.warn('Twilio credentials not configured. SMS will be disabled.');
      return null;
    }

    twilioClient = twilio(accountSid, authToken);
  }
  return twilioClient;
}

async function sendSMS(to, message) {
  try {
    const client = getTwilioClient();
    if (!client) {
      throw new Error('SMS service not configured');
    }

    const from = process.env.TWILIO_PHONE_NUMBER;
    if (!from) {
      throw new Error('Twilio phone number not configured');
    }

    const result = await client.messages.create({
      body: message,
      from: from,
      to: to,
    });

    logger.info('SMS sent successfully', { to, messageSid: result.sid });
    return { success: true, messageSid: result.sid, status: result.status };
  } catch (error) {
    logger.error('SMS send error', { to, error: error.message });
    throw error;
  }
}

// Mock SMS for development/testing
async function sendSMSMock(to, message) {
  logger.info('SMS Mock (Development)', { to, message });
  return { success: true, messageSid: 'mock-' + Date.now(), status: 'sent' };
}

module.exports = {
  sendSMS: process.env.NODE_ENV === 'production' && process.env.TWILIO_ACCOUNT_SID ? sendSMS : sendSMSMock,
};
