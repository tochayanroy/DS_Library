const express = require('express');
const router = express.Router();
const { uploadBookCover, uploadPDF } = require('../middleware/multer.js');
const passport = require('passport');
const Book = require('../models/bookSchema.js');
const Category = require('../models/categorySchema.js');

// Add book with category validation
router.post('/addBook', passport.authenticate('jwt', { session: false }), uploadBookCover, async (req, res) => {
    try {
        // Check if user has permission
        if (req.user.role !== 'admin' && req.user.role !== 'librarian') {
            return res.status(403).json({ error: 'Access denied. Admin or Librarian only.' });
        }

        const {
            title,
            author,
            firstBookId,
            secondBookId,
            category,
            description,
            totalCopies,
            publisher,
            publishedYear,
            edition,
            language,
            location
        } = req.body;

        // Check if category exists and is active
        if (category) {
            const categoryExists = await Category.findOne({ _id: category, isActive: true });
            if (!categoryExists) {
                return res.status(400).json({ error: 'Invalid or inactive category' });
            }
        }

        // Check if book IDs already exist
        const existingFirstId = await Book.findOne({ firstBookId });
        if (existingFirstId) {
            return res.status(400).json({ error: 'First Book ID already exists' });
        }

        const existingSecondId = await Book.findOne({ secondBookId });
        if (existingSecondId) {
            return res.status(400).json({ error: 'Second Book ID already exists' });
        }

        // Validate copies
        const availableCopies = parseInt(totalCopies);

        const bookData = {
            title,
            author,
            firstBookId,
            secondBookId,
            category: category || null,
            description: description || '',
            totalCopies: parseInt(totalCopies),
            availableCopies,
            publisher,
            publishedYear: parseInt(publishedYear),
            edition: edition || '1st',
            language: language || 'English',
            location: location || '',
            addedBy: req.user._id
        };

        // Add cover image if uploaded
        if (req.file) {
            bookData.coverImage = req.file.path;
        }

        const book = new Book(bookData);
        await book.save();

        // Populate category and addedBy fields for response
        await book.populate('category', 'name description');
        await book.populate('addedBy', 'name email');

        res.status(201).json({
            message: 'Book added successfully',
            book
        });
    } catch (error) {
        console.error('Add book error:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Server error during book addition' });
    }
});

