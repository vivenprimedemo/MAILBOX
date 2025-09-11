import Joi from 'joi';

export const validate = (schema) => {
    return (req, res, next) => {
        const { error } = schema.validate(req.body, { abortEarly: false });

        if (error) {
            const errorDetails = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message
            }));

            return res.status(400).json({
                success: false,
                data: null,
                error: {
                    code: 'VALIDATION_FAILED',
                    message: 'Validation failed',
                    provider: '',
                    timestamp: new Date(),
                    details: errorDetails
                },
                metadata: {}
            });
        }

        next();
    };
};

export const validateQuery = (schema) => {
    return (req, res, next) => {
        const { error } = schema.validate(req.query, { abortEarly: false });

        if (error) {
            const errorDetails = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message
            }));

            return res.status(400).json({
                success: false,
                data: null,
                error: {
                    code: 'QUERY_VALIDATION_FAILED',
                    message: 'Query validation failed',
                    provider: '',
                    timestamp: new Date(),
                    details: errorDetails
                },
                metadata: {}
            });
        }

        next();
    };
};

// Common validation schemas
export const schemas = {
    register: Joi.object({
        username: Joi.string().alphanum().min(3).max(30).required(),
        email: Joi.string().email().required(),
        password: Joi.string().min(6).required(),
        firstName: Joi.string().max(50).optional(),
        lastName: Joi.string().max(50).optional()
    }),

    login: Joi.object({
        username: Joi.string().required(),
        password: Joi.string().required()
    }),

    addEmailAccount: Joi.object({
        email: Joi.string().email().required(),
        provider: Joi.string().valid('gmail', 'outlook', 'imap').required(),
        displayName: Joi.string().max(100).required(),
        config: Joi.object().required()
    }),

    updateEmailAccount: Joi.object({
        displayName: Joi.string().max(100).optional(),
        isActive: Joi.boolean().optional(),
        config: Joi.object().optional()
    }),

    sendEmail: Joi.object({
        to: Joi.array().items(
            Joi.object({
                name: Joi.string().optional(),
                address: Joi.string().email().required()
            })
        ).min(1).required(),
        cc: Joi.array().items(
            Joi.object({
                name: Joi.string().optional(),
                address: Joi.string().email().required()
            })
        ).optional(),
        bcc: Joi.array().items(
            Joi.object({
                name: Joi.string().optional(),
                address: Joi.string().email().required()
            })
        ).optional(),
        subject: Joi.string().required(),
        bodyText: Joi.string().optional(),
        bodyHtml: Joi.string().optional(),
        attachments: Joi.array().items(
            Joi.object({
                filename: Joi.string().required(),
                content: Joi.string().required(),
                contentType: Joi.string().optional()
            })
        ).optional()
    }).or('bodyText', 'bodyHtml'),

    markEmails: Joi.object({
        messageIds: Joi.array().items(Joi.string()).min(1).required(),
        folder: Joi.string().optional()
    }),

    moveEmails: Joi.object({
        messageIds: Joi.array().items(Joi.string()).min(1).required(),
        fromFolder: Joi.string().required(),
        toFolder: Joi.string().required()
    }),

    search: Joi.object({
        query: Joi.string().optional(),
        from: Joi.string().optional(),
        to: Joi.string().optional(),
        subject: Joi.string().optional(),
        hasAttachment: Joi.boolean().optional(),
        isUnread: Joi.boolean().optional(),
        isFlagged: Joi.boolean().optional(),
        folder: Joi.string().optional(),
        limit: Joi.number().integer().min(1).max(100).default(50),
        offset: Joi.number().integer().min(0).default(0),
        dateStart: Joi.date().iso().optional(),
        dateEnd: Joi.date().iso().optional()
    }),

    listEmails: Joi.object({
        folderId: Joi.string().default('INBOX'),
        limit: Joi.number().integer().min(1).max(100).default(50),
        offset: Joi.number().integer().min(0).default(0),
        sortBy: Joi.string().valid('date', 'subject', 'from', 'size').default('date'),
        sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
        search: Joi.string().allow('').default(''),
        isUnread: Joi.boolean().optional(),
        isFlagged: Joi.boolean().optional(),
        hasAttachment: Joi.boolean().optional(),
        from: Joi.string().optional(),
        to: Joi.string().optional(),
        subject: Joi.string().optional(),
        dateFrom: Joi.date().iso().optional(),
        dateTo: Joi.date().iso().optional(),
        useCache: Joi.boolean().default(true),
        nextPage: Joi.string().optional(),
        isListEmails: Joi.boolean().default(true),
    }),

    replyEmail: Joi.object({
        bodyText: Joi.string().optional(),
        bodyHtml: Joi.string().optional(),
        to: Joi.array().items(
            Joi.object({
                name: Joi.string().optional(),
                address: Joi.string().email().required()
            })
        ).optional(),
        cc: Joi.array().items(
            Joi.object({
                name: Joi.string().optional(),
                address: Joi.string().email().required()
            })
        ).optional(),
        bcc: Joi.array().items(
            Joi.object({
                name: Joi.string().optional(),
                address: Joi.string().email().required()
            })
        ).optional(),
        attachments: Joi.array().items(
            Joi.object({
                filename: Joi.string().required(),
                content: Joi.string().required(),
                contentType: Joi.string().optional()
            })
        ).optional(),
        ignoreMessage: Joi.boolean().optional(),
    }).or('bodyText', 'bodyHtml'),

    updatePreferences: Joi.object({
        threadsEnabled: Joi.boolean().optional(),
        autoMarkAsRead: Joi.boolean().optional(),
        syncInterval: Joi.number().integer().min(60000).max(3600000).optional(), // 1 min to 1 hour
        displayDensity: Joi.string().valid('comfortable', 'compact', 'cozy').optional(),
        theme: Joi.string().valid('light', 'dark', 'auto').optional()
    }),

    threadSort: Joi.object({
        sortBy: Joi.string().valid('date', 'subject', 'from').default('date'),
        sortOrder: Joi.string().valid('asc', 'desc').default('desc')
    })
};