const mongoose = require('mongoose');

const borrowSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    book: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Book',
        required: true
    },
    issueDate: {
        type: Date,
        required: true,
        default: Date.now
    },
    dueDate: {
        type: Date,
        required: true
    },
    returnDate: {
        type: Date,
        default: null
    },
    renewDate: {
        type: Date,
        default: null
    },
    renewCount: {
        type: Number,
        default: 0,
        max: 2
    },
    status: {
        type: String,
        enum: ['issued', 'returned', 'overdue'],
        default: 'issued'
    },
    fineAmount: {
        type: Number,
        default: 0
    },
    finePaid: {
        type: Boolean,
        default: false
    },
    issuedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    returnedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }
}, {timestamps: true});

module.exports = mongoose.model('Borrow', borrowSchema);