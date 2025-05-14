
const mongoose = require('mongoose');

// We'll define these sub-schemas in more detail later when integrating APIs
const SavedFlightSchema = new mongoose.Schema({
    // Basic fields for now, expand later
    flightApiId: String, // ID from the flight API
    origin: String,
    destination: String,
    departureDate: Date,
    price: Number,
    details: mongoose.Schema.Types.Mixed // Storing the raw API response or key parts
}, { _id: false }); 

const SavedAccommodationSchema = new mongoose.Schema({
    accommodationApiId: String,
    name: String,
    location: String,
    checkInDate: Date,
    price: Number,
    details: mongoose.Schema.Types.Mixed
}, { _id: false });

const SavedActivitySchema = new mongoose.Schema({
    activityApiId: String,
    name: String,
    location: String,
    date: Date,
    details: mongoose.Schema.Types.Mixed
}, { _id: false });


const TripSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User' // Reference to the User model
    },
    tripName: {
        type: String,
        required: [true, 'Trip name is required'],
        trim: true
    },
    destinationCity: {
        type: String,
        required: [true, 'Destination city is required'], 
        trim: true
    },
    destinationCountry: {
        type: String,
        required: [true, 'Destination country is required'], 
        trim: true
    },
    startDate: {
        type: Date,
        required: [true, 'Start date is required'] 
    },
    endDate: {
        type: Date,
        required: [true, 'End date is required'] 
    },
    notes: {
        type: String,
        trim: true
    },
    // Arrays to store saved items
    savedFlights: [SavedFlightSchema],
    // savedAccommodations: [SavedAccommodationSchema],  // will revisit this if i have time
    savedActivities: [SavedActivitySchema],
    createdAt: {
        type: Date,
        default: Date.now
    }
});


TripSchema.index({ user: 1 }); // fetching trips for a specific user
TripSchema.index({ destinationCity: 'text', tripName: 'text' }); // Example for text search later

module.exports = mongoose.model('Trip', TripSchema);