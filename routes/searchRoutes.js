// server/routes/searchRoutes.js
const express = require("express");
const router = express.Router();
const axios = require("axios");
const { protect } = require("../middleware/authMiddleware");
const util = require('util');


// ----------------------FLIGHTS ROUTE  ---------------------------- //

router.get("/flights", protect, async (req, res) => {
  const {
    origin,
    destination,
    departureDate,
    returnDate,
    adults = "1",
    children = "0",
    infants = "0",
    maxStopovers,
    sortBy = "PRICE",
  } = req.query;

  if (!origin || !destination || !departureDate) {
    return res
      .status(400)
      .json({ msg: "Please provide origin, destination, and departure date." });
  }

  // Helper function to format dates for Kiwi API (YYYY-MM-DDTHH:MM:SS)
  const formatDateTimeForKiwi = (dateString) => {
    if (!dateString) return undefined;
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        console.error('Invalid date provided:', dateString);
        return undefined;
      }
      return `${dateString}T00:00:00`;
    } catch (error) {
      console.error('Error formatting date for Kiwi API:', error);
      return undefined;
    }
  };

  // Helper function to add/subtract days from a date
  const addDays = (dateString, days) => {
    const date = new Date(dateString);
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0]; // Return YYYY-MM-DD format
  };

  // Helper function to create flexible date ranges
  const createFlexibleDateRange = (targetDate, flexDays = 3) => {
    const startDate = addDays(targetDate, -flexDays);
    const endDate = addDays(targetDate, flexDays);
    return {
      start: formatDateTimeForKiwi(startDate),
      end: formatDateTimeForKiwi(endDate)
    };
  };

  let requestUrl;
  let apiParams = {};

  if (returnDate) {
    // ROUND-TRIP API ENDPOINT WITH FLEXIBLE DATE RANGES
    console.log("SEARCH_FLIGHTS: Detected ROUND TRIP search - Using flexible date ranges");
    requestUrl = "https://kiwi-com-cheap-flights.p.rapidapi.com/round-trip";
    
    // Create flexible date ranges (±3 days around selected dates)
    const departureRange = createFlexibleDateRange(departureDate, 3);
    const returnRange = createFlexibleDateRange(returnDate, 3);
    
    console.log(`SEARCH_FLIGHTS: Flexible departure range: ${departureRange.start} to ${departureRange.end}`);
    console.log(`SEARCH_FLIGHTS: Flexible return range: ${returnRange.start} to ${returnRange.end}`);
    
    // Using the CORRECT parameter names with flexible date ranges
    apiParams = {
      source: origin,
      destination: destination,
      currency: "USD",
      locale: "en", 
      adults: parseInt(adults, 10),
      children: parseInt(children, 10),
      infants: parseInt(infants, 10),
      handbags: 1,
      holdbags: 0,
      cabinClass: "ECONOMY",
      sortBy: sortBy.toUpperCase(),
      sortOrder: "ASCENDING",
      transportTypes: "FLIGHT",
      limit: 20, // Increased limit for more options
      // FLEXIBLE DATE RANGES
      outboundDepartmentDateStart: departureRange.start,
      outboundDepartmentDateEnd: departureRange.end,
      inboundDepartureDateStart: returnRange.start,
      inboundDepartureDateEnd: returnRange.end,
      // Additional flexibility options
      allowReturnFromDifferentCity: "false",
      allowChangeInboundDestination: "false",
      allowChangeInboundSource: "false",
      allowDifferentStationConnection: "true",
      enableSelfTransfer: "false",
      allowOvernightStopover: "true",
    };

    // Add stopover filtering if specified
    if (maxStopovers !== undefined && ["0", "1", "2"].includes(maxStopovers)) {
      apiParams.maxStopsCount = parseInt(maxStopovers, 10);
    }

    // Map frontend sortBy values to Kiwi API values
    if (sortBy === "PRICE") apiParams.sortBy = "PRICE";
    else if (sortBy === "DURATION") apiParams.sortBy = "DURATION";
    else if (sortBy === "QUALITY") apiParams.sortBy = "QUALITY";
    else apiParams.sortBy = "PRICE"; // default

  } else {
    // ONE-WAY API ENDPOINT WITH SLIGHT FLEXIBILITY
    console.log("SEARCH_FLIGHTS: Detected ONE-WAY search - Using flexible date range");
    requestUrl = "https://kiwi-com-cheap-flights.p.rapidapi.com/one-way";
    
    // Create flexible date range for one-way (±2 days for more options)
    const departureRange = createFlexibleDateRange(departureDate, 2);
    
    console.log(`SEARCH_FLIGHTS: Flexible departure range: ${departureRange.start} to ${departureRange.end}`);
    
    apiParams = {
      source: origin,
      destination: destination,
      adults: parseInt(adults, 10),
      children: parseInt(children, 10),
      infants: parseInt(infants, 10),
      currency: "USD",
      locale: "en",
      limit: 15,
      sortBy: sortBy.toUpperCase(),
      // FLEXIBLE DATE RANGE FOR ONE-WAY
      outboundDepartmentDateStart: departureRange.start,
      outboundDepartmentDateEnd: departureRange.end,
    };

    if (maxStopovers !== undefined && ["0", "1", "2"].includes(maxStopovers)) {
      apiParams.maxStopsCount = parseInt(maxStopovers, 10);
    }

    if (apiParams.sortBy === "PRICE" || apiParams.sortBy === "DURATION") {
      apiParams.sortOrder = "ASCENDING";
    }
  }

  console.log(`SEARCH_FLIGHTS: Requesting URL: ${requestUrl}`);
  console.log("SEARCH_FLIGHTS: API Params to send:", JSON.stringify(apiParams, null, 2));

  const optionsFlight = {
    method: "GET",
    url: requestUrl,
    params: apiParams,
    headers: {
      "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
      "X-RapidAPI-Host": process.env.RAPIDAPI_FLIGHT_API_HOST,
    },
  };

  try {
    const response = await axios.request(optionsFlight);
    console.log("SEARCH_FLIGHTS: Raw response status from external API:", response.status);

    let transformedFlights = [];
    
    // Helper functions for data transformation
    const formatDuration = (totalSeconds) => {
      if (!totalSeconds || totalSeconds === null || totalSeconds === undefined || isNaN(totalSeconds)) {
        return "Duration not available";
      }
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      let durationStr = "";
      if (hours > 0) durationStr += `${hours}h `;
      if (minutes >= 0) durationStr += `${minutes}m`;
      return durationStr.trim() || "0m";
    };

    const parsePrice = (priceValue) => {
      if (!priceValue) return null;
      const parsed = parseFloat(priceValue);
      return isNaN(parsed) ? null : parsed;
    };

    const extractBookingLink = (itinerary) => {
      let bookingLink = null;
      if (itinerary.bookingOptions?.edges?.length > 0 && itinerary.bookingOptions.edges[0].node) {
        const primaryBookingOption = itinerary.bookingOptions.edges[0].node;
        if (primaryBookingOption.bookingUrl) {
          bookingLink = primaryBookingOption.bookingUrl.startsWith("/")
            ? `https://www.kiwi.com${primaryBookingOption.bookingUrl}`
            : primaryBookingOption.bookingUrl;
        }
      }
      return bookingLink;
    };

    // Helper function to format dates for display
    const formatDateForDisplay = (dateString) => {
      if (!dateString) return "Date not available";
      try {
        return new Date(dateString).toLocaleDateString();
      } catch (error) {
        return dateString;
      }
    };

    // DIFFERENT RESPONSE HANDLING FOR ROUND-TRIP VS ONE-WAY
    if (returnDate) {
      // ROUND-TRIP RESPONSE HANDLING
      console.log("SEARCH_FLIGHTS: Processing ROUND-TRIP response structure");
      
      if (response.data && Array.isArray(response.data.itineraries)) {
        console.log(`SEARCH_FLIGHTS: Found ${response.data.itineraries.length} round-trip itineraries to process`);
        
        transformedFlights = response.data.itineraries.map((itinerary) => {
          try {
            let flightPrice = itinerary.price?.amount;
            
            // Update price from booking options if available
            if (itinerary.bookingOptions?.edges?.length > 0 && itinerary.bookingOptions.edges[0].node?.price?.amount) {
              flightPrice = itinerary.bookingOptions.edges[0].node.price.amount;
            }

            const bookingLink = extractBookingLink(itinerary);

            // For round-trip, extract outbound segment info
            const outboundSector = itinerary.outbound?.sector || itinerary.sector;
            const returnSector = itinerary.inbound?.sector;
            
            const firstSegment = outboundSector?.sectorSegments?.[0]?.segment;
            const departureInfo = firstSegment?.source;
            const arrivalInfo = firstSegment?.destination;
            const carrierInfo = firstSegment?.carrier;

            // Extract return flight info
            let returnInfo = null;
            if (returnSector?.sectorSegments?.[0]?.segment) {
              const returnSegment = returnSector.sectorSegments[0].segment;
              returnInfo = {
                departureTime: returnSegment.source?.localTime,
                arrivalTime: returnSegment.destination?.localTime,
                departureCity: returnSegment.source?.station?.city?.name,
                arrivalCity: returnSegment.destination?.station?.city?.name,
                departureDate: formatDateForDisplay(returnSegment.source?.localTime),
                arrivalDate: formatDateForDisplay(returnSegment.destination?.localTime),
              };
            }

            // Calculate total trip duration for round-trip
            let totalDuration = "Duration not available";
            if (firstSegment?.duration && returnSector?.sectorSegments?.[0]?.segment?.duration) {
              const outboundDuration = firstSegment.duration;
              const returnDuration = returnSector.sectorSegments[0].segment.duration;
              totalDuration = formatDuration(outboundDuration + returnDuration);
            }

            return {
              id: itinerary.id || itinerary.legacyId || `roundtrip_${Date.now()}_${Math.random()}`,
              price: parsePrice(flightPrice),
              currency: response.data.currency || 
                       response.data.metadata?.currency || 
                       itinerary.price?.currency || 
                       "USD",
              departureCity: departureInfo?.station?.city?.name || "Unknown City",
              departureAirport: departureInfo?.station?.name || "Unknown Airport",
              departureAirportCode: departureInfo?.station?.code || "N/A",
              departureTimeLocal: departureInfo?.localTime || null,
              departureTimeUTC: departureInfo?.utcTime || null,
              arrivalCity: arrivalInfo?.station?.city?.name || "Unknown City",
              arrivalAirport: arrivalInfo?.station?.name || "Unknown Airport",
              arrivalAirportCode: arrivalInfo?.station?.code || "N/A",
              arrivalTimeLocal: arrivalInfo?.localTime || null,
              arrivalTimeUTC: arrivalInfo?.utcTime || null,
              durationInSeconds: firstSegment?.duration === undefined ? null : firstSegment.duration,
              durationFormatted: formatDuration(firstSegment?.duration),
              totalTripDuration: totalDuration, // For round-trip total duration
              airlineName: carrierInfo?.name || "Unknown Airline",
              airlineCode: carrierInfo?.code || "N/A",
              flightNumber: firstSegment?.code || "N/A",
              bookingLink: bookingLink,
              provider: itinerary.provider?.name || "Kiwi.com",
              // Round-trip specific data
              isRoundTrip: true,
              returnInfo: returnInfo,
              // Add flexible date info for user reference
              originalDepartureDate: departureDate,
              originalReturnDate: returnDate,
              actualDepartureDate: formatDateForDisplay(departureInfo?.localTime),
              actualReturnDate: returnInfo ? formatDateForDisplay(returnInfo.departureTime) : null,
            };
          } catch (error) {
            console.error('Error transforming round-trip flight itinerary:', error);
            return null;
          }
        }).filter(flight => flight !== null);
      } else {
        console.log("SEARCH_FLIGHTS: Round-trip response doesn't contain expected itineraries array");
        console.log("Response data structure:", Object.keys(response.data || {}));
      }
    } else {
      // ONE-WAY RESPONSE HANDLING
      console.log("SEARCH_FLIGHTS: Processing ONE-WAY response structure");
      
      if (response.data && Array.isArray(response.data.itineraries)) {
        console.log(`SEARCH_FLIGHTS: Found ${response.data.itineraries.length} one-way itineraries to process`);
        
        transformedFlights = response.data.itineraries.map((itinerary) => {
          try {
            let flightPrice = itinerary.price?.amount;
            
            if (itinerary.bookingOptions?.edges?.length > 0 && itinerary.bookingOptions.edges[0].node?.price?.amount) {
              flightPrice = itinerary.bookingOptions.edges[0].node.price.amount;
            }

            const bookingLink = extractBookingLink(itinerary);

            const firstSegment = itinerary.sector?.sectorSegments?.[0]?.segment;
            const departureInfo = firstSegment?.source;
            const arrivalInfo = firstSegment?.destination;
            const carrierInfo = firstSegment?.carrier;

            return {
              id: itinerary.id || itinerary.legacyId || `oneway_${Date.now()}_${Math.random()}`,
              price: parsePrice(flightPrice),
              currency: response.data.currency || 
                       response.data.metadata?.currency || 
                       itinerary.price?.currency || 
                       "USD",
              departureCity: departureInfo?.station?.city?.name || "Unknown City",
              departureAirport: departureInfo?.station?.name || "Unknown Airport",
              departureAirportCode: departureInfo?.station?.code || "N/A",
              departureTimeLocal: departureInfo?.localTime || null,
              departureTimeUTC: departureInfo?.utcTime || null,
              arrivalCity: arrivalInfo?.station?.city?.name || "Unknown City",
              arrivalAirport: arrivalInfo?.station?.name || "Unknown Airport",
              arrivalAirportCode: arrivalInfo?.station?.code || "N/A",
              arrivalTimeLocal: arrivalInfo?.localTime || null,
              arrivalTimeUTC: arrivalInfo?.utcTime || null,
              durationInSeconds: firstSegment?.duration === undefined ? null : firstSegment.duration,
              durationFormatted: formatDuration(firstSegment?.duration),
              airlineName: carrierInfo?.name || "Unknown Airline",
              airlineCode: carrierInfo?.code || "N/A",
              flightNumber: firstSegment?.code || "N/A",
              bookingLink: bookingLink,
              provider: itinerary.provider?.name || "Kiwi.com",
              isRoundTrip: false,
              // Add flexible date info
              originalDepartureDate: departureDate,
              actualDepartureDate: formatDateForDisplay(departureInfo?.localTime),
            };
          } catch (error) {
            console.error('Error transforming one-way flight itinerary:', error);
            return null;
          }
        }).filter(flight => flight !== null);
      }
    }

    console.log(`SEARCH_FLIGHTS: Successfully transformed ${transformedFlights.length} flights.`);
    
    // Enhanced debugging for round-trip issues
    if (returnDate && transformedFlights.length === 0) {
      console.log("SEARCH_FLIGHTS: ⚠️  ROUND-TRIP DEBUG - No flights after transformation");
      console.log("Response data keys:", Object.keys(response.data || {}));
      console.log("Has itineraries?", !!response.data?.itineraries);
      console.log("Itineraries is array?", Array.isArray(response.data?.itineraries));
      if (response.data?.itineraries) {
        console.log("Itineraries length:", response.data.itineraries.length);
        if (response.data.itineraries.length > 0) {
          console.log("First itinerary structure:", Object.keys(response.data.itineraries[0] || {}));
        }
      }
      // If still no results, try a broader search suggestion
      console.log("SEARCH_FLIGHTS: 💡 Consider trying different dates or destinations for round-trip search");
    }
    
    res.json(transformedFlights);
  } catch (error) {
    console.error("SEARCH_FLIGHTS: Error fetching flight data:");
    console.error("Request URL:", requestUrl);
    console.error("Request params:", JSON.stringify(apiParams, null, 2));
    
    if (error.response) {
      console.error("Flight Error Data:", JSON.stringify(error.response.data, null, 2));
      console.error("Flight Error Status:", error.response.status);
      res.status(error.response.status).json({
        msg: `Error from flight API: ${error.response.data?.message || "Failed to fetch flight data"}`,
        details: error.response.data,
      });
    } else if (error.request) {
      console.error("Flight Error Request (no response received):", error.request);
      res.status(500).json({ msg: "No response received from flight API" });
    } else {
      console.error("Flight Error Message (error in setting up request):", error.message);
      res.status(500).json({ msg: "Error in setting up request to flight API" });
    }
  }
});




// ---------------------- ACCOMMODATIONS ROUTE (for Airbnb19 API) ---------------------------- //

router.get('/accommodations', protect, async (req, res) => {
const {
destinationCity,
checkInDate,
checkOutDate,
adults = '1',
children = '0',
infants = '0',
currency = 'USD',
priceMin,
priceMax,
minBedrooms,
amenities
} = req.query;
if (!destinationCity || !checkInDate || !checkOutDate) {
    return res.status(400).json({ 
        msg: 'Please provide destination, check-in date, and check-out date.' 
    });
}

const apiParams = {
    query: destinationCity,
    checkin: checkInDate,
    checkout: checkOutDate,
    adults: adults,
    children: children || '0',
    infants: infants || '0',
    currency: currency,
    guestFavorite: 'false',
    ib: 'false'
};

// Add optional filters
if (priceMin) apiParams.priceMin = priceMin;
if (priceMax) apiParams.priceMax = priceMax;
if (minBedrooms) apiParams.minBedrooms = minBedrooms;
if (amenities) apiParams.amenities = amenities;

console.log(`SEARCH_ACCOMMODATIONS: Searching with params:`, JSON.stringify(apiParams, null, 2));

const optionsAccommodation = {
    method: 'GET',
    url: `https://${process.env.RAPIDAPI_ACCOMMODATION_API_HOST}/api/v2/searchPropertyByLocation`,
    params: apiParams,
    headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': process.env.RAPIDAPI_ACCOMMODATION_API_HOST
    }
};

try {
    const response = await axios.request(optionsAccommodation);
    console.log(`SEARCH_ACCOMMODATIONS: API Response Status: ${response.status}`);
    
    let transformedAccommodations = [];
    
    if (response.data?.status === true && response.data?.data?.list) {
        console.log(`SEARCH_ACCOMMODATIONS: Processing ${response.data.data.list.length} accommodations`);
        
        transformedAccommodations = response.data.data.list.map((item) => {
            // Based on your actual API response structure:
            // item has: __typename, listing, contextualPictures, structuredDisplayPrice, avgRatingLocalized, title
            
            const listing = item.listing || {};
            
            // ✅ CORRECT PRICE EXTRACTION based on actual API structure
            let pricePerNight = null;
            let totalPrice = null;
            
            // Extract from structuredDisplayPrice (this is where the price actually is!)
            if (item.structuredDisplayPrice) {
                const priceData = item.structuredDisplayPrice;
                
                // Primary price (per night)
                if (priceData.primaryLine?.price) {
                    // Remove $ symbol and parse
                    const priceString = priceData.primaryLine.price.replace(/[$,]/g, '');
                    pricePerNight = parseFloat(priceString);
                }
                
                // Total price 
                if (priceData.secondaryLine?.price) {
                    // Extract total price (format: "$635 total")
                    const totalPriceMatch = priceData.secondaryLine.price.match(/\$?([\d,]+(?:\.\d{2})?)/);
                    if (totalPriceMatch) {
                        totalPrice = parseFloat(totalPriceMatch[1].replace(/,/g, ''));
                    }
                }
            }

            // ✅ CORRECT IMAGE EXTRACTION based on actual API structure
            let imageUrl = null;
            let images = [];
            
            // Extract from contextualPictures (this is where images actually are!)
            if (item.contextualPictures && Array.isArray(item.contextualPictures) && item.contextualPictures.length > 0) {
                // Get first image as main image
                imageUrl = item.contextualPictures[0].picture;
                
                // Get up to 5 images
                images = item.contextualPictures
                    .slice(0, 5)
                    .map(pic => pic.picture)
                    .filter(Boolean);
            }

            // ✅ CORRECT RATING EXTRACTION based on actual API structure  
            let rating = null;
            let reviewCount = null;
            
            // Extract from avgRatingLocalized (format: "4.56 (227)")
            if (item.avgRatingLocalized) {
                const ratingMatch = item.avgRatingLocalized.match(/^([\d\.]+)/);
                if (ratingMatch) {
                    rating = parseFloat(ratingMatch[1]);
                }
                
                const reviewMatch = item.avgRatingLocalized.match(/\(([\d,]+)\)/);
                if (reviewMatch) {
                    reviewCount = parseInt(reviewMatch[1].replace(/,/g, ''), 10);
                }
            }

            // ✅ CORRECT NAME EXTRACTION
            const name = item.title || listing.legacyName || listing.title || 'Accommodation';

            // ✅ CORRECT LOCATION EXTRACTION  
            const location = listing.legacyLocalizedCityName || 
                           listing.legacyCity || 
                           item.demandStayListing?.location?.localizedCityName ||
                           item.demandStayListing?.location?.city ||
                           destinationCity;

            // ✅ HOST INFORMATION (bonus data)
            const hostInfo = listing.primaryHostPassport ? {
                name: listing.primaryHostPassport.name,
                isSuperhost: listing.primaryHostPassport.isSuperhost,
                profilePicture: listing.primaryHostPassport.thumbnailUrl,
                yearsHosting: listing.primaryHostPassport.timeAsHost?.years,
            } : null;

            return {
                id: listing.id || `accommodation_${Date.now()}_${Math.random()}`,
                name: name,
                location: location,
                destinationCity: destinationCity,
                pricePerNight: pricePerNight,
                totalPrice: totalPrice,
                currency: currency,
                rating: rating,
                reviewCount: reviewCount,
                imageUrl: imageUrl,
                images: images,
                bookingLink: `https://www.airbnb.com/rooms/${listing.id}`,
                provider: 'Airbnb',
                description: name,
                checkInDate: checkInDate,
                checkOutDate: checkOutDate,
                numberOfGuests: parseInt(adults, 10),
                
                // ✅ BONUS: Host information  
                host: hostInfo,
                
                // ✅ BONUS: Badges (like Superhost)
                badges: item.badges?.map(badge => badge.text) || [],
                
                // Debug information (only in development)
                ...(process.env.NODE_ENV === 'development' && {
                    _debug: {
                        hasPrice: !!pricePerNight,
                        hasImage: !!imageUrl,
                        hasRating: !!rating,
                        originalStructure: {
                            hasStructuredDisplayPrice: !!item.structuredDisplayPrice,
                            hasContextualPictures: !!item.contextualPictures,
                            hasAvgRatingLocalized: !!item.avgRatingLocalized,
                            listingKeys: Object.keys(listing),
                            topLevelKeys: Object.keys(item)
                        }
                    }
                })
            };
        });

        // Filter out accommodations with no useful data (optional)
        transformedAccommodations = transformedAccommodations.filter(acc => 
            acc.pricePerNight || acc.imageUrl || acc.rating
        );
    }

    // Enhanced logging
    const summary = {
        total: transformedAccommodations.length,
        withPrices: transformedAccommodations.filter(h => h.pricePerNight).length,
        withImages: transformedAccommodations.filter(h => h.imageUrl).length,
        withRatings: transformedAccommodations.filter(h => h.rating).length,
        withAllData: transformedAccommodations.filter(h => h.pricePerNight && h.imageUrl && h.rating).length
    };
    
    console.log(`SEARCH_ACCOMMODATIONS: Extraction complete:`, summary);
    
    if (transformedAccommodations.length > 0 && process.env.NODE_ENV === 'development') {
        console.log('SEARCH_ACCOMMODATIONS: Sample result with corrected extraction:', 
            JSON.stringify(transformedAccommodations[0], null, 2));
    }

    res.json(transformedAccommodations);
    
} catch (error) {
    console.error('SEARCH_ACCOMMODATIONS: Error:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
    });
    
    if (error.response) {
        res.status(error.response.status || 500).json({
            msg: `Accommodation search failed: ${error.response.data?.message || error.message}`,
            details: process.env.NODE_ENV === 'development' ? error.response.data : undefined
        });
    } else {
        res.status(500).json({ 
            msg: 'Accommodation search failed - network error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}
});




// -----------------------    GET api/search/events -----------------------//
//   Searching for local points of interest/events using Google Places API Via Rapid Api
//  route  is protected for verified app users only that's successfully logged in
router.get("/events", protect, async (req, res) => {
  const { destinationCity, searchTerm = "" } = req.query;

  if (!destinationCity) {
    return res
      .status(400)
      .json({ msg: "Please provide destination city for event/place search." });
  }

  let queryForApi = `things to do in ${destinationCity}`;
  if (searchTerm) {
    queryForApi = `${searchTerm} in ${destinationCity}`;
  }

  console.log(`SEARCH_EVENTS: API Search Query: "${queryForApi}"`);

  const requestBody = {
    textQuery: queryForApi, // API expects textQuery
    languageCode: "en", // API expects languageCode
    maxResultCount: 15, // Max number of results (set limit)
  };

  const options = {
    method: "POST",
    // Corrected: Use the proper endpoint path /v1/places:searchText
    url: `https://${process.env.RAPIDAPI_EVENTS_API_HOST}/v1/places:searchText`,
    headers: {
      "content-type": "application/json",
      "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
      "X-RapidAPI-Host": process.env.RAPIDAPI_EVENTS_API_HOST,
      "X-Goog-FieldMask": "*", // Request all available (basic) fields
    },
    data: requestBody,
  };

  try {
    console.log(
      "SEARCH_EVENTS: Axios request options:",
      JSON.stringify(
        { url: options.url, headers: options.headers, data: options.data },
        null,
        2
      )
    );
    const response = await axios.request(options);

    console.log(
      "SEARCH_EVENTS: Raw response status from external API:",
      response.status
    );
    // console.log('SEARCH_EVENTS: Full raw response data:', JSON.stringify(response.data, null, 2));

    let transformedEvents = [];
    if (response.data && Array.isArray(response.data.places)) {
      transformedEvents = response.data.places.map((place) => {
        // Constructing a basic icon URL if mask and background color are available
        let iconUrl = null;
        if (place.iconMaskBaseUri && place.iconBackgroundColor) {
          // For simplicity, we'll use the base URI. Frontend can handle styling or appending '.png'.
          iconUrl = place.iconMaskBaseUri;
        }

        // Getting an actual image URL requires another API call to GET /v1/places/{place_id}/photos/{PHOTO_RESOURCE_NAME}/media
        // or by constructing a URL with a Google Cloud API Key (not RapidAPI key).
        // For my project I'll pass the first photo reference if available for now
        let firstPhotoReference = null;
        if (place.photos && place.photos.length > 0 && place.photos[0].name) {
          firstPhotoReference = place.photos[0].name;
        }

        return {
          id: place.id, // Google Place ID
          title: place.displayName?.text || "N/A", // Name of the place
          address: place.formattedAddress || "N/A", // Full address
          rating: place.rating || null, // rating of place
          userRatingCount: place.userRatingCount || 0, // Number of ratings
          types: place.types || [], // Array of place types (e.g., "restaurant", "park")
          primaryType:
            place.primaryTypeDisplayName?.text ||
            (place.types && place.types.length > 0 ? place.types[0] : null),
          iconBackgroundColor: place.iconBackgroundColor || null,
          iconUrl: iconUrl, // As constructed above
          googleMapsUri: place.googleMapsUri || null, // Link to Google Maps
          websiteUri: place.websiteUri || null, // Official website
          firstPhotoReference: firstPhotoReference, // Pass the reference, frontend can decide

          imageUrl: null, // Set to null for now
        };
      });
    } else {
      console.log(
        "SEARCH_EVENTS: No places found or unexpected response structure."
      );
      if (response.data && (response.data.error || response.data.message)) {
        // Check for error messages from API
        console.log(
          "SEARCH_EVENTS: API reported error:",
          JSON.stringify(response.data.error || response.data.message)
        );
      }
    }

    console.log(
      `SEARCH_EVENTS: Transformed ${transformedEvents.length} events/places.`
    );
    res.json(transformedEvents);
  } catch (error) {
    console.error("SEARCH_EVENTS: Error fetching event/place data:");
    if (error.response) {
      console.error(
        "Event/Place Error Data:",
        JSON.stringify(error.response.data, null, 2)
      );
      console.error("Event/Place Error Status:", error.response.status);
      res.status(error.response.status || 500).json({
        msg: `Error from event/place API: ${
          error.response.data?.error?.message ||
          error.response.data?.message ||
          "Failed to fetch event/place data"
        }`,
        details: error.response.data,
      });
    } else if (error.request) {
      console.error("Event/Place Error Request:", error.request);
      res
        .status(500)
        .json({ msg: "No response received from event/place API" });
    } else {
      console.error("Event/Place Error Message:", error.message);
      res
        .status(500)
        .json({ msg: "Error in setting up request to event/place API" });
    }
  }
});


// DEBUG ROUTE - Add temporarily to see raw response structure  
router.get('/debug-raw-accommodation', protect, async (req, res) => {
  const apiParams = {
    query: 'Brooklyn',
    checkin: '2025-05-31',
    checkout: '2025-06-07',
    adults: '1',
    currency: 'USD',
  };

  const optionsAccommodation = {
    method: 'GET',
    url: `https://${process.env.RAPIDAPI_ACCOMMODATION_API_HOST}/api/v2/searchPropertyByLocation`,
    params: apiParams,
    headers: {
      'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
      'X-RapidAPI-Host': process.env.RAPIDAPI_ACCOMMODATION_API_HOST
    }
  };

  try {
    const response = await axios.request(optionsAccommodation);
    
    // Log the FIRST item's structure in detail
    if (response.data?.data?.list?.[0]) {
      const firstItem = response.data.data.list[0];
      console.log('=== COMPLETE FIRST ITEM STRUCTURE ===');
      console.log(JSON.stringify(firstItem, null, 2));
    }

    res.json({
      totalItems: response.data?.data?.list?.length || 0,
      firstItemComplete: response.data?.data?.list?.[0] || null
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
