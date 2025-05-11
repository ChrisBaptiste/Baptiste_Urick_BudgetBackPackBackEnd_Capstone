require('dotenv').config(); // Load environment variables
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db'); 

const app = express();

// Connect Database 
connectDB();

// Init Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json({ extended: false })); // Allows us to accept JSON data in req.body

// Simple GET route for testing
app.get('/', (req, res) => res.send('Budget-Backpack API Running!'));

// Define Routes 
 app.use('/api/auth', require('./routes/authRoutes'));
 app.use('/api/trips', require('./routes/tripRoutes'));
// app.use('/api/search', require('./routes/searchRoutes'));


const PORT = process.env.PORT || 5001; 

app.listen(PORT, () => console.log(`Server started on port ${PORT}`));