
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs'); // Importing bcrypt for password comparison, though hashing is in the model.
const jwt = require('jsonwebtoken'); // Importing jsonwebtoken for creating auth tokens.
const User = require('../models/User'); // Pulling in my User model.

// @route   POST api/auth/register
// @desc    Registering a new user for the application.
// @access  Public (anyone can try to register).
router.post('/register', async (req, res) => {
    // Destructuring username, email, and password from the request body.
    // Expecting these fields to come from the registration form.
    const { username, email, password } = req.body;

    try {
        // First, I'm checking if a user already exists with the provided email.
        // Don't want duplicate email addresses in the system.
        let user = await User.findOne({ email });
        if (user) {
            // If a user with this email is found, I'm returning a 400 error.
            return res.status(400).json({ errors: [{ msg: 'User already exists with this email' }] });
        }

        // Next, I'm doing a similar check for the username to ensure it's unique.
        user = await User.findOne({ username });
        if (user) {
            // If the username is taken, I'm sending back another 400 error.
            return res.status(400).json({ errors: [{ msg: 'Username is already taken' }] });
        }

        // If both email and username are unique, I'm creating a new user instance.
        // The password will be hashed automatically by the pre-save hook in my User model.
        user = new User({
            username,
            email,
            password
        });

        // Now, I'm saving the new user to the database.
        await user.save();
        // At this point, the user should be successfully stored in MongoDB.

        // I'm preparing the payload for the JWT.
        // Just need the user's ID to identify them in future requests.
        const payload = {
            user: {
                id: user.id // Mongoose provides 'id' as a virtual getter for '_id'.
            }
        };

        // Now I'm signing the JWT.
        // Using the secret from my environment variables and setting an expiration.
        jwt.sign(
            payload,
            process.env.JWT_SECRET, // My secret key, keeping it safe.
            { expiresIn: '5h' }, // Setting the token to expire in 5 hours.
            (err, token) => {
                if (err) throw err; // If something goes wrong during signing, I'm throwing an error.
                // If successful, I'm sending back the token with a 201 status (Created).
                res.status(201).json({ token });
            }
        );

    } catch (err) {
        // Catching any errors that occur during the try block.
        console.error("Error during registration:", err.message); // Logging the error for my own debugging.

        // I'm specifically checking for Mongoose validation errors here.
        // This way, I can send back more specific error messages to the client.
        if (err.name === 'ValidationError') {
            const messages = Object.values(err.errors).map(val => val.message);
            // Formatting the validation messages to match the error structure.
            return res.status(400).json({ errors: messages.map(msg => ({ msg })) });
        }
        // For any other server-side errors, I'm sending a generic 500 error.
        res.status(500).send('Server error during registration');
    }
});


//   POST api/auth/login
//   Authenticating an existing user and getting a token.
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