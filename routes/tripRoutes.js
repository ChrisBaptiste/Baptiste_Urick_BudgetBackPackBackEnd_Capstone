// server/routes/tripRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware'); // My authentication middleware.
const Trip = require('../models/Trip'); // My Trip model.
const User = require('../models/User'); 



// -------------------------- POST api/trips  ---------------------------//
// -----------    Creating a new trip for the logged-in user.  ---------  //

router.post('/', protect, async (req, res) => {
    const { tripName, destinationCity, destinationCountry, startDate, endDate, notes } = req.body;
    // Using req.user.id which comes from the 'protect' middleware
    console.log(`TRIP_CREATE: Request received by user ${req.user.id} to create trip: ${tripName}`); 

    try {
        const newTrip = new Trip({
            user: req.user.id,
            tripName,
            destinationCity,
            destinationCountry,
            startDate,
            endDate,
            notes
        });

        console.log(`TRIP_CREATE: Attempting to save new trip "${tripName}" for user ${req.user.id}`); 
        const trip = await newTrip.save(); // This is the database save operation
        console.log(`TRIP_CREATE: Trip "${tripName}" for user ${req.user.id} successfully saved. Trip ID: ${trip.id}`); 

        res.status(201).json(trip);

    } catch (err) {
        // This catch block will catch errors from new Trip() or newTrip.save()
        console.error(`TRIP_CREATE: Overall error creating trip "${tripName}" for user ${req.user.id}. Error:`, err); 
        if (err.name === 'ValidationError') {
            const messages = Object.values(err.errors).map(val => val.message);
            return res.status(400).json({ errors: messages.map(msg => ({ msg })) });
        }
        res.status(500).json({ msg: 'Server error while creating trip' });
    }
});


// --------------------   GET api/trips  -------------- //
// ------------- Getting all trips for the logged-in user. ---//

router.get('/', protect, async (req, res) => {
    try {
        // Finding all trips that belong to the currently logged-in user.
        // Sorting them by creation date in descending order (newest first).
        const trips = await Trip.find({ user: req.user.id }).sort({ createdAt: -1 });

        // If no trips are found, I can send an empty array, or a specific message.
        // For now, an empty array is fine if that's the case.
        res.json(trips);
    } catch (err) {
        console.error("Error fetching trips:", err.message);
        res.status(500).json({ msg: 'Server error while fetching trips' });
    }
});

//  ---------------  GET api/trips/:tripId  --------------------//
// -----------   Getting a specific trip by its ID.  -----------  //

router.get('/:tripId', protect, async (req, res) => {
    try {
        // Finding the trip by its ID, which comes from the URL parameter.
        const trip = await Trip.findById(req.params.tripId);

        if (!trip) {
            // If no trip is found with that ID, I'm returning a 404.
            return res.status(404).json({ msg: 'Trip not found' });
        }

        // I need to make sure the logged-in user is the owner of this trip.
        // Comparing the trip's user ID (ObjectId) with the logged-in user's ID (String).
        // Need to convert them to strings for comparison.
        if (trip.user.toString() !== req.user.id) {
            // If the user IDs don't match, this user is not authorized to view this specific trip.
            return res.status(401).json({ msg: 'User not authorized for this trip' });
        }

        // If everything is okay, I'm sending the trip data.
        res.json(trip);
    } catch (err) {
        console.error("Error fetching single trip:", err.message);
        // If the tripId format is invalid for an ObjectId, Mongoose might throw a CastError.
        if (err.name === 'CastError') {
            return res.status(400).json({ msg: 'Invalid trip ID format' });
        }
        res.status(500).json({ msg: 'Server error while fetching trip' });
    }
});

// --------------  PUT api/trips/:tripId    -------------------//
// --------------   Updating an existing trip.  ------------------//

router.put('/:tripId', protect, async (req, res) => {
    // Getting the fields to update from the request body.
    const { tripName, destinationCity, destinationCountry, startDate, endDate, notes } = req.body;

    // Building an object with the fields to update.
    // Only including fields that are actually provided in the request.
    const tripFields = {};
    if (tripName !== undefined) tripFields.tripName = tripName; // Using !== undefined to allow empty strings if desired
    if (destinationCity !== undefined) tripFields.destinationCity = destinationCity;
    if (destinationCountry !== undefined) tripFields.destinationCountry = destinationCountry;
    if (startDate !== undefined) tripFields.startDate = startDate;
    if (endDate !== undefined) tripFields.endDate = endDate;
    if (notes !== undefined) tripFields.notes = notes;

    try {
        let trip = await Trip.findById(req.params.tripId);

        if (!trip) {
            return res.status(404).json({ msg: 'Trip not found' });
        }

        // Ensuring the logged-in user owns this trip before allowing an update.
        if (trip.user.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'User not authorized to update this trip' });
        }

        // Performing the update.
        // Using { new: true } to return the modified document rather than the original.
        // Using { runValidators: true } to ensure schema validations are run on update.
        trip = await Trip.findByIdAndUpdate(
            req.params.tripId,
            { $set: tripFields },
            { new: true, runValidators: true }
        );

        res.json(trip);
    } catch (err) {
        console.error("Error updating trip:", err.message);
        if (err.name === 'ValidationError') {
            const messages = Object.values(err.errors).map(val => val.message);
            return res.status(400).json({ errors: messages.map(msg => ({ msg })) });
        }
        if (err.name === 'CastError') {
            return res.status(400).json({ msg: 'Invalid trip ID format' });
        }
        res.status(500).json({ msg: 'Server error while updating trip' });
    }
});

//----------------   DELETE api/trips/:tripId--------------//
//  ---------------  Deleting a trip by id  ---------------//
router.delete('/:tripId', protect, async (req, res) => {
    try {
        const trip = await Trip.findById(req.params.tripId);

        if (!trip) {
            return res.status(404).json({ msg: 'Trip not found' });
        }

        // Verifying ownership before deletion.
        if (trip.user.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'User not authorized to delete this trip' });
        }

        // Removing the trip from the database.
        await Trip.findByIdAndDelete(req.params.tripId);

        res.json({ msg: 'Trip removed successfully' });
    } catch (err) {
        console.error("Error deleting trip:", err.message);
         if (err.name === 'CastError') {
            return res.status(400).json({ msg: 'Invalid trip ID format' });
        }
        res.status(500).json({ msg: 'Server error while deleting trip' });
    }
});


// We will add routes here later for adding/removing saved flights, accommodations, activities to a trip.
// like
// POST /api/trips/:tripId/flights
// DELETE /api/trips/:tripId/flights/:flightItemId

module.exports = router;