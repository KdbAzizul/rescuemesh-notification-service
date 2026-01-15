require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initializeDatabase } = require('./config/database');
const { initializeRedis } = require('./config/redis');
const { initializeMessageQueue, consumeFromQueue } = require('./config/messageQueue');
const { errorHandler } = require('./middleware/errorHandler');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');
const logger = require('./utils/logger');
const notificationService = require('./services/notificationService');

const app = express();
const PORT = process.env.PORT || 3006;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, { ip: req.ip });
  next();
});

// Routes
app.use('/health', require('./routes/health'));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use('/api/notifications', require('./routes/notifications'));

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

// Initialize services
async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();
    logger.info('Database connected');

    // Initialize Redis
    await initializeRedis();
    logger.info('Redis connected');

    // Initialize message queue
    await initializeMessageQueue();
    logger.info('Message queue connected');

    // Start consuming notification requests
    consumeFromQueue(
      process.env.RABBITMQ_QUEUE_NOTIFICATION || 'notifications.send',
      async (message) => {
        try {
          const data = JSON.parse(message.content.toString());
          logger.info('Processing notification', { event: data.event });
          await notificationService.processNotification(data);
          message.channel.ack(message);
        } catch (error) {
          logger.error('Error processing notification', error);
          message.channel.nack(message, false, true); // Requeue on failure
        }
      }
    );

    // Start server
    app.listen(PORT, () => {
      logger.info(`Notification Service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