// Get all books with category filtering
router.get('/getAllBook', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search,
            category,
            author,
            available,
            sortBy = 'title',
            sortOrder = 'asc'
        } = req.query;

        const query = { isActive: true };

        // Search filter
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { author: { $regex: search, $options: 'i' } },
                { firstBookId: { $regex: search, $options: 'i' } },
                { secondBookId: { $regex: search, $options: 'i' } }
            ];
        }

        // Category filter
        if (category) {
            query.category = category;
        }

        // Author filter
        if (author) {
            query.author = { $regex: author, $options: 'i' };
        }

        // Available copies filter
        if (available === 'true') {
            query.availableCopies = { $gt: 0 };
        }

        // Sort options
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

        const books = await Book.find(query)
            .populate('addedBy', 'name email')
            .populate('category', 'name description') // Populate category details
            .populate('takingList', 'name email membershipId')
            .sort(sortOptions)
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await Book.countDocuments(query);

        res.json({
            total,
            page: parseInt(page),
            pages: Math.ceil(total / limit),
            books
        });
    } catch (error) {
        console.error('Get books error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Search books with category support
router.get('/search', async (req, res) => {
    try {
        const { q, field = 'all', category } = req.query;

        if (!q) {
            return res.status(400).json({ error: 'Search query is required' });
        }

        const query = { isActive: true };
        const searchRegex = { $regex: q, $options: 'i' };

        // Add category filter if provided
        if (category) {
            query.category = category;
        }

        switch (field) {
            case 'title':
                query.title = searchRegex;
                break;
            case 'author':
                query.author = searchRegex;
                break;
            case 'firstBookId':
                query.firstBookId = searchRegex;
                break;
            case 'secondBookId':
                query.secondBookId = searchRegex;
                break;
            case 'category':
                // Search by category name
                const categories = await Category.find({ 
                    name: searchRegex,
                    isActive: true 
                });
                const categoryIds = categories.map(cat => cat._id);
                query.category = { $in: categoryIds };
                break;
            default:
                query.$or = [
                    { title: searchRegex },
                    { author: searchRegex },
                    { firstBookId: searchRegex },
                    { secondBookId: searchRegex },
                    { publisher: searchRegex }
                ];
        }

        const books = await Book.find(query)
            .populate('addedBy', 'name email')
            .populate('category', 'name description')
            .limit(20)
            .sort({ title: 1 });

        res.json({
            count: books.length,
            books
        });
    } catch (error) {
        console.error('Search books error:', error);
        res.status(500).json({ error: 'Server error during search' });
    }
});

// Get book by ID
router.get('/getBookById/:id', async (req, res) => {
    try {
        const book = await Book.findById(req.params.id)
            .populate('addedBy', 'name email')
            .populate('category', 'name description')
            .populate('takingList', 'name email membershipId profileIMG');

        if (!book) {
            return res.status(404).json({ error: 'Book not found' });
        }

        res.json(book);
    } catch (error) {
        console.error('Get book error:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ error: 'Invalid book ID' });
        }
        res.status(500).json({ error: 'Server error' });
    }
});

// Update book with category validation
router.put('/updateBookById/:id', passport.authenticate('jwt', { session: false }), uploadBookCover, async (req, res) => {
    try {
        // Check if user has permission
        if (req.user.role !== 'admin' && req.user.role !== 'librarian') {
            return res.status(403).json({ error: 'Access denied. Admin or Librarian only.' });
        }

        const {
            title,
            author,
            category,
            description,
            totalCopies,
            publisher,
            publishedYear,
            edition,
            language,
            location
        } = req.body;

        // Check if category exists and is active (if provided)
        if (category) {
            const categoryExists = await Category.findOne({ _id: category, isActive: true });
            if (!categoryExists) {
                return res.status(400).json({ error: 'Invalid or inactive category' });
            }
        }

        const book = await Book.findById(req.params.id);
        if (!book) {
            return res.status(404).json({ error: 'Book not found' });
        }

        const updateData = {};
        if (title) updateData.title = title;
        if (author) updateData.author = author;
        if (category !== undefined) updateData.category = category;
        if (description !== undefined) updateData.description = description;
        if (publisher) updateData.publisher = publisher;
        if (publishedYear) updateData.publishedYear = parseInt(publishedYear);
        if (edition) updateData.edition = edition;
        if (language) updateData.language = language;
        if (location !== undefined) updateData.location = location;

        // Update total copies and available copies
        if (totalCopies) {
            const newTotalCopies = parseInt(totalCopies);
            const copiesDifference = newTotalCopies - book.totalCopies;
            updateData.totalCopies = newTotalCopies;
            updateData.availableCopies = book.availableCopies + copiesDifference;

            // Ensure available copies doesn't go negative
            if (updateData.availableCopies < 0) {
                updateData.availableCopies = 0;
            }
        }

        // Update cover image if uploaded
        if (req.file) {
            updateData.coverImage = req.file.path;
        }

        const updatedBook = await Book.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        )
            .populate('addedBy', 'name email')
            .populate('category', 'name description');

        res.json({
            message: 'Book updated successfully',
            book: updatedBook
        });
    } catch (error) {
        console.error('Update book error:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Server error during book update' });
    }
});

// Delete book
router.delete('/deleteBookById/:id', passport.authenticate('jwt', { session: false }), async (req, res) => {
    try {
        // Check if user has permission (only admin can delete)
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied. Admin only.' });
        }

        const book = await Book.findById(req.params.id);
        if (!book) {
            return res.status(404).json({ error: 'Book not found' });
        }

        // Check if book has active borrows
        if (book.availableCopies !== book.totalCopies) {
            return res.status(400).json({
                error: 'Cannot delete book. There are active borrows for this book.'
            });
        }

        await Book.findByIdAndDelete(req.params.id);

        res.json({ message: 'Book deleted successfully' });
    } catch (error) {
        console.error('Delete book error:', error);
        res.status(500).json({ error: 'Server error during book deletion' });
    }
});

// Deactivate book
router.put('/deactivateBook/:id', passport.authenticate('jwt', { session: false }), async (req, res) => {
    try {
        // Check if user has permission
        if (req.user.role !== 'admin' && req.user.role !== 'librarian') {
            return res.status(403).json({ error: 'Access denied. Admin or Librarian only.' });
        }

        const book = await Book.findByIdAndUpdate(
            req.params.id,
            { isActive: false },
            { new: true }
        )
        .populate('addedBy', 'name email')
        .populate('category', 'name description');

        if (!book) {
            return res.status(404).json({ error: 'Book not found' });
        }

        res.json({
            message: 'Book deactivated successfully',
            book
        });
    } catch (error) {
        console.error('Deactivate book error:', error);
        res.status(500).json({ error: 'Server error during book deactivation' });
    }
});

