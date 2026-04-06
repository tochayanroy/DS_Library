const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const passport = require('passport');
const jwt = require('jsonwebtoken');

const { uploadProfile } = require('../middleware/multer.js');
const generateTokens = require('../utils/generateTokens.js');

const User = require('../models/userSchema.js');










router.post('/register', async (req, res) => {
	try {
		const { name, email, password, phone, address, role } = req.body;

		// Check if user already exists
		const existingUser = await User.findOne({ email });
		if (existingUser) {
			return res.status(400).json({ error: 'User already exists with this email' });
		}

		// Generate membership ID
		const membershipId = 'MEM' + Date.now();

		// Hash password
		const salt = await bcrypt.genSalt(10);
		const hashedPassword = await bcrypt.hash(password, salt);

		// Create new user
		const user = new User({
			name,
			email,
			password: hashedPassword,
			phone,
			address,
			role: role || 'user',
			membershipId
		});

		await user.save();

		// Create JWT token
		const token = jwt.sign(
			{ userId: user._id, role: user.role },
			process.env.JWT_SECRET,
			{ expiresIn: '7d' }
		);

		// Return user data without password
		const userResponse = {
			_id: user._id,
			profileIMG: user.profileIMG,
			name: user.name,
			email: user.email,
			phone: user.phone,
			address: user.address,
			role: user.role,
			membershipId: user.membershipId,
			isActive: user.isActive,
			totalFine: user.totalFine,
			createdAt: user.createdAt,
			updatedAt: user.updatedAt
		};


		res.status(201).json({
			message: 'User registered successfully',
			user: userResponse,
			token
		});
	} catch (error) {
		console.error('Registration error:', error);
		res.status(500).json({ error: 'Server error during registration' });
	}
});


router.post('/login', async (req, res) => {
	try {
		const { email, password } = req.body;

		// Check if user exists
		const user = await User.findOne({ email, isActive: true });
		if (!user) {
			return res.status(400).json({ error: 'Invalid credentials' });
		}

		// Check password
		const isMatch = await bcrypt.compare(password, user.password);
		if (!isMatch) {
			return res.status(400).json({ error: 'Invalid credentials' });
		}

		// Create JWT token
		const token = jwt.sign(
			{ userId: user._id, role: user.role },
			process.env.JWT_SECRET,
			{ expiresIn: '7d' }
		);

		// Return user data without password
		const userResponse = {
			_id: user._id,
			profileIMG: user.profileIMG,
			name: user.name,
			email: user.email,
			phone: user.phone,
			address: user.address,
			role: user.role,
			membershipId: user.membershipId,
			isActive: user.isActive,
			totalFine: user.totalFine,
			createdAt: user.createdAt,
			updatedAt: user.updatedAt
		};

		res.json({
			message: 'Login successful',
			user: userResponse,
			token
		});
	} catch (error) {
		console.error('Login error:', error);
		res.status(500).json({ error: 'Server error during login' });
	}
});


router.get('/profile', passport.authenticate('jwt', { session: false }), async (req, res) => {
	try {
		const user = await User.findById(req.user._id).select('-password');
		if (!user) {
			return res.status(404).json({ error: 'User not found' });
		}

		res.json(user);
	} catch (error) {
		console.error('Get profile error:', error);
		res.status(500).json({ error: 'Server error' });
	}
});


router.put('/updateProfile', passport.authenticate('jwt', { session: false }), async (req, res) => {
	try {
		const { name, phone, address } = req.body;

		const updateData = {};
		if (name) updateData.name = name;
		if (phone) updateData.phone = phone;
		if (address) updateData.address = address;

		const user = await User.findByIdAndUpdate(
			req.user._id,
			updateData,
			{ new: true, runValidators: true }
		).select('-password');

		if (!user) {
			return res.status(404).json({ error: 'User not found' });
		}

		res.json({
			message: 'Profile updated successfully',
			user
		});
	} catch (error) {
		console.error('Update profile error:', error);
		res.status(500).json({ error: 'Server error during profile update' });
	}
});


router.post('/uploadProfileImage', passport.authenticate('jwt', { session: false }), uploadProfile, async (req, res) => {
	try {
		if (!req.file) {
			return res.status(400).json({ error: 'No file uploaded' });
		}

		const profileImagePath = req.file.path;

		// Update user's profile image
		const user = await User.findByIdAndUpdate(
			req.user._id,
			{ profileIMG: profileImagePath },
			{ new: true }
		).select('-password');

		if (!user) {
			return res.status(404).json({ error: 'User not found' });
		}

		res.json({
			message: 'Profile image uploaded successfully',
			profileIMG: user.profileIMG
		});
	} catch (error) {
		console.error('Upload profile image error:', error);
		res.status(500).json({ error: 'Server error during image upload' });
	}
});


