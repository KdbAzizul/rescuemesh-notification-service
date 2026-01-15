const { Pool } = require('pg');
const logger = require('../utils/logger');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'rescuemesh_notification',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle client', err);
});

// Initialize database schema
async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        notification_id VARCHAR(255) PRIMARY KEY,
        recipient_id VARCHAR(255) NOT NULL,
        recipient_phone VARCHAR(20),
        type VARCHAR(100) NOT NULL,
        priority VARCHAR(50) NOT NULL,
        channels JSONB NOT NULL,
        message TEXT NOT NULL,
        data JSONB,
        status VARCHAR(50) DEFAULT 'pending',
        channel_status JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        sent_at TIMESTAMP,
        delivered_at TIMESTAMP,
        failed_at TIMESTAMP,
        failure_reason TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id ON notifications(recipient_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
      CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
      CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
    `);

    logger.info('Database schema initialized');
  } catch (error) {
    logger.error('Database initialization error', error);
    throw error;
  }
}

module.exports = {
  pool,
  initializeDatabase,
};
