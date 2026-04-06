const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const passport = require('passport');
const cookieParser = require('cookie-parser');

const database = require('./config/database');
require('./config/passport-jwt-strategy');

const userRoutes = require('./routes/userRoutes');
const bookRoutes = require('./routes/bookRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const borrowRoutes = require('./routes/borrowRoutes');
const imageGalleryRoutes = require('./routes/imageGalleryRoutes');
const notificationRoutes = require('./routes/notificationRoutes');



dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());
app.use(passport.initialize());
app.use(cookieParser());

app.use('/uploads', express.static('uploads'));

app.use('/User', userRoutes);
app.use('/Book', bookRoutes);
app.use('/Category', categoryRoutes);
app.use('/Borrow', borrowRoutes);
app.use('/ImageGallery', imageGalleryRoutes);
app.use('/Notification', notificationRoutes);


const PORT = process.env.PORT;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
