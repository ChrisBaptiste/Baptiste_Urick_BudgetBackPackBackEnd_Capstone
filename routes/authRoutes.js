
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs'); // Importing bcrypt for password comparison, though hashing is in the model.
const jwt = require('jsonwebtoken'); // Importing jsonwebtoken for creating auth tokens.
const User = require('../models/User'); // Pulling in my User model.



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
    // Getting email and password from the request body for login.
    const { email, password } = req.body;

    try {
        // I'm trying to find the user by their email address.
        let user = await User.findOne({ email });
        if (!user) {
            // If no user is found with that email, it's invalid credentials.
            // Sending a generic "Invalid credentials" to avoid hinting if email exists or not.
            return res.status(400).json({ errors: [{ msg: 'Invalid credentials' }] });
        }

        // If a user is found, I'm now validating the provided password.
        // Using the 'matchPassword' method I defined on my User model.
        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
            // If the passwords don't match, it's also invalid credentials.
            return res.status(400).json({ errors: [{ msg: 'Invalid credentials' }] });
        }

        // If the user exists and the password matches, I'm creating the JWT payload.
        // Again, just including the user's ID.
        const payload = {
            user: {
                id: user.id
            }
        };

        // Signing the JWT for the authenticated user.
        jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '5h' }, // Same expiration as registration for consistency.
            (err, token) => {
                if (err) throw err; // Handling potential errors during token signing.
                // Sending back the token on successful login.
                res.json({ token });
            }
        );
    } catch (err) {
        // Catching any errors during the login process.
        console.error("Error during login:", err.message); // Logging for debugging.
        res.status(500).send('Server error during login'); // Generic server error.
    }
});

// Exporting the router so it can be used in my main server file.
module.exports = router;