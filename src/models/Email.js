import mongoose, { Schema } from 'mongoose';

const EmailConfigSchema = new Schema({}, { strict: false })

const EmailAddressSchema = new Schema({
    name: { type: String },
    address: { type: String, required: true }
});

const AttachmentSchema = new Schema({
    filename: { type: String, required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    contentId: { type: String },
    url: { type: String }
});

const EmailFlagsSchema = new Schema({
    seen: { type: Boolean, default: false },
    flagged: { type: Boolean, default: false },
    draft: { type: Boolean, default: false },
    answered: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false }
});

const EmailSchema = new Schema({
    id: { type: String, required: true },
    messageId: { type: String, required: true, index: true },
    threadId: { type: String, index: true },
    subject: { type: String, required: true },
    from: { type: EmailAddressSchema, required: true },
    to: [EmailAddressSchema],
    cc: [EmailAddressSchema],
    bcc: [EmailAddressSchema],
    replyTo: [EmailAddressSchema],
    date: { type: Date, required: true, index: true },
    receivedDate: { type: Date },
    bodyText: { type: String },
    bodyHtml: { type: String },
    attachments: [AttachmentSchema],
    flags: { type: EmailFlagsSchema, default: {} },
    labels: [{ type: String }],
    folder: { type: String, required: true, index: true },
    provider: { type: String, required: true },
    raw: { type: String },
    inReplyTo: { type: String },
    references: [{ type: String }],
    userId: { type: String, required: true, index: true },
    accountId: { type: String, required: true, index: true }
}, {
    timestamps: true
});

// Compound indexes for common queries
EmailSchema.index({ userId: 1, folder: 1, date: -1 });
EmailSchema.index({ userId: 1, threadId: 1 });
EmailSchema.index({ userId: 1, 'flags.seen': 1 });
EmailSchema.index({ messageId: 1, userId: 1 }, { unique: true });

EmailSchema.methods.markAsRead = function () {
    this.flags.seen = true;
    return this.save();
};

EmailSchema.methods.markAsUnread = function () {
    this.flags.seen = false;
    return this.save();
};

EmailSchema.methods.toggleFlag = function () {
    this.flags.flagged = !this.flags.flagged;
    return this.save();
};

EmailSchema.methods.addLabel = function (label) {
    if (!this.labels.includes(label)) {
        this.labels.push(label);
        return this.save();
    }
    return Promise.resolve(this);
};

EmailSchema.methods.removeLabel = function (label) {
    this.labels = this.labels.filter(l => l !== label);
    return this.save();
};

// Static methods
EmailSchema.statics.findByThread = function (threadId, userId) {
    return this.find({ threadId, userId }).sort({ date: 1 });
};

EmailSchema.statics.findUnread = function (userId, folder) {
    const query = { userId, 'flags.seen': false };
    if (folder) query.folder = folder;
    return this.find(query).sort({ date: -1 });
};

EmailSchema.statics.search = function (userId, searchQuery) {
    const query = { userId };

    if (searchQuery.query) {
        query.$or = [
            { subject: { $regex: searchQuery.query, $options: 'i' } },
            { bodyText: { $regex: searchQuery.query, $options: 'i' } },
            { 'from.address': { $regex: searchQuery.query, $options: 'i' } }
        ];
    }

    if (searchQuery.from) {
        query['from.address'] = { $regex: searchQuery.from, $options: 'i' };
    }

    if (searchQuery.to) {
        query['to.address'] = { $regex: searchQuery.to, $options: 'i' };
    }

    if (searchQuery.subject) {
        query.subject = { $regex: searchQuery.subject, $options: 'i' };
    }

    if (searchQuery.hasAttachment !== undefined) {
        query['attachments.0'] = { $exists: searchQuery.hasAttachment };
    }

    if (searchQuery.isUnread !== undefined) {
        query['flags.seen'] = !searchQuery.isUnread;
    }

    if (searchQuery.isFlagged !== undefined) {
        query['flags.flagged'] = searchQuery.isFlagged;
    }

    if (searchQuery.folder) {
        query.folder = searchQuery.folder;
    }

    if (searchQuery.dateRange) {
        query.date = {
            $gte: searchQuery.dateRange.start,
            $lte: searchQuery.dateRange.end
        };
    }

    return this.find(query)
        .sort({ date: -1 })
        .limit(searchQuery.limit || 50)
        .skip(searchQuery.offset || 0);
};

export const Email = mongoose.model('Email', EmailSchema);
export const EmailConfig = mongoose.model('email_config', EmailConfigSchema);