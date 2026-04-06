const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema({
    coverImage: {
        type: String,
        default: null
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    author: {
        type: String,
        required: true,
        trim: true
    },
    firstBookId: {
        type: String,
        required: true,
        unique: true
    },
    secondBookId: {
        type: String,
        required: true,
        unique: true
    },
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    description: {
        type: String,
        default: ''
    },
    totalCopies: {
        type: Number,
        required: true,
        min: 1
    },
    availableCopies: {
        type: Number,
        required: true
    },
    publisher: {
        type: String,
        required: true
    },
    publishedYear: {
        type: Number,
        required: true
    },
    edition: {
        type: String,
        default: '1st'
    },
    language: {
        type: String,
        default: 'English'
    },
    location: {
        type: String,
    },
    pdfs: {
        pdf1: {
            type: String,
            default: null
        },
        pdf2: {
            type: String,
            default: null
        }
    },
    isActive: {
        type: Boolean,
        default: true
    },
    takingList: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        }
    ],
    addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Book', bookSchema);