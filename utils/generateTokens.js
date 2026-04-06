const jwt = require('jsonwebtoken');

const generateTokens = async (user) => {
    try {
        const payload = { _id: user._id, role: user.role };

        const auth_token = jwt.sign(
            { ...payload },
            process.env.JWT_TOKEN_SECRET_KEY,
        );

        return Promise.resolve({ auth_token });
    } catch (error) {
        return Promise.reject(error);
    }
}
module.exports = generateTokens;
