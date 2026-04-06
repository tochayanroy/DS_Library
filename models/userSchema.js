const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
	profileIMG: {
		type: String
	},
	name: {
		type: String,
		required: true,
		trim: true
	},
	email: {
		type: String,
		required: true,
		unique: true,
		lowercase: true
	},
	password: {
		type: String,
		required: true,
		minlength: 6
	},
	phone: {
		type: String,
		required: true
	},
	address: {
		type: String,
		required: true
	},
	role: {
		type: String,
		enum: ['user', 'admin', 'librarian'],
		default: 'user'
	},
	membershipId: {
		type: String,
		unique: true
	},
	isActive: {
		type: Boolean,
		default: true
	},
	totalFine: {
		type: Number,
		default: 0
	}
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);