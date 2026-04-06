const express = require('express');
const router = express.Router();
const passport = require('passport');

const Category = require('../models/categorySchema.js');



// Create category (Admin/Librarian only)
router.post('/createCategory', passport.authenticate('jwt', { session: false }), async (req, res) => {
    try {
        // Check if user has permission
        if (req.user.role !== 'admin' && req.user.role !== 'librarian') {
            return res.status(403).json({ error: 'Access denied. Admin or Librarian only.' });
        }

        const { name, description } = req.body;

        // Check if category already exists
        const existingCategory = await Category.findOne({ name });
        if (existingCategory) {
            return res.status(400).json({ error: 'Category already exists' });
        }

        const category = new Category({
            name,
            description: description || '',
            addedBy: req.user._id
        });

        await category.save();

        // Populate addedBy field for response
        await category.populate('addedBy', 'name email');

        res.status(201).json({
            message: 'Category created successfully',
            category
        });
    } catch (error) {
        console.error('Create category error:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Server error during category creation' });
    }
});

// Get all categories
router.get('/GetAllCategories', async (req, res) => {
    try {
        const { page = 1, limit = 10, activeOnly = 'true' } = req.query;

        const query = {};
        if (activeOnly === 'true') {
            query.isActive = true;
        }

        const categories = await Category.find(query)
            .populate('addedBy', 'name email')
            .sort({ name: 1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await Category.countDocuments(query);

        res.json({
            total,
            page: parseInt(page),
            pages: Math.ceil(total / limit),
            categories
        });
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get category by ID
router.get('/GetCategoryById/:id', async (req, res) => {
    try {
        const category = await Category.findById(req.params.id)
            .populate('addedBy', 'name email');

        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }

        res.json(category);
    } catch (error) {
        console.error('Get category error:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ error: 'Invalid category ID' });
        }
        res.status(500).json({ error: 'Server error' });
    }
});

// Update category (Admin/Librarian only)
router.put('/UpdateCategoryById/:id', passport.authenticate('jwt', { session: false }), async (req, res) => {
    try {
        // Check if user has permission
        if (req.user.role !== 'admin' && req.user.role !== 'librarian') {
            return res.status(403).json({ error: 'Access denied. Admin or Librarian only.' });
        }

        const { name, description } = req.body;

        const updateData = {};
        if (name) updateData.name = name;
        if (description !== undefined) updateData.description = description;

        // Check if name already exists (excluding current category)
        if (name) {
            const existingCategory = await Category.findOne({ 
                name, 
                _id: { $ne: req.params.id } 
            });
            if (existingCategory) {
                return res.status(400).json({ error: 'Category name already exists' });
            }
        }

        const category = await Category.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        ).populate('addedBy', 'name email');

        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }

        res.json({
            message: 'Category updated successfully',
            category
        });
    } catch (error) {
        console.error('Update category error:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Server error during category update' });
    }
});

// Delete category (Admin only)
router.delete('/DeleteCategory/:id', passport.authenticate('jwt', { session: false }), async (req, res) => {
    try {
        // Check if user has permission (only admin can delete)
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied. Admin only.' });
        }

        const category = await Category.findById(req.params.id);
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }

        // Check if category is being used by any books
        const Book = require('../models/bookSchema.js');
        const booksWithCategory = await Book.findOne({ category: req.params.id });
        if (booksWithCategory) {
            return res.status(400).json({
                error: 'Cannot delete category. It is being used by one or more books.'
            });
        }

        await Category.findByIdAndDelete(req.params.id);

        res.json({ message: 'Category deleted successfully' });
    } catch (error) {
        console.error('Delete category error:', error);
        res.status(500).json({ error: 'Server error during category deletion' });
    }
});

// Deactivate category (Admin/Librarian only)
router.put('/deactivateCategory/:id', passport.authenticate('jwt', { session: false }), async (req, res) => {
    try {
        // Check if user has permission
        if (req.user.role !== 'admin' && req.user.role !== 'librarian') {
            return res.status(403).json({ error: 'Access denied. Admin or Librarian only.' });
        }

        const category = await Category.findByIdAndUpdate(
            req.params.id,
            { isActive: false },
            { new: true }
        ).populate('addedBy', 'name email');

        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }

        res.json({
            message: 'Category deactivated successfully',
            category
        });
    } catch (error) {
        console.error('Deactivate category error:', error);
        res.status(500).json({ error: 'Server error during category deactivation' });
    }
});

// Activate category (Admin/Librarian only)
router.put('/activateCategory/:id', passport.authenticate('jwt', { session: false }), async (req, res) => {
    try {
        // Check if user has permission
        if (req.user.role !== 'admin' && req.user.role !== 'librarian') {
            return res.status(403).json({ error: 'Access denied. Admin or Librarian only.' });
        }

        const category = await Category.findByIdAndUpdate(
            req.params.id,
            { isActive: true },
            { new: true }
        ).populate('addedBy', 'name email');

        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }

        res.json({
            message: 'Category activated successfully',
            category
        });
    } catch (error) {
        console.error('Activate category error:', error);
        res.status(500).json({ error: 'Server error during category activation' });
    }
});

// Search categories
router.get('/search/:query', async (req, res) => {
    try {
        const { query } = req.params;

        const categories = await Category.find({
            $or: [
                { name: { $regex: query, $options: 'i' } },
                { description: { $regex: query, $options: 'i' } }
            ],
            isActive: true
        })
        .populate('addedBy', 'name email')
        .sort({ name: 1 })
        .limit(20);

        res.json({
            count: categories.length,
            categories
        });
    } catch (error) {
        console.error('Search categories error:', error);
        res.status(500).json({ error: 'Server error during search' });
    }
});

module.exports = router;