router.put('/change-password', passport.authenticate('jwt', { session: false }), async (req, res) => {
	try {
		const { currentPassword, newPassword } = req.body;

		// Find user
		const user = await User.findById(req.user._id);
		if (!user) {
			return res.status(404).json({ error: 'User not found' });
		}

		// Verify current password
		const isMatch = await bcrypt.compare(currentPassword, user.password);
		if (!isMatch) {
			return res.status(400).json({ error: 'Current password is incorrect' });
		}

		// Hash new password
		const salt = await bcrypt.genSalt(10);
		const hashedPassword = await bcrypt.hash(newPassword, salt);

		// Update password
		user.password = hashedPassword;
		await user.save();

		res.json({ message: 'Password changed successfully' });
	} catch (error) {
		console.error('Change password error:', error);
		res.status(500).json({ error: 'Server error during password change' });
	}
});













// =====================ADMIN=======================
// =====================ADMIN=======================
// =====================ADMIN=======================








router.get('/allUsers', passport.authenticate('jwt', { session: false }), async (req, res) => {
	try {
		// Check if user has permission
		if (req.user.role !== 'admin' && req.user.role !== 'librarian') {
			return res.status(403).json({ error: 'Access denied' });
		}

		const users = await User.find().select('-password').sort({ createdAt: -1 });

		res.json({
			count: users.length,
			users
		});
	} catch (error) {
		console.error('Get users error:', error);
		res.status(500).json({ error: 'Server error' });
	}
});


router.get('/getUserById/:id', passport.authenticate('jwt', { session: false }), async (req, res) => {
	try {
		// Check if user has permission
		if (req.user.role !== 'admin' && req.user.role !== 'librarian') {
			return res.status(403).json({ error: 'Access denied' });
		}

		const user = await User.findById(req.params.id).select('-password');
		if (!user) {
			return res.status(404).json({ error: 'User not found' });
		}

		res.json(user);
	} catch (error) {
		console.error('Get user by ID error:', error);
		res.status(500).json({ error: 'Server error' });
	}
});


router.put('/updateUserById/:id', passport.authenticate('jwt', { session: false }), async (req, res) => {
	try {
		// Check if user has permission
		if (req.user.role !== 'admin' && req.user.role !== 'librarian') {
			return res.status(403).json({ error: 'Access denied' });
		}

		const { name, email, phone, address, role, isActive, totalFine } = req.body;

		const updateData = {};
		if (name) updateData.name = name;
		if (email) updateData.email = email;
		if (phone) updateData.phone = phone;
		if (address) updateData.address = address;
		if (role) updateData.role = role;
		if (typeof isActive !== 'undefined') updateData.isActive = isActive;
		if (totalFine !== undefined) updateData.totalFine = totalFine;

		const user = await User.findByIdAndUpdate(
			req.params.id,
			updateData,
			{ new: true, runValidators: true }
		).select('-password');

		if (!user) {
			return res.status(404).json({ error: 'User not found' });
		}

		res.json({
			message: 'User updated successfully',
			user
		});
	} catch (error) {
		console.error('Update user error:', error);
		res.status(500).json({ error: 'Server error during user update' });
	}
});


router.delete('/deleteUser/:id', passport.authenticate('jwt', { session: false }), async (req, res) => {
	try {
		// Check if user has permission (only admin can delete)
		if (req.user.role !== 'admin') {
			return res.status(403).json({ error: 'Access denied. Admin only.' });
		}

		// Prevent self-deletion
		if (req.params.id === req.user._id) {
			return res.status(400).json({ error: 'Cannot delete your own account' });
		}

		const user = await User.findByIdAndDelete(req.params.id);
		if (!user) {
			return res.status(404).json({ error: 'User not found' });
		}

		res.json({ message: 'User deleted successfully' });
	} catch (error) {
		console.error('Delete user error:', error);
		res.status(500).json({ error: 'Server error during user deletion' });
	}
});


router.put('/deactivate/:id', passport.authenticate('jwt', { session: false }), async (req, res) => {
	try {
		// Check if user has permission
		if (req.user.role !== 'admin' && req.user.role !== 'librarian') {
			return res.status(403).json({ error: 'Access denied' });
		}

		// Prevent self-deactivation
		if (req.params.id === req.user._id) {
			return res.status(400).json({ error: 'Cannot deactivate your own account' });
		}

		const user = await User.findByIdAndUpdate(
			req.params.id,
			{ isActive: false },
			{ new: true }
		).select('-password');

		if (!user) {
			return res.status(404).json({ error: 'User not found' });
		}

		res.json({
			message: 'User deactivated successfully',
			user
		});
	} catch (error) {
		console.error('Deactivate user error:', error);
		res.status(500).json({ error: 'Server error during user deactivation' });
	}
});


router.put('/activate/:id', passport.authenticate('jwt', { session: false }), async (req, res) => {
	try {
		// Check if user has permission
		if (req.user.role !== 'admin' && req.user.role !== 'librarian') {
			return res.status(403).json({ error: 'Access denied' });
		}

		const user = await User.findByIdAndUpdate(
			req.params.id,
			{ isActive: true },
			{ new: true }
		).select('-password');

		if (!user) {
			return res.status(404).json({ error: 'User not found' });
		}

		res.json({
			message: 'User activated successfully',
			user
		});
	} catch (error) {
		console.error('Activate user error:', error);
		res.status(500).json({ error: 'Server error during user activation' });
	}
});


module.exports = router;