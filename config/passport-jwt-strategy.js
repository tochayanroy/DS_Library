const User_Schima = require('../models/userSchema');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const passport = require('passport');
var opts = {
	jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
	secretOrKey: process.env.JWT_SECRET
}

passport.use(new JwtStrategy(opts, async function (jwt_payload, done) {

	try {
		const user = await User_Schima.findOne({ _id: jwt_payload.userId }).select('-password');
		
		if (user) {
			return done(null, user)
		} else {
			return done(null, false)
		}
	} catch (error) {
		return done(err, false);
	}
}));



