const dotenv = require("dotenv");
const jwt = require('jsonwebtoken');
const nodemailer = require("nodemailer");
dotenv.config();

let transporter = nodemailer.createTransport({
	host: process.env.SMTP_HOST,
	port: process.env.SMTP_PORT,
	secure: process.env.SMTP_PORT == 465,
	auth: {
		user: process.env.SMTP_MAIL,
		pass: process.env.SMTP_PASSWORD,
	},
});

const sendPasswordVerificationEmail = async (req, res, user) => {

	const secret = user._id + process.env.JWT_TOKEN_SECRET_KEY;
	const token = jwt.sign({ userID: user._id }, secret, { expiresIn: '15m' });

	const resetLink = `${process.env.FRONTEND_HOST}/PasswordChange/${user._id}/${token}`;

	const mailOptions = {
		from: process.env.SMTP_MAIL,
		to: user.email,
		subject: "Password Reset Link",
		html: `<p>Hello ${user.name},</p><p>Please <a href="${resetLink}">click here</a> to reset your password.</p>`
	};

	await transporter.sendMail(mailOptions);
};

module.exports = sendPasswordVerificationEmail;
