
const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI); 
        console.log('MongoDB Connected...');
    } catch (err) {
        // If the database connection fails, I need to know why.
        console.error('Database Connection Error:', err.message);
        // And it's critical, so let's exit the process.
        process.exit(1);
    }
};

module.exports = connectDB;