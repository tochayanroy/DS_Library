const mongoose = require('mongoose');
require('dotenv').config();


mongoose.connect(process.env.DATABASEURL);

const database = mongoose.connection;

database.on('connected', () => {
    console.log('Connected to MongoDB server');
});

database.on('error', (err) => {
    console.error('MongoDB connection error:', err);
});

database.on('disconnected', () => {
    console.log('MongoDB disconnected');
});

module.exports = database;
