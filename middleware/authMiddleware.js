
const jwt = require('jsonwebtoken'); // Importing JWT so I can verify the tokens.
const User = require('../models/User'); 

// This 'protect' middleware is what I'll use to secure my routes.
// It checks for a valid JWT in the request headers.
const protect = async (req, res, next) => {
    let token; // Initializing a variable to hold the token.

    // I'm checking if the 'Authorization' header exists and if it starts with 'Bearer '.
    // This is the standard way to send JWTs.
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // If the header is there and formatted correctly, I'm trying to extract the token.
            // The token is the part after 'Bearer ', so I'm splitting the string by space and taking the second element.
            token = req.headers.authorization.split(' ')[1];

            // Now, I'm verifying the extracted token using my JWT_SECRET.
            // If the token is invalid or expired, jwt.verify will throw an error.
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // If verification is successful, the 'decoded' object will contain the payload (which has user.id).
            // I'm attaching the user's ID to the request object (req.user).
            // This way, my protected route handlers will know which user is making the request.
            req.user = { id: decoded.user.id };

            // Calling next() to pass control to the next middleware or route handler in the stack.
            next();
        } catch (error) {
            // If anything goes wrong during token extraction or verification (e.g., token tampered, expired),
            // I'm logging the error for my debugging purposes.
            console.error('Token verification failed:', error.message);
            // And sending a 401 Unauthorized response because the token is no good.
            res.status(401).json({ msg: 'Not authorized, token failed' });
        }
    }

    // If there was no token in the first place (the 'if' condition above was false),
    // or if the token wasn't found even after the 'try' 
    // I'm sending a 401 Unauthorized response.
    if (!token) {
        // This check ensures that if the 'Authorization' header wasn't present or didn't start with 'Bearer',
        // we still send an unauthorized response.
        res.status(401).json({ msg: 'Not authorized, no token' });
    }
};

// Exporting the 'protect' middleware so I can use it in my route files.
module.exports = { protect };