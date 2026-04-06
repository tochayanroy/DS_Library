const express = require('express');
const router = express.Router();
const ImageGallery = require('../models/imageGallery');
const { uploadGallery } = require('../middleware/multer');
const passport = require('passport');


router.post('/', passport.authenticate('jwt', { session: false }), uploadGallery, async (req, res) => {
  try {
    // Check if user has permission
    if (req.user.role !== 'admin' && req.user.role !== 'librarian') {
      return res.status(403).json({ error: 'Access denied. Admin or Librarian only.' });
    }

    const { category } = req.body;

    if (!category) {
      return res.status(400).json({ error: 'Category is required' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'At least one image file is required' });
    }

    // Check if gallery category already exists
    let gallery = await ImageGallery.findOne({ category: category.trim() });

    if (gallery) {
      // Add new images to existing category
      const newImages = req.files.map(file => ({
        imageUrl: file.path
      }));

      gallery.imageList.push(...newImages);
      await gallery.save();
    } else {
      // Create new gallery category
      const imageList = req.files.map(file => ({
        imageUrl: file.path
      }));

      gallery = new ImageGallery({
        category: category.trim(),
        imageList
      });

      await gallery.save();
    }

    res.status(201).json({
      message: `Images added to ${category} gallery successfully`,
      gallery: {
        _id: gallery._id,
        category: gallery.category,
        imageCount: gallery.imageList.length,
        images: gallery.imageList
      }
    });
  } catch (error) {
    console.error('Add gallery images error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Server error during image upload' });
  }
});


router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10,
      category,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {};

    // Category filter
    if (category) {
      query.category = { $regex: category, $options: 'i' };
    }

    // Sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const galleries = await ImageGallery.find(query)
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await ImageGallery.countDocuments(query);

    // Calculate total images across all galleries
    const totalImages = await ImageGallery.aggregate([
      { $match: query },
      { $group: { _id: null, total: { $sum: { $size: '$imageList' } } } }
    ]);

    res.json({
      totalCategories: total,
      totalImages: totalImages[0]?.total || 0,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      galleries: galleries.map(gallery => ({
        _id: gallery._id,
        category: gallery.category,
        imageCount: gallery.imageList.length,
        images: gallery.imageList,
        createdAt: gallery.createdAt,
        updatedAt: gallery.updatedAt
      }))
    });
  } catch (error) {
    console.error('Get galleries error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});


router.get('/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const gallery = await ImageGallery.findOne({ 
      category: { $regex: new RegExp(`^${category}$`, 'i') } 
    });

    if (!gallery) {
      return res.status(404).json({ error: 'Gallery category not found' });
    }

    // Paginate images within the category
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedImages = gallery.imageList.slice(startIndex, endIndex);

    res.json({
      _id: gallery._id,
      category: gallery.category,
      totalImages: gallery.imageList.length,
      page: parseInt(page),
      pages: Math.ceil(gallery.imageList.length / limit),
      images: paginatedImages,
      createdAt: gallery.createdAt,
      updatedAt: gallery.updatedAt
    });
  } catch (error) {
    console.error('Get gallery by category error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});


router.get('/search/categories', async (req, res) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const categories = await ImageGallery.find({
      category: { $regex: q, $options: 'i' }
    })
    .select('category imageList')
    .limit(10)
    .sort({ category: 1 });

    res.json({
      count: categories.length,
      categories: categories.map(cat => ({
        _id: cat._id,
        category: cat.category,
        imageCount: cat.imageList.length
      }))
    });
  } catch (error) {
    console.error('Search gallery categories error:', error);
    res.status(500).json({ error: 'Server error during search' });
  }
});


router.delete('/images/:imageId', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    // Check if user has permission
    if (req.user.role !== 'admin' && req.user.role !== 'librarian') {
      return res.status(403).json({ error: 'Access denied. Admin or Librarian only.' });
    }

    const { imageId } = req.params;

    // Find the gallery that contains this image
    const gallery = await ImageGallery.findOne({
      'imageList._id': imageId
    });

    if (!gallery) {
      return res.status(404).json({ error: 'Image not found in any gallery' });
    }

    // Remove the image from the array
    gallery.imageList = gallery.imageList.filter(
      image => image._id.toString() !== imageId
    );

    await gallery.save();

    res.json({
      message: 'Image deleted successfully',
      gallery: {
        _id: gallery._id,
        category: gallery.category,
        remainingImages: gallery.imageList.length
      }
    });
  } catch (error) {
    console.error('Delete image error:', error);
    res.status(500).json({ error: 'Server error during image deletion' });
  }
});


router.delete('/category/:category', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    // Check if user has permission (only admin can delete categories)
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin only.' });
    }

    const { category } = req.params;

    const gallery = await ImageGallery.findOneAndDelete({ 
      category: { $regex: new RegExp(`^${category}$`, 'i') } 
    });

    if (!gallery) {
      return res.status(404).json({ error: 'Gallery category not found' });
    }

    res.json({
      message: 'Gallery category deleted successfully',
      deletedCategory: {
        category: gallery.category,
        imagesCount: gallery.imageList.length
      }
    });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Server error during category deletion' });
  }
});


router.put('/category/:category', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    // Check if user has permission
    if (req.user.role !== 'admin' && req.user.role !== 'librarian') {
      return res.status(403).json({ error: 'Access denied. Admin or Librarian only.' });
    }

    const { category } = req.params;
    const { newCategory } = req.body;

    if (!newCategory) {
      return res.status(400).json({ error: 'New category name is required' });
    }

    // Check if new category name already exists
    const existingCategory = await ImageGallery.findOne({ 
      category: { $regex: new RegExp(`^${newCategory}$`, 'i') } 
    });

    if (existingCategory) {
      return res.status(400).json({ error: 'Category name already exists' });
    }

    const gallery = await ImageGallery.findOneAndUpdate(
      { category: { $regex: new RegExp(`^${category}$`, 'i') } },
      { category: newCategory.trim() },
      { new: true, runValidators: true }
    );

    if (!gallery) {
      return res.status(404).json({ error: 'Gallery category not found' });
    }

    res.json({
      message: 'Category name updated successfully',
      gallery: {
        _id: gallery._id,
        category: gallery.category,
        imageCount: gallery.imageList.length
      }
    });
  } catch (error) {
    console.error('Update category error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Server error during category update' });
  }
});


router.get('/stats/overview', async (req, res) => {
  try {
    const totalCategories = await ImageGallery.countDocuments();
    
    const imageStats = await ImageGallery.aggregate([
      {
        $group: {
          _id: null,
          totalImages: { $sum: { $size: '$imageList' } },
          avgImagesPerCategory: { $avg: { $size: '$imageList' } }
        }
      }
    ]);

    // Get categories with most images
    const topCategories = await ImageGallery.aggregate([
      {
        $project: {
          category: 1,
          imageCount: { $size: '$imageList' }
        }
      },
      { $sort: { imageCount: -1 } },
      { $limit: 5 }
    ]);

    // Recent categories (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentCategories = await ImageGallery.countDocuments({
      createdAt: { $gte: sevenDaysAgo }
    });

    const stats = imageStats[0] || {
      totalImages: 0,
      avgImagesPerCategory: 0
    };

    res.json({
      totalCategories,
      totalImages: stats.totalImages,
      avgImagesPerCategory: Math.round(stats.avgImagesPerCategory * 100) / 100,
      recentCategories,
      topCategories
    });
  } catch (error) {
    console.error('Get gallery stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});


router.get('/categories/list', async (req, res) => {
  try {
    const categories = await ImageGallery.find()
      .select('category imageList')
      .sort({ category: 1 });

    res.json({
      count: categories.length,
      categories: categories.map(cat => ({
        _id: cat._id,
        category: cat.category,
        imageCount: cat.imageList.length
      }))
    });
  } catch (error) {
    console.error('Get categories list error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});


router.post('/:category/upload', passport.authenticate('jwt', { session: false }), uploadGallery, async (req, res) => {
  try {
    // Check if user has permission
    if (req.user.role !== 'admin' && req.user.role !== 'librarian') {
      return res.status(403).json({ error: 'Access denied. Admin or Librarian only.' });
    }

    const { category } = req.params;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'At least one image file is required' });
    }

    const gallery = await ImageGallery.findOne({ 
      category: { $regex: new RegExp(`^${category}$`, 'i') } 
    });

    if (!gallery) {
      return res.status(404).json({ error: 'Gallery category not found' });
    }

    // Add new images to existing category
    const newImages = req.files.map(file => ({
      imageUrl: file.path
    }));

    gallery.imageList.push(...newImages);
    await gallery.save();

    res.status(200).json({
      message: `Images added to ${gallery.category} gallery successfully`,
      gallery: {
        _id: gallery._id,
        category: gallery.category,
        imageCount: gallery.imageList.length,
        newImages: newImages.length
      }
    });
  } catch (error) {
    console.error('Upload to category error:', error);
    res.status(500).json({ error: 'Server error during image upload' });
  }
});


router.get('/random/images', async (req, res) => {
  try {
    const { limit = 12 } = req.query;

    const allGalleries = await ImageGallery.find();

    if (allGalleries.length === 0) {
      return res.json({
        count: 0,
        images: []
      });
    }

    // Collect all images from all galleries
    let allImages = [];
    allGalleries.forEach(gallery => {
      const galleryImages = gallery.imageList.map(image => ({
        ...image.toObject(),
        category: gallery.category
      }));
      allImages = allImages.concat(galleryImages);
    });

    // Shuffle and get random images
    const shuffled = allImages.sort(() => 0.5 - Math.random());
    const randomImages = shuffled.slice(0, parseInt(limit));

    res.json({
      count: randomImages.length,
      images: randomImages
    });
  } catch (error) {
    console.error('Get random images error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;