// Activate book
router.put('/activateBook/:id', passport.authenticate('jwt', { session: false }), async (req, res) => {
    try {
        // Check if user has permission
        if (req.user.role !== 'admin' && req.user.role !== 'librarian') {
            return res.status(403).json({ error: 'Access denied. Admin or Librarian only.' });
        }

        const book = await Book.findByIdAndUpdate(
            req.params.id,
            { isActive: true },
            { new: true }
        )
        .populate('addedBy', 'name email')
        .populate('category', 'name description');

        if (!book) {
            return res.status(404).json({ error: 'Book not found' });
        }

        res.json({
            message: 'Book activated successfully',
            book
        });
    } catch (error) {
        console.error('Activate book error:', error);
        res.status(500).json({ error: 'Server error during book activation' });
    }
});

// // Get books by category
router.get('/category/:categoryId', async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const { categoryId } = req.params;

        // Check if category exists
        const category = await Category.findById(categoryId);
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }

        const books = await Book.find({
            category: categoryId,
            isActive: true
        })
            .populate('addedBy', 'name email')
            .populate('category', 'name description')
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ title: 1 });

        const total = await Book.countDocuments({
            category: categoryId,
            isActive: true
        });

        res.json({
            category: {
                _id: category._id,
                name: category.name,
                description: category.description
            },
            total,
            page: parseInt(page),
            pages: Math.ceil(total / limit),
            books
        });
    } catch (error) {
        console.error('Get books by category error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get books without category
router.get('/uncategorized/books', async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;

        const books = await Book.find({
            category: null,
            isActive: true
        })
            .populate('addedBy', 'name email')
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ title: 1 });

        const total = await Book.countDocuments({
            category: null,
            isActive: true
        });

        res.json({
            total,
            page: parseInt(page),
            pages: Math.ceil(total / limit),
            books
        });
    } catch (error) {
        console.error('Get uncategorized books error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get taking list for a book
router.get('/:id/taking-list', passport.authenticate('jwt', { session: false }), async (req, res) => {
    try {
        // Check if user has permission
        if (req.user.role !== 'admin' && req.user.role !== 'librarian') {
            return res.status(403).json({ error: 'Access denied. Admin or Librarian only.' });
        }

        const book = await Book.findById(req.params.id)
            .populate('takingList', 'name email membershipId phone address profileIMG')
            .populate('category', 'name description');

        if (!book) {
            return res.status(404).json({ error: 'Book not found' });
        }

        res.json({
            bookTitle: book.title,
            takingList: book.takingList,
            count: book.takingList.length
        });
    } catch (error) {
        console.error('Get taking list error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Upload PDF
router.post('/:id/upload-pdf', passport.authenticate('jwt', { session: false }), uploadPDF, async (req, res) => {
    try {
        // Check if user has permission
        if (req.user.role !== 'admin' && req.user.role !== 'librarian') {
            return res.status(403).json({ error: 'Access denied. Admin or Librarian only.' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'No PDF file uploaded' });
        }

        const { pdfType = 'pdf1' } = req.body; // pdf1 or pdf2

        const book = await Book.findById(req.params.id);
        if (!book) {
            return res.status(404).json({ error: 'Book not found' });
        }

        // Update PDF path
        book.pdfs[pdfType] = req.file.path;
        await book.save();

        res.json({
            message: 'PDF uploaded successfully',
            pdfPath: book.pdfs[pdfType],
            pdfType
        });
    } catch (error) {
        console.error('Upload PDF error:', error);
        res.status(500).json({ error: 'Server error during PDF upload' });
    }
});

// Get book stats
router.get('/stats/available', async (req, res) => {
    try {
        const availableBooks = await Book.countDocuments({
            availableCopies: { $gt: 0 },
            isActive: true
        });

        const totalBooks = await Book.countDocuments({ isActive: true });

        res.json({
            availableBooks,
            totalBooks,
            borrowedBooks: totalBooks - availableBooks
        });
    } catch (error) {
        console.error('Get books stats error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get book by book ID (firstBookId or secondBookId)
router.get('/book-id/:bookId', async (req, res) => {
    try {
        const { bookId } = req.params;

        const book = await Book.findOne({
            $or: [
                { firstBookId: bookId },
                { secondBookId: bookId }
            ],
            isActive: true
        })
        .populate('addedBy', 'name email')
        .populate('category', 'name description')
        .populate('takingList', 'name email membershipId profileIMG');

        if (!book) {
            return res.status(404).json({ error: 'Book not found with this ID' });
        }

        res.json(book);
    } catch (error) {
        console.error('Get book by ID error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;