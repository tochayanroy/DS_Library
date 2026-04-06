const multer = require('multer');
const path = require('path');

// Configure storage
const storage = multer.diskStorage({
	destination: function (req, file, cb) {
		let uploadPath = 'uploads/';

		if (file.fieldname === 'profileIMG') {
			uploadPath += 'profiles/';
		} else if (file.fieldname === 'coverImage') {
			uploadPath += 'book-covers/';
		} else if (file.fieldname === 'galleryImages') {
			uploadPath += 'gallery/';
		} else if (file.fieldname === 'pdf1' || file.fieldname === 'pdf2') {
			uploadPath += 'pdfs/';
		} else {
			uploadPath += 'others/';
		}

		cb(null, uploadPath);
	},
	filename: function (req, file, cb) {
		// Generate unique filename
		const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
		cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
	}
});

// File filter function
const fileFilter = (req, file, cb) => {
	// Check file types
	if (file.fieldname === 'profileIMG' || file.fieldname === 'coverImage' || file.fieldname === 'galleryImages') {
		// Image files
		if (file.mimetype.startsWith('image/')) {
			cb(null, true);
		} else {
			cb(new Error('Only image files are allowed!'), false);
		}
	} else if (file.fieldname === 'pdf1' || file.fieldname === 'pdf2') {
		// PDF files
		if (file.mimetype === 'application/pdf') {
			cb(null, true);
		} else {
			cb(new Error('Only PDF files are allowed!'), false);
		}
	} else {
		cb(null, true);
	}
};

// Configure multer
const upload = multer({
	storage: storage,
	fileFilter: fileFilter,
	limits: {
		fileSize: 5 * 1024 * 1024, // 5MB limit for images
		files: 10 // Maximum 10 files for gallery upload
	}
});

// Middleware configurations for different upload scenarios

// For user profile image upload (single file)
const uploadProfile = upload.single('profileIMG');

// For book cover image upload (single file)
const uploadBookCover = upload.single('coverImage');

// For gallery images upload (multiple files)
const uploadGallery = upload.array('galleryImages', 10); // max 10 images

// For book PDFs upload (multiple fields)
const uploadBookFiles = upload.fields([
	{ name: 'coverImage', maxCount: 1 },
	{ name: 'pdf1', maxCount: 1 },
	{ name: 'pdf2', maxCount: 1 }
]);

// For PDF upload only (single PDF file)
const uploadPDF = upload.single('pdf'); // Use 'pdf' as field name

// Complete upload configuration for all types
const uploadAllTypes = upload.fields([
	{ name: 'profileIMG', maxCount: 1 },
	{ name: 'coverImage', maxCount: 1 },
	{ name: 'galleryImages', maxCount: 10 },
	{ name: 'pdf1', maxCount: 1 },
	{ name: 'pdf2', maxCount: 1 },
	{ name: 'pdf', maxCount: 1 } // Add this for single PDF uploads
]);

// Error handling middleware for multer
const handleMulterError = (error, req, res, next) => {
	if (error instanceof multer.MulterError) {
		if (error.code === 'LIMIT_FILE_SIZE') {
			return res.status(400).json({ error: 'File too large. Maximum size is 5MB for images and 10MB for PDFs.' });
		}
		if (error.code === 'LIMIT_FILE_COUNT') {
			return res.status(400).json({ error: 'Too many files uploaded.' });
		}
		if (error.code === 'LIMIT_UNEXPECTED_FILE') {
			return res.status(400).json({ error: 'Unexpected field name for file upload.' });
		}
	} else if (error) {
		return res.status(400).json({ error: error.message });
	}
	next();
};

module.exports = {
	upload,
	uploadProfile,
	uploadBookCover,
	uploadGallery,
	uploadBookFiles,
	uploadPDF,
	uploadAllTypes,
	handleMulterError
};