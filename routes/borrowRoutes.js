const express = require('express');
const router = express.Router();
const Borrow = require('../models/borrowSchema.js');
const User = require('../models/userSchema.js');
const Notification = require('../models/notificationSchema.js');
const passport = require('passport');
const Book = require('../models/bookSchema.js');

// Issue a book
router.post('/', passport.authenticate('jwt', { session: false }), async (req, res) => {
	try {
		// Check if user has permission
		if (req.user.role !== 'admin' && req.user.role !== 'librarian') {
			return res.status(403).json({ error: 'Access denied. Librarian or Admin only.' });
		}

		const { userId, bookId, dueDate } = req.body;

		// Validate required fields
		if (!userId || !bookId || !dueDate) {
			return res.status(400).json({ error: 'User ID, Book ID, and Due Date are required' });
		}

		// Check if user exists and is active
		const user = await User.findOne({ _id: userId, isActive: true });
		if (!user) {
			return res.status(404).json({ error: 'User not found or inactive' });
		}

		// Check if book exists and is active
		const book = await Book.findOne({ _id: bookId, isActive: true });
		if (!book) {
			return res.status(404).json({ error: 'Book not found or inactive' });
		}

		// Check if book is available
		if (book.availableCopies <= 0) {
			return res.status(400).json({ error: 'Book is not available for borrowing' });
		}

		// Check if user has any overdue books
		const overdueBooks = await Borrow.find({
			user: userId,
			status: 'overdue',
			finePaid: false
		});

		if (overdueBooks.length > 0) {
			return res.status(400).json({
				error: 'User has overdue books. Please clear fines first.'
			});
		}

		// Check if user already has this book issued
		const existingBorrow = await Borrow.findOne({
			user: userId,
			book: bookId,
			status: { $in: ['issued', 'overdue'] }
		});

		if (existingBorrow) {
			return res.status(400).json({ error: 'User already has this book issued' });
		}

		// Check maximum books per user (example: 5 books)
		const currentBorrows = await Borrow.countDocuments({
			user: userId,
			status: { $in: ['issued', 'overdue'] }
		});

		const MAX_BOOKS_PER_USER = 5;
		if (currentBorrows >= MAX_BOOKS_PER_USER) {
			return res.status(400).json({
				error: `User cannot borrow more than ${MAX_BOOKS_PER_USER} books at a time`
			});
		}

		// Create borrow record
		const borrow = new Borrow({
			user: userId,
			book: bookId,
			dueDate: new Date(dueDate),
			issuedBy: req.user._id
		});

		await borrow.save();

		// Update book available copies and add to taking list
		book.availableCopies -= 1;
		if (!book.takingList.includes(userId)) {
			book.takingList.push(userId);
		}
		await book.save();

		// Populate the borrow record for response
		await borrow.populate('user', 'name email membershipId');
		await borrow.populate('book', 'title author firstBookId secondBookId');
		await borrow.populate('issuedBy', 'name email');

		// Create notification for user
		const notification = new Notification({
			user: userId,
			title: 'Book Issued Successfully',
			message: `You have borrowed "${book.title}" by ${book.author}. Due date: ${new Date(dueDate).toLocaleDateString()}`,
			type: 'book_issued',
			relatedEntity: borrow._id,
			entityModel: 'Borrow'
		});
		await notification.save();

		res.status(201).json({
			message: 'Book issued successfully',
			borrow
		});
	} catch (error) {
		console.error('Issue book error:', error);
		if (error.name === 'ValidationError') {
			return res.status(400).json({ error: error.message });
		}
		res.status(500).json({ error: 'Server error during book issuance' });
	}
});

// Get all borrow records (Admin/Librarian only)
router.get('/', passport.authenticate('jwt', { session: false }), async (req, res) => {
	try {
		// Check if user has permission
		if (req.user.role !== 'admin' && req.user.role !== 'librarian') {
			return res.status(403).json({ error: 'Access denied. Admin or Librarian only.' });
		}

		const {
			page = 1,
			limit = 10,
			status,
			userId,
			bookId,
			overdue,
			sortBy = 'issueDate',
			sortOrder = 'desc'
		} = req.query;

		const query = {};

		// Status filter
		if (status) {
			query.status = status;
		}

		// User filter
		if (userId) {
			query.user = userId;
		}

		// Book filter
		if (bookId) {
			query.book = bookId;
		}

		// Overdue filter
		if (overdue === 'true') {
			query.dueDate = { $lt: new Date() };
			query.status = { $in: ['issued', 'overdue'] };
			query.returnDate = null;
		}

		// Sort options
		const sortOptions = {};
		sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

		const borrows = await Borrow.find(query)
			.populate('user', 'name email membershipId phone')
			.populate('book', 'title author firstBookId secondBookId coverImage')
			.populate('issuedBy', 'name email')
			.populate('returnedTo', 'name email')
			.sort(sortOptions)
			.limit(limit * 1)
			.skip((page - 1) * limit);

		const total = await Borrow.countDocuments(query);

		res.json({
			total,
			page: parseInt(page),
			pages: Math.ceil(total / limit),
			borrows
		});
	} catch (error) {
		console.error('Get borrow records error:', error);
		res.status(500).json({ error: 'Server error' });
	}
});

// Get user's borrow history
router.get('/user/:userId', passport.authenticate('jwt', { session: false }), async (req, res) => {
	try {
		const { userId } = req.params;

		// Check if user is accessing their own data or has permission
		if (req.user._id !== userId && req.user.role !== 'admin' && req.user.role !== 'librarian') {
			return res.status(403).json({ error: 'Access denied' });
		}

		const {
			page = 1,
			limit = 10,
			status,
			sortBy = 'issueDate',
			sortOrder = 'desc'
		} = req.query;

		const query = { user: userId };

		// Status filter
		if (status) {
			query.status = status;
		}

		// Sort options
		const sortOptions = {};
		sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

		const borrows = await Borrow.find(query)
			.populate('book', 'title author firstBookId secondBookId coverImage category')
			.populate('issuedBy', 'name email')
			.populate('returnedTo', 'name email')
			.sort(sortOptions)
			.limit(limit * 1)
			.skip((page - 1) * limit);

		const total = await Borrow.countDocuments(query);

		// Get user info
		const user = await User.findById(userId).select('name email membershipId');

		res.json({
			user,
			total,
			page: parseInt(page),
			pages: Math.ceil(total / limit),
			borrows
		});
	} catch (error) {
		console.error('Get user borrow history error:', error);
		res.status(500).json({ error: 'Server error' });
	}
});

// Get overdue books
router.get('/overdue', passport.authenticate('jwt', { session: false }), async (req, res) => {
	try {
		// Check if user has permission
		if (req.user.role !== 'admin' && req.user.role !== 'librarian') {
			return res.status(403).json({ error: 'Access denied. Admin or Librarian only.' });
		}

		const { page = 1, limit = 10 } = req.query;

		const currentDate = new Date();

		const overdueBorrows = await Borrow.find({
			dueDate: { $lt: currentDate },
			status: { $in: ['issued', 'overdue'] },
			returnDate: null
		})
			.populate('user', 'name email membershipId phone address')
			.populate('book', 'title author firstBookId secondBookId')
			.populate('issuedBy', 'name email')
			.sort({ dueDate: 1 })
			.limit(limit * 1)
			.skip((page - 1) * limit);

		const total = await Borrow.countDocuments({
			dueDate: { $lt: currentDate },
			status: { $in: ['issued', 'overdue'] },
			returnDate: null
		});

		// Calculate days overdue for each record
		const overdueWithDays = overdueBorrows.map(borrow => {
			const daysOverdue = Math.ceil((currentDate - borrow.dueDate) / (1000 * 60 * 60 * 24));
			return {
				...borrow.toObject(),
				daysOverdue
			};
		});

		res.json({
			total,
			page: parseInt(page),
			pages: Math.ceil(total / limit),
			overdueBooks: overdueWithDays
		});
	} catch (error) {
		console.error('Get overdue books error:', error);
		res.status(500).json({ error: 'Server error' });
	}
});

// Return a book
router.put('/:id/return', passport.authenticate('jwt', { session: false }), async (req, res) => {
	try {
		// Check if user has permission
		if (req.user.role !== 'admin' && req.user.role !== 'librarian') {
			return res.status(403).json({ error: 'Access denied. Librarian or Admin only.' });
		}

		const borrow = await Borrow.findById(req.params.id)
			.populate('user')
			.populate('book');

		if (!borrow) {
			return res.status(404).json({ error: 'Borrow record not found' });
		}

		if (borrow.status === 'returned') {
			return res.status(400).json({ error: 'Book already returned' });
		}

		const returnDate = new Date();
		borrow.returnDate = returnDate;
		borrow.returnedTo = req.user._id;

		// Calculate fine if overdue
		const dueDate = new Date(borrow.dueDate);
		if (returnDate > dueDate) {
			const daysOverdue = Math.ceil((returnDate - dueDate) / (1000 * 60 * 60 * 24));
			const FINE_PER_DAY = 10; // ₹10 per day
			const calculatedFine = daysOverdue * FINE_PER_DAY;

			borrow.fineAmount = calculatedFine;
			borrow.status = 'overdue';

			// Update user's total fine
			const user = await User.findById(borrow.user._id);
			user.totalFine += calculatedFine;
			await user.save();

			// Create fine notification
			const notification = new Notification({
				user: borrow.user._id,
				title: 'Overdue Fine Applied',
				message: `You have a fine of ₹${calculatedFine} for returning "${borrow.book.title}" ${daysOverdue} days late.`,
				type: 'fine_alert',
				relatedEntity: borrow._id,
				entityModel: 'Borrow'
			});
			await notification.save();
		} else {
			borrow.status = 'returned';
		}

		await borrow.save();

		// Update book available copies and remove from taking list
		const book = await Book.findById(borrow.book._id);
		book.availableCopies += 1;

		// Remove user from taking list
		book.takingList = book.takingList.filter(userId =>
			userId.toString() !== borrow.user._id.toString()
		);
		await book.save();

		// Populate the updated borrow record
		await borrow.populate('user', 'name email membershipId');
		await borrow.populate('book', 'title author firstBookId secondBookId');
		await borrow.populate('issuedBy', 'name email');
		await borrow.populate('returnedTo', 'name email');

		// Create return notification
		const returnNotification = new Notification({
			user: borrow.user._id,
			title: 'Book Returned Successfully',
			message: `You have returned "${borrow.book.title}". ${borrow.fineAmount > 0 ? `Fine applied: ₹${borrow.fineAmount}` : 'No fine applied.'}`,
			type: 'book_returned',
			relatedEntity: borrow._id,
			entityModel: 'Borrow'
		});
		await returnNotification.save();

		res.json({
			message: 'Book returned successfully',
			borrow,
			fineApplied: borrow.fineAmount > 0
		});
	} catch (error) {
		console.error('Return book error:', error);
		res.status(500).json({ error: 'Server error during book return' });
	}
});

// Renew a book
router.put('/:id/renew', passport.authenticate('jwt', { session: false }), async (req, res) => {
	try {
		const { fineAmount } = req.body; // Fine amount paid during renewal

		const borrow = await Borrow.findById(req.params.id)
			.populate('user')
			.populate('book');

		if (!borrow) {
			return res.status(404).json({ error: 'Borrow record not found' });
		}

		// Check if user owns this borrow record or has permission
		if (borrow.user._id.toString() !== req.user._id &&
			req.user.role !== 'admin' &&
			req.user.role !== 'librarian') {
			return res.status(403).json({ error: 'Access denied' });
		}

		if (borrow.status === 'returned') {
			return res.status(400).json({ error: 'Cannot renew a returned book' });
		}

		if (borrow.renewCount >= 2) {
			return res.status(400).json({ error: 'Maximum renewal limit reached (2 times)' });
		}

		const currentDate = new Date();
		const newDueDate = new Date(borrow.dueDate);
		newDueDate.setDate(newDueDate.getDate() + 14); // Extend by 14 days

		// Handle fine payment during renewal
		if (fineAmount && fineAmount > 0) {
			const paidAmount = parseFloat(fineAmount);
			
			if (paidAmount > borrow.fineAmount) {
				return res.status(400).json({ 
					error: `Paid amount (₹${paidAmount}) cannot be greater than due fine (₹${borrow.fineAmount})` 
				});
			}

			// Update fine amount (reduce by paid amount)
			borrow.fineAmount -= paidAmount;
			
			// If fine is fully paid, mark as paid
			if (borrow.fineAmount === 0) {
				borrow.finePaid = true;
			}

			// Update user's total fine (reduce by paid amount)
			const user = await User.findById(borrow.user._id);
			user.totalFine = Math.max(0, user.totalFine - paidAmount);
			await user.save();

			// Create fine payment notification
			const fineNotification = new Notification({
				user: borrow.user._id,
				title: 'Fine Paid During Renewal',
				message: `You have paid ₹${paidAmount} fine while renewing "${borrow.book.title}". Remaining fine: ₹${borrow.fineAmount}`,
				type: 'fine_paid',
				relatedEntity: borrow._id,
				entityModel: 'Borrow'
			});
			await fineNotification.save();
		}

		// Check if there are still pending fines after payment
		if (borrow.fineAmount > 0 && !borrow.finePaid) {
			return res.status(400).json({ 
				error: `Cannot renew book with pending fines. Remaining fine: ₹${borrow.fineAmount}` 
			});
		}

		borrow.dueDate = newDueDate;
		borrow.renewDate = currentDate;
		borrow.renewCount += 1;

		// Reset status to issued if it was overdue
		if (borrow.status === 'overdue') {
			borrow.status = 'issued';
		}

		await borrow.save();

		// Populate the updated borrow record
		await borrow.populate('user', 'name email membershipId');
		await borrow.populate('book', 'title author firstBookId secondBookId');
		await borrow.populate('issuedBy', 'name email');

		// Create renewal notification
		const notification = new Notification({
			user: borrow.user._id,
			title: 'Book Renewed Successfully',
			message: `You have renewed "${borrow.book.title}". New due date: ${newDueDate.toLocaleDateString()}`,
			type: 'book_renewed',
			relatedEntity: borrow._id,
			entityModel: 'Borrow'
		});
		await notification.save();

		res.json({
			message: 'Book renewed successfully',
			borrow,
			renewCount: borrow.renewCount,
			finePaid: fineAmount || 0,
			remainingFine: borrow.fineAmount
		});
	} catch (error) {
		console.error('Renew book error:', error);
		res.status(500).json({ error: 'Server error during book renewal' });
	}
});

// Pay fine for a borrow record
router.put('/:id/pay-fine', passport.authenticate('jwt', { session: false }), async (req, res) => {
	try {
		const { amount } = req.body; // Amount being paid now

		const borrow = await Borrow.findById(req.params.id)
			.populate('user')
			.populate('book');

		if (!borrow) {
			return res.status(404).json({ error: 'Borrow record not found' });
		}

		// Check if user owns this borrow record or has permission
		if (borrow.user._id.toString() !== req.user._id &&
			req.user.role !== 'admin' &&
			req.user.role !== 'librarian') {
			return res.status(403).json({ error: 'Access denied' });
		}

		if (borrow.fineAmount <= 0) {
			return res.status(400).json({ error: 'No fine to pay for this record' });
		}

		if (borrow.finePaid) {
			return res.status(400).json({ error: 'Fine already paid for this record' });
		}

		let paidAmount = 0;
		let remainingFine = borrow.fineAmount;

		// If specific amount is provided, handle partial payment
		if (amount && amount > 0) {
			paidAmount = parseFloat(amount);
			
			if (paidAmount > borrow.fineAmount) {
				return res.status(400).json({ 
					error: `Paid amount (₹${paidAmount}) cannot be greater than due fine (₹${borrow.fineAmount})` 
				});
			}

			// Update fine amount (reduce by paid amount)
			borrow.fineAmount -= paidAmount;
			remainingFine = borrow.fineAmount;
			
			// If fine is fully paid, mark as paid
			if (borrow.fineAmount === 0) {
				borrow.finePaid = true;
			}
		} else {
			// Pay full fine amount
			paidAmount = borrow.fineAmount;
			borrow.fineAmount = 0;
			borrow.finePaid = true;
			remainingFine = 0;
		}

		await borrow.save();

		// Update user's total fine (subtract the paid amount)
		const user = await User.findById(borrow.user._id);
		user.totalFine = Math.max(0, user.totalFine - paidAmount);
		await user.save();

		// Populate the updated borrow record
		await borrow.populate('user', 'name email membershipId');
		await borrow.populate('book', 'title author firstBookId secondBookId');

		// Create payment notification
		const notification = new Notification({
			user: borrow.user._id,
			title: 'Fine Paid Successfully',
			message: `You have paid ₹${paidAmount} fine for book "${borrow.book.title}". ${remainingFine > 0 ? `Remaining fine: ₹${remainingFine}` : 'All fines cleared.'}`,
			type: 'fine_paid',
			relatedEntity: borrow._id,
			entityModel: 'Borrow'
		});
		await notification.save();

		res.json({
			message: 'Fine paid successfully',
			borrow,
			paidAmount,
			remainingFine,
			isFullyPaid: borrow.finePaid
		});
	} catch (error) {
		console.error('Pay fine error:', error);
		res.status(500).json({ error: 'Server error during fine payment' });
	}
});

// Get single borrow record
router.get('/:id', passport.authenticate('jwt', { session: false }), async (req, res) => {
	try {
		const borrow = await Borrow.findById(req.params.id)
			.populate('user', 'name email membershipId phone address')
			.populate('book', 'title author firstBookId secondBookId coverImage category publisher')
			.populate('issuedBy', 'name email')
			.populate('returnedTo', 'name email');

		if (!borrow) {
			return res.status(404).json({ error: 'Borrow record not found' });
		}

		// Check if user has permission to view this record
		if (borrow.user._id.toString() !== req.user._id &&
			req.user.role !== 'admin' &&
			req.user.role !== 'librarian') {
			return res.status(403).json({ error: 'Access denied' });
		}

		// Calculate days remaining or overdue
		const currentDate = new Date();
		const dueDate = new Date(borrow.dueDate);
		let statusInfo = {};

		if (borrow.status === 'issued' || borrow.status === 'overdue') {
			if (currentDate > dueDate) {
				const daysOverdue = Math.ceil((currentDate - dueDate) / (1000 * 60 * 60 * 24));
				statusInfo = {
					status: 'overdue',
					daysOverdue
				};
			} else {
				const daysRemaining = Math.ceil((dueDate - currentDate) / (1000 * 60 * 60 * 24));
				statusInfo = {
					status: 'issued',
					daysRemaining
				};
			}
		}

		res.json({
			borrow,
			statusInfo
		});
	} catch (error) {
		console.error('Get borrow record error:', error);
		if (error.name === 'CastError') {
			return res.status(400).json({ error: 'Invalid borrow ID' });
		}
		res.status(500).json({ error: 'Server error' });
	}
});

// Get user's active borrows
router.get('/my/active', passport.authenticate('jwt', { session: false }), async (req, res) => {
	try {
		const activeBorrows = await Borrow.find({
			user: req.user._id,
			status: { $in: ['issued', 'overdue'] }
		})
			.populate('book', 'title author firstBookId secondBookId coverImage category')
			.populate('issuedBy', 'name email')
			.sort({ dueDate: 1 });

		// Calculate status info for each borrow
		const borrowsWithStatus = activeBorrows.map(borrow => {
			const currentDate = new Date();
			const dueDate = new Date(borrow.dueDate);
			let statusInfo = {};

			if (currentDate > dueDate) {
				const daysOverdue = Math.ceil((currentDate - dueDate) / (1000 * 60 * 60 * 24));
				statusInfo = {
					status: 'overdue',
					daysOverdue
				};
			} else {
				const daysRemaining = Math.ceil((dueDate - currentDate) / (1000 * 60 * 60 * 24));
				statusInfo = {
					status: 'issued',
					daysRemaining
				};
			}

			return {
				...borrow.toObject(),
				statusInfo
			};
		});

		res.json({
			count: activeBorrows.length,
			borrows: borrowsWithStatus
		});
	} catch (error) {
		console.error('Get active borrows error:', error);
		res.status(500).json({ error: 'Server error' });
	}
});

// Get borrow statistics
router.get('/stats/overview', passport.authenticate('jwt', { session: false }), async (req, res) => {
	try {
		// Check if user has permission
		if (req.user.role !== 'admin' && req.user.role !== 'librarian') {
			return res.status(403).json({ error: 'Access denied. Admin or Librarian only.' });
		}

		const totalBorrows = await Borrow.countDocuments();
		const activeBorrows = await Borrow.countDocuments({ 
			status: { $in: ['issued', 'overdue'] },
			returnDate: null
		});
		const returnedBorrows = await Borrow.countDocuments({ status: 'returned' });
		const overdueBorrows = await Borrow.countDocuments({
			status: { $in: ['issued', 'overdue'] },
			dueDate: { $lt: new Date() },
			returnDate: null
		});

		// Recent borrows (last 7 days)
		const sevenDaysAgo = new Date();
		sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

		const recentBorrows = await Borrow.countDocuments({
			issueDate: { $gte: sevenDaysAgo }
		});

		// Total fines collected
		const totalFinesResult = await Borrow.aggregate([
			{ $match: { finePaid: true } },
			{ $group: { _id: null, total: { $sum: '$fineAmount' } } }
		]);
		const totalFinesCollected = totalFinesResult.length > 0 ? totalFinesResult[0].total : 0;

		// Pending fines
		const pendingFinesResult = await Borrow.aggregate([
			{ $match: { fineAmount: { $gt: 0 }, finePaid: false } },
			{ $group: { _id: null, total: { $sum: '$fineAmount' } } }
		]);
		const pendingFines = pendingFinesResult.length > 0 ? pendingFinesResult[0].total : 0;

		res.json({
			totalBorrows,
			activeBorrows,
			returnedBorrows,
			overdueBorrows,
			recentBorrows,
			totalFinesCollected,
			pendingFines
		});
	} catch (error) {
		console.error('Get borrow stats error:', error);
		res.status(500).json({ error: 'Server error' });
	}
});

module.exports = router;