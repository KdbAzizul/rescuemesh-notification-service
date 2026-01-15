const Joi = require('joi');

const notificationSchema = Joi.object({
  recipientId: Joi.string().required(),
  recipientPhone: Joi.string().optional(),
  channels: Joi.array().items(Joi.string().valid('sms', 'push', 'whatsapp')).default(['sms', 'push']),
  type: Joi.string()
    .valid('sos_match', 'sos_request', 'disaster_alert', 'match_accepted')
    .required(),
  priority: Joi.string().valid('high', 'medium', 'low').default('medium'),
  data: Joi.object().optional(),
});

const batchNotificationSchema = Joi.object({
  recipients: Joi.array()
    .items(
      Joi.object({
        recipientId: Joi.string().required(),
        recipientPhone: Joi.string().optional(),
      })
    )
    .min(1)
    .required(),
  channels: Joi.array().items(Joi.string().valid('sms', 'push', 'whatsapp')).default(['sms', 'push']),
  type: Joi.string()
    .valid('sos_match', 'sos_request', 'disaster_alert', 'match_accepted')
    .required(),
  data: Joi.object().optional(),
});

function validateNotificationRequest(req, res, next) {
  const { error, value } = notificationSchema.validate(req.body, { abortEarly: false });

  if (error) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: error.details.map((d) => d.message),
      },
    });
  }

  req.body = value;
  next();
}

function validateBatchNotificationRequest(req, res, next) {
  const { error, value } = batchNotificationSchema.validate(req.body, { abortEarly: false });

  if (error) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: error.details.map((d) => d.message),
      },
    });
  }

  req.body = value;
  next();
}

module.exports = { validateNotificationRequest, validateBatchNotificationRequest };
