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


// --- Add Flight to Trip ---
router.post('/:tripId/flights', protect, async (req, res) => {
    const { tripId } = req.params;
    const flightData = req.body; // Should match SavedFlightSchema

    // Basic validation
    if (!flightData.flightApiId || !flightData.origin || !flightData.destination || !flightData.departureDate) {
        return res.status(400).json({ msg: 'Missing required flight data (ID, origin, destination, departureDate).' });
    }

    try {
        const trip = await Trip.findById(tripId);
        if (!trip) return res.status(404).json({ msg: 'Trip not found' });
        if (trip.user.toString() !== req.user.id) return res.status(401).json({ msg: 'User not authorized' });

        const flightDepartureTime = new Date(flightData.departureDate).getTime();
        const exists = trip.savedFlights.find(
            f => f.flightApiId === flightData.flightApiId && new Date(f.departureDate).getTime() === flightDepartureTime
        );
        if (exists) {
            return res.status(400).json({ msg: 'This specific flight is already saved to this trip.' });
        }

        trip.savedFlights.push(flightData);
        await trip.save();
        res.status(201).json(trip.savedFlights);
    } catch (err) {
        console.error('TRIP_ADD_FLIGHT Error:', err.message);
        res.status(500).json({ msg: 'Server error while adding flight to trip' });
    }
});

// --- Remove Flight from Trip ---
// Using flightApiId and departureDate (as timestamp) to uniquely identify the flight to remove
router.delete('/:tripId/flights/:flightApiId/:departureTimestamp', protect, async (req, res) => {
    const { tripId, flightApiId, departureTimestamp } = req.params;

    try {
        const trip = await Trip.findById(tripId);
        if (!trip) return res.status(404).json({ msg: 'Trip not found' });
        if (trip.user.toString() !== req.user.id) return res.status(401).json({ msg: 'User not authorized' });

        const initialLength = trip.savedFlights.length;
        const targetDepartureTime = parseInt(departureTimestamp, 10);

        trip.savedFlights = trip.savedFlights.filter(
            f => !(f.flightApiId === flightApiId && new Date(f.departureDate).getTime() === targetDepartureTime)
        );

        if (trip.savedFlights.length === initialLength) {
            return res.status(404).json({ msg: 'Flight not found in this trip for the specified details.' });
        }

        await trip.save();
        res.json(trip.savedFlights);
    } catch (err) {
        console.error('TRIP_REMOVE_FLIGHT Error:', err.message);
        res.status(500).json({ msg: 'Server error while removing flight from trip' });
    }
});


// --- Add Accommodation to Trip ---
router.post('/:tripId/accommodations', protect, async (req, res) => {
    const { tripId } = req.params;
    const accommodationData = req.body; // Should match SavedAccommodationSchema

    if (!accommodationData.accommodationApiId || !accommodationData.name) {
        return res.status(400).json({ msg: 'Missing required accommodation data (ID and name).' });
    }
     // Add checkInDate for uniqueness if needed
    if (!accommodationData.checkInDate) {
        return res.status(400).json({ msg: 'Accommodation check-in date is required.' });
    }


    try {
        const trip = await Trip.findById(tripId);
        if (!trip) return res.status(404).json({ msg: 'Trip not found' });
        if (trip.user.toString() !== req.user.id) return res.status(401).json({ msg: 'User not authorized' });

        const accommodationCheckInTime = new Date(accommodationData.checkInDate).getTime();
        const exists = trip.savedAccommodations.find(
            acc => acc.accommodationApiId === accommodationData.accommodationApiId && 
                   new Date(acc.checkInDate).getTime() === accommodationCheckInTime
        );
        if (exists) {
            return res.status(400).json({ msg: 'This specific accommodation for these dates is already saved.' });
        }

        trip.savedAccommodations.push(accommodationData);
        await trip.save();
        res.status(201).json(trip.savedAccommodations);
    } catch (err) {
        console.error('TRIP_ADD_ACCOMMODATION Error:', err.message);
        res.status(500).json({ msg: 'Server error while adding accommodation to trip' });
    }
});

// --- Remove Accommodation from Trip ---
// Using accommodationApiId and checkInDate (as timestamp) for uniqueness

router.delete('/:tripId/accommodations/:accommodationApiId/:checkInTimestamp', protect, async (req, res) => {
    const { tripId, accommodationApiId, checkInTimestamp } = req.params;

    try {
        const trip = await Trip.findById(tripId);
        if (!trip) return res.status(404).json({ msg: 'Trip not found' });
        if (trip.user.toString() !== req.user.id) return res.status(401).json({ msg: 'User not authorized' });

        const initialLength = trip.savedAccommodations.length;
        const targetCheckInTime = parseInt(checkInTimestamp, 10);

        trip.savedAccommodations = trip.savedAccommodations.filter(
            acc => !(acc.accommodationApiId === accommodationApiId && new Date(acc.checkInDate).getTime() === targetCheckInTime)
        );

        if (trip.savedAccommodations.length === initialLength) {
            return res.status(404).json({ msg: 'Accommodation not found in this trip for the specified details.' });
        }

        await trip.save();
        res.json(trip.savedAccommodations);
    } catch (err) {
        console.error('TRIP_REMOVE_ACCOMMODATION Error:', err.message);
        res.status(500).json({ msg: 'Server error while removing accommodation from trip' });
    }
});


module.exports = router;