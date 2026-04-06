const express = require('express');
const router = express.Router();
const Notification = require('../models/notificationSchema');
const User = require('../models/userSchema');
const Book = require('../models/bookSchema');
const Borrow = require('../models/borrowSchema');
const passport = require('passport');





router.get('/', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      type,
      isRead,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = { user: req.user._id };

    // Type filter
    if (type) {
      query.type = type;
    }

    // Read status filter
    if (isRead === 'true') {
      query.isRead = true;
    } else if (isRead === 'false') {
      query.isRead = false;
    }

    // Sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const notifications = await Notification.find(query)
      .populate('relatedEntity')
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({ 
      user: req.user._id, 
      isRead: false 
    });

    res.json({
      total,
      unreadCount,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      notifications
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});


router.get('/unread', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const unreadNotifications = await Notification.find({
      user: req.user._id,
      isRead: false
    })
      .populate('relatedEntity')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Notification.countDocuments({ 
      user: req.user._id, 
      isRead: false 
    });

    res.json({
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      notifications: unreadNotifications
    });
  } catch (error) {
    console.error('Get unread notifications error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});


router.put('/:id/read', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    if (notification.isRead) {
      return res.status(400).json({ error: 'Notification already marked as read' });
    }

    notification.isRead = true;
    await notification.save();

    // Get updated unread count
    const unreadCount = await Notification.countDocuments({ 
      user: req.user._id, 
      isRead: false 
    });

    res.json({
      message: 'Notification marked as read',
      notification,
      unreadCount
    });
  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});


router.put('/read-all', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { 
        user: req.user._id,
        isRead: false 
      },
      { 
        isRead: true 
      }
    );

    res.json({
      message: 'All notifications marked as read',
      updatedCount: result.modifiedCount,
      unreadCount: 0
    });
  } catch (error) {
    console.error('Mark all notifications as read error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});


router.post('/', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    // Check if user has permission
    if (req.user.role !== 'admin' && req.user.role !== 'librarian') {
      return res.status(403).json({ error: 'Access denied. Admin or Librarian only.' });
    }

    const { userId, title, message, type, relatedEntity, entityModel } = req.body;

    // Validate required fields
    if (!userId || !title || !message) {
      return res.status(400).json({ error: 'User ID, title, and message are required' });
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Validate related entity if provided
    if (relatedEntity) {
      if (!entityModel) {
        return res.status(400).json({ error: 'Entity model is required when related entity is provided' });
      }

      let entity;
      switch (entityModel) {
        case 'Book':
          entity = await Book.findById(relatedEntity);
          break;
        case 'Borrow':
          entity = await Borrow.findById(relatedEntity);
          break;
        case 'Fine':
          // Assuming you have a Fine model
          // entity = await Fine.findById(relatedEntity);
          break;
        default:
          return res.status(400).json({ error: 'Invalid entity model' });
      }

      if (!entity) {
        return res.status(404).json({ error: 'Related entity not found' });
      }
    }

    const notification = new Notification({
      user: userId,
      title,
      message,
      type: type || 'general',
      relatedEntity,
      entityModel
    });

    await notification.save();

    // Populate the notification for response
    await notification.populate('user', 'name email membershipId');

    res.status(201).json({
      message: 'Notification created successfully',
      notification
    });
  } catch (error) {
    console.error('Create notification error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Server error during notification creation' });
  }
});


router.post('/bulk', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    // Check if user has permission
    if (req.user.role !== 'admin' && req.user.role !== 'librarian') {
      return res.status(403).json({ error: 'Access denied. Admin or Librarian only.' });
    }

    const { userIds, title, message, type, relatedEntity, entityModel } = req.body;

    // Validate required fields
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'User IDs array is required and must not be empty' });
    }

    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' });
    }

    // Check if all users exist
    const users = await User.find({ _id: { $in: userIds } });
    if (users.length !== userIds.length) {
      return res.status(400).json({ error: 'One or more users not found' });
    }

    // Create notifications for each user
    const notifications = userIds.map(userId => ({
      user: userId,
      title,
      message,
      type: type || 'general',
      relatedEntity,
      entityModel,
      createdAt: new Date(),
      updatedAt: new Date()
    }));

    const result = await Notification.insertMany(notifications);

    res.status(201).json({
      message: `Notifications sent to ${result.length} users successfully`,
      count: result.length,
      notifications: result
    });
  } catch (error) {
    console.error('Create bulk notifications error:', error);
    res.status(500).json({ error: 'Server error during bulk notification creation' });
  }
});

router.delete('/:id', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    await Notification.findByIdAndDelete(req.params.id);

    // Get updated counts
    const totalCount = await Notification.countDocuments({ user: req.user._id });
    const unreadCount = await Notification.countDocuments({ 
      user: req.user._id, 
      isRead: false 
    });

    res.json({
      message: 'Notification deleted successfully',
      totalCount,
      unreadCount
    });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ error: 'Server error during notification deletion' });
  }
});


router.delete('/clear-read', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const result = await Notification.deleteMany({
      user: req.user._id,
      isRead: true
    });

    const totalCount = await Notification.countDocuments({ user: req.user._id });
    const unreadCount = await Notification.countDocuments({ 
      user: req.user._id, 
      isRead: false 
    });

    res.json({
      message: 'All read notifications cleared successfully',
      deletedCount: result.deletedCount,
      totalCount,
      unreadCount
    });
  } catch (error) {
    console.error('Clear read notifications error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});


router.get('/stats', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const totalNotifications = await Notification.countDocuments({ 
      user: req.user._id 
    });

    const unreadCount = await Notification.countDocuments({ 
      user: req.user._id, 
      isRead: false 
    });

    // Count by type
    const typeStats = await Notification.aggregate([
      { $match: { user: req.user._id } },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          unread: {
            $sum: { $cond: ['$isRead', 0, 1] }
          }
        }
      }
    ]);

    // Recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentNotifications = await Notification.countDocuments({
      user: req.user._id,
      createdAt: { $gte: sevenDaysAgo }
    });

    res.json({
      total: totalNotifications,
      unread: unreadCount,
      read: totalNotifications - unreadCount,
      recent: recentNotifications,
      byType: typeStats
    });
  } catch (error) {
    console.error('Get notification stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});


router.post('/due-reminders', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    // Check if user has permission
    if (req.user.role !== 'admin' && req.user.role !== 'librarian') {
      return res.status(403).json({ error: 'Access denied. Admin or Librarian only.' });
    }

    const { daysBefore = 1 } = req.body;

    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + parseInt(daysBefore));

    // Find borrows that are due on the target date
    const dueBorrows = await Borrow.find({
      dueDate: {
        $gte: new Date(targetDate.setHours(0, 0, 0, 0)),
        $lt: new Date(targetDate.setHours(23, 59, 59, 999))
      },
      status: 'issued',
      returnDate: null
    })
      .populate('user', 'name email')
      .populate('book', 'title author');

    if (dueBorrows.length === 0) {
      return res.json({
        message: 'No due reminders to send',
        count: 0
      });
    }

    // Create due reminder notifications
    const notifications = dueBorrows.map(borrow => ({
      user: borrow.user._id,
      title: 'Book Due Reminder',
      message: `Your book "${borrow.book.title}" is due tomorrow (${new Date(borrow.dueDate).toLocaleDateString()}). Please return it on time to avoid fines.`,
      type: 'due_reminder',
      relatedEntity: borrow._id,
      entityModel: 'Borrow',
      createdAt: new Date(),
      updatedAt: new Date()
    }));

    const result = await Notification.insertMany(notifications);

    res.status(201).json({
      message: `Due reminders sent to ${result.length} users`,
      count: result.length,
      borrows: dueBorrows.map(b => ({
        user: b.user.name,
        book: b.book.title,
        dueDate: b.dueDate
      }))
    });
  } catch (error) {
    console.error('Send due reminders error:', error);
    res.status(500).json({ error: 'Server error during due reminders sending' });
  }
});


router.post('/book-available', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    // Check if user has permission
    if (req.user.role !== 'admin' && req.user.role !== 'librarian') {
      return res.status(403).json({ error: 'Access denied. Admin or Librarian only.' });
    }

    const { bookId } = req.body;

    if (!bookId) {
      return res.status(400).json({ error: 'Book ID is required' });
    }

    const book = await Book.findById(bookId);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    // Get users who have this book in their taking list (waiting for it)
    const users = await User.find({ _id: { $in: book.takingList } });

    if (users.length === 0) {
      return res.json({
        message: 'No users waiting for this book',
        count: 0
      });
    }

    // Create book available notifications
    const notifications = users.map(user => ({
      user: user._id,
      title: 'Book Now Available',
      message: `The book "${book.title}" by ${book.author} is now available for borrowing.`,
      type: 'book_available',
      relatedEntity: book._id,
      entityModel: 'Book',
      createdAt: new Date(),
      updatedAt: new Date()
    }));

    const result = await Notification.insertMany(notifications);

    res.status(201).json({
      message: `Book available notifications sent to ${result.length} users`,
      count: result.length,
      book: {
        title: book.title,
        author: book.author
      }
    });
  } catch (error) {
    console.error('Send book available notifications error:', error);
    res.status(500).json({ error: 'Server error during book available notifications' });
  }
});


router.get('/:id', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      user: req.user._id
    })
      .populate('relatedEntity')
      .populate('user', 'name email membershipId');

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    // Mark as read when fetched individually
    if (!notification.isRead) {
      notification.isRead = true;
      await notification.save();
    }

    res.json(notification);
  } catch (error) {
    console.error('Get notification by ID error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid notification ID' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;