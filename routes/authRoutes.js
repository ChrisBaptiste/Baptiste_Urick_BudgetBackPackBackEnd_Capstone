
const express = require('express');
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const bcrypt = require('bcryptjs'); // Importing bcrypt for password comparison, though hashing is in the model.
const jwt = require('jsonwebtoken'); // Importing jsonwebtoken for creating auth tokens.
const User = require('../models/User'); // Pulling in my User model.




// GET /api/auth/me - Get current user profile
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json({
      id: user._id,
      username: user.username,
      email: user.email,
      createdAt: user.createdAt
    });
  } catch (err) {
    console.error('Error fetching user profile:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});


// ------------   POST api/auth/register
// -----------    Registering a new user for the application.
router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    console.log('AUTH_REG: Request to /register received with email:', email, 'and username:', username); 

    try {
        let user = await User.findOne({ email });
        if (user) {
            console.log('User already exists with email:', email); 
            return res.status(400).json({ errors: [{ msg: 'User already exists with this email' }] });
        }
        user = await User.findOne({ username });
        if (user) {
            console.log('User already exists with username:', username); 
            return res.status(400).json({ errors: [{ msg: 'Username is already taken' }] });
        }

        user = new User({
            username,
            email,
            password
        });

        console.log('Attempting to save new user with email:', email); 
        await user.save(); // This is the database save operation
        console.log('User with email:', email, 'successfully saved. User ID:', user.id); 

        const payload = {
            user: {
                id: user.id
            }
        };

        jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '5h' },
            (err, token) => {
                if (err) {
                    console.error('Error signing JWT for user:', email, err); 
                    throw err;
                }
                res.status(201).json({ token });
            }
        );

    } catch (err) {
        // This catch block will now primarily catch errors from findOne, new User, or jwt.sign
        // Mongoose .save() errors (like validation or DB connection issues during save) might also land here
        console.error('AUTH_REG: Overall error during registration for email:', email, 'Error:', err); 
        if (err.name === 'ValidationError') {
            const messages = Object.values(err.errors).map(val => val.message);
            return res.status(400).json({ errors: messages.map(msg => ({ msg })) });
        }
        res.status(500).send('Server error during registration');
    }
});


// ----------------------  POST api/auth/login  ------------------------ //
//   ---------- Authenticating an existing user and getting a token. ------//
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    console.log('AUTH_LOGIN: Attempting login for email:', email); // Added for debugging

    try {
        let user = await User.findOne({ email });
        if (!user) {
            console.log('AUTH_LOGIN: User not found for email:', email); // Debugging
            return res.status(400).json({ errors: [{ msg: 'Invalid credentials' }] });
        }

        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
            console.log('AUTH_LOGIN: Password mismatch for email:', email); // Debugging
            return res.status(400).json({ errors: [{ msg: 'Invalid credentials' }] });
        }

        const payload = { user: { id: user.id } };
        jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '5h' },
            (err, token) => {
                if (err) {
                    console.error('AUTH_LOGIN: Error signing JWT for user:', email, err);
                    throw err; // Will be caught by outer catch
                }
                console.log('AUTH_LOGIN: Login successful, token generated for email:', email); // Debugging
                res.json({ token });
            }
        );
    } catch (err) {
        console.error("AUTH_LOGIN: Overall error during login for email:", email, "Error:", err.message);
        res.status(500).send('Server error during login');
    }
});

// Exporting the router so it can be used in my main server file.
module.exports = router;