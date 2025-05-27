
// BackEnd-Server/models/Trip.js
const mongoose = require('mongoose');

const SavedFlightSchema = new mongoose.Schema({
    flightApiId: String,
    origin: String,
    destination: String,
    departureDate: Date,
    price: Number,
    details: mongoose.Schema.Types.Mixed
}, { _id: false });

// Refined SavedAccommodationSchema
const SavedAccommodationSchema = new mongoose.Schema({
    accommodationApiId: { type: String, required: true },
    name: { type: String, required: true },
    location: String,
    destinationCity: String,
    checkInDate: Date,
    checkOutDate: Date,
    pricePerNight: Number,
    totalPrice: Number, // If available from API
    currency: String,
    numberOfGuests: Number,
    rating: Number,
    imageUrl: String,
    bookingLink: String,
    provider: String,
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
        ref: 'User'
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
    savedFlights: [SavedFlightSchema],
    savedAccommodations: [SavedAccommodationSchema], // Now using the refined schema
    savedActivities: [SavedActivitySchema],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

TripSchema.index({ user: 1 });
TripSchema.index({ destinationCity: 'text', tripName: 'text' });

module.exports = mongoose.model('Trip', TripSchema);