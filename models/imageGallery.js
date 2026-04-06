const mongoose = require('mongoose');

const ImageGallery = new mongoose.Schema({
    category: {
        type: String,
        required: true
    },
    imageList: [{
        imageUrl: {
            type: String,
            required: true
        }
    }]
}, { timestamps: true });

const ImageGalleryModel = mongoose.model("ImageGallery", ImageGallery);
module.exports = ImageGalleryModel;