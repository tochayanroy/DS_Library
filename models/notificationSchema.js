const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: [
            'book_issued',
            'book_returned',
            'book_renewed',
            'due_reminder',
            'fine_alert',
            'fine_paid',
            'book_available',
            'general'],
        default: 'general'
    },
    isRead: {
        type: Boolean,
        default: false
    },
    relatedEntity: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'entityModel'
    },
    entityModel: {
        type: String,
        enum: ['Book', 'Borrow', 'Fine']
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Notification', notificationSchema);