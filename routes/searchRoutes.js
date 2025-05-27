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

  const formatDateTimeForKiwiAPI = (dateString) => {
    if (!dateString) return undefined;
    // if dateString is YYYY-MM-DD
    const [year, month, day] = dateString.split("-");
    return `${day}/${month}/${year}`; // Kiwi API uses DD/MM/YYYY for date_from/date_to
  };

  const baseApiParams = {
    fly_from: origin, // Using fly_from for origin
    fly_to: destination, // Using fly_to for destination
    adults: parseInt(adults, 10),
    children: parseInt(children, 10),
    infants: parseInt(infants, 10),
    curr: "USD", // Currency
    locale: "en",
    limit: 15, // Number of results (default is 20)
  };

  if (sortBy) {
    // Kiwi sort options: price, duration, quality, date
    baseApiParams.sort = sortBy.toLowerCase();
  }

  if (maxStopovers !== undefined && ["0", "1", "2"].includes(maxStopovers)) {
    baseApiParams.max_stopovers = parseInt(maxStopovers, 10); // max_stopovers for direct Kiwi
  }

  let requestUrl;
  let specificApiParams = { ...baseApiParams };
  const formattedDepartureDate = formatDateTimeForKiwiAPI(departureDate);

  specificApiParams.date_from = formattedDepartureDate;
  specificApiParams.date_to = formattedDepartureDate;

  const originalKiwiParams = {
    source: origin,
    destination: destination,
    adults: parseInt(adults, 10),
    children: parseInt(children, 10),
    infants: parseInt(infants, 10),
    currency: "USD",
    locale: "en",
    limit: 15,
  };
  if (sortBy) {
    originalKiwiParams.sortBy = sortBy.toUpperCase();
  }
  if (maxStopovers !== undefined && ["0", "1", "2"].includes(maxStopovers)) {
    originalKiwiParams.maxStopsCount = parseInt(maxStopovers, 10);
  }

  let specificKiwiWrapperParams = { ...originalKiwiParams };

  // Re-using your original date formatting for the Kiwi wrapper if it worked.
  const formatDateTimeForKiwiWrapper = (dateString) => {
    if (!dateString) return undefined;
    return `${dateString}T00:00:00`; // YYYY-MM-DDTHH:MM:SS
  };

  const formattedDepartureDateTime =
    formatDateTimeForKiwiWrapper(departureDate);

  if (returnDate) {
    console.log("SEARCH_FLIGHTS: Detected ROUND TRIP search.");
    requestUrl = "https://kiwi-com-cheap-flights.p.rapidapi.com/round-trip";
    specificKiwiWrapperParams.outboundDepartmentDateStart =
      formattedDepartureDateTime;
    specificKiwiWrapperParams.outboundDepartmentDateEnd =
      formattedDepartureDateTime;
    const formattedReturnDateTime = formatDateTimeForKiwiWrapper(returnDate);
    specificKiwiWrapperParams.inboundDepartureDateStart =
      formattedReturnDateTime;
    specificKiwiWrapperParams.inboundDepartureDateEnd = formattedReturnDateTime;
    if (
      specificKiwiWrapperParams.sortBy === "PRICE" ||
      specificKiwiWrapperParams.sortBy === "DURATION"
    ) {
      specificKiwiWrapperParams.sortOrder = "ASCENDING";
    }
  } else {
    console.log("SEARCH_FLIGHTS: Detected ONE-WAY search.");
    requestUrl = "https://kiwi-com-cheap-flights.p.rapidapi.com/one-way";
    specificKiwiWrapperParams.outboundDepartmentDateStart =
      formattedDepartureDateTime;
    specificKiwiWrapperParams.outboundDepartmentDateEnd =
      formattedDepartureDateTime;
  }

  console.log(`SEARCH_FLIGHTS: Requesting URL: ${requestUrl}`);
  console.log("SEARCH_FLIGHTS: API Params to send:", specificKiwiWrapperParams);

  const optionsFlight = {
    method: "GET",
    url: requestUrl,
    params: specificKiwiWrapperParams, // Using wrapper-specific params
    headers: {
      "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
      "X-RapidAPI-Host": process.env.RAPIDAPI_FLIGHT_API_HOST,
    },
  };

  try {
    const response = await axios.request(optionsFlight);
    console.log(
      "SEARCH_FLIGHTS: Raw response status from external API:",
      response.status
    );

    let transformedFlights = [];
    if (response.data && Array.isArray(response.data.itineraries)) {
      transformedFlights = response.data.itineraries.map((itinerary) => {
        let flightPrice = itinerary.price?.amount;
        let bookingLink = null;
        if (
          itinerary.bookingOptions?.edges?.length > 0 &&
          itinerary.bookingOptions.edges[0].node
        ) {
          const primaryBookingOption = itinerary.bookingOptions.edges[0].node;
          flightPrice = primaryBookingOption.price?.amount || flightPrice;
          if (primaryBookingOption.bookingUrl) {
            bookingLink = primaryBookingOption.bookingUrl.startsWith("/")
              ? `https://www.kiwi.com${primaryBookingOption.bookingUrl}`
              : primaryBookingOption.bookingUrl;
          }
        }
        const firstSegment = itinerary.sector?.sectorSegments?.[0]?.segment;
        const departureInfo = firstSegment?.source;
        const arrivalInfo = firstSegment?.destination;
        const carrierInfo = firstSegment?.carrier;
        const formatDuration = (totalSeconds) => {
          if (
            totalSeconds === null ||
            totalSeconds === undefined ||
            isNaN(totalSeconds)
          )
            return "N/A";
          const hours = Math.floor(totalSeconds / 3600);
          const minutes = Math.floor((totalSeconds % 3600) / 60);
          let durationStr = "";
          if (hours > 0) durationStr += `${hours}h `;
          if (minutes >= 0) durationStr += `${minutes}m`;
          return durationStr.trim() || "0m";
        };
        return {
          id: itinerary.id || itinerary.legacyId,
          price: flightPrice ? parseFloat(flightPrice) : null,
          currency:
            response.data.currency ||
            response.data.metadata?.currency ||
            itinerary.price?.currency ||
            specificKiwiWrapperParams.currency ||
            "USD",
          departureCity: departureInfo?.station?.city?.name || "N/A",
          departureAirport: departureInfo?.station?.name || "N/A",
          departureAirportCode: departureInfo?.station?.code || "N/A",
          departureTimeLocal: departureInfo?.localTime || "N/A",
          departureTimeUTC: departureInfo?.utcTime || "N/A",
          arrivalCity: arrivalInfo?.station?.city?.name || "N/A",
          arrivalAirport: arrivalInfo?.station?.name || "N/A",
          arrivalAirportCode: arrivalInfo?.station?.code || "N/A",
          arrivalTimeLocal: arrivalInfo?.localTime || "N/A",
          arrivalTimeUTC: arrivalInfo?.utcTime || "N/A",
          durationInSeconds:
            firstSegment?.duration === undefined ? null : firstSegment.duration,
          durationFormatted: formatDuration(firstSegment?.duration),
          airlineName: carrierInfo?.name || "N/A",
          airlineCode: carrierInfo?.code || "N/A",
          flightNumber: firstSegment?.code || "N/A",
          bookingLink: bookingLink,
          provider: itinerary.provider?.name || "Kiwi.com",
        };
      });

      //Debugging kiwi flight api
    }
    console.log(
      `SEARCH_FLIGHTS: Transformed ${transformedFlights.length} flights.`
    );
    res.json(transformedFlights);
  } catch (error) {
    console.error("SEARCH_FLIGHTS: Error fetching flight data:");
    if (error.response) {
      console.error(
        "Flight Error Data:",
        JSON.stringify(error.response.data, null, 2)
      );
      console.error("Flight Error Status:", error.response.status);
      res.status(error.response.status).json({
        msg: `Error from flight API: ${
          error.response.data?.message || "Failed to fetch flight data"
        }`,
        details: error.response.data,
      });
    } else if (error.request) {
      console.error(
        "Flight Error Request (no response received):",
        error.request
      );
      res.status(500).json({ msg: "No response received from flight API" });
    } else {
      console.error(
        "Flight Error Message (error in setting up request):",
        error.message
      );
      res
        .status(500)
        .json({ msg: "Error in setting up request to flight API" });
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
        currency = 'USD',
        // Potential future filter params from req.query:
        // priceMin, priceMax, minBedrooms, etc.
    } = req.query;

    if (!destinationCity || !checkInDate || !checkOutDate) {
        console.log('SEARCH_ACCOMMODATIONS_VALIDATION_ERROR: Missing required fields.');
        return res.status(400).json({ msg: 'Please provide destination, check-in date, and check-out date.' });
    }
    if (new Date(checkInDate) >= new Date(checkOutDate)) {
        console.log('SEARCH_ACCOMMODATIONS_VALIDATION_ERROR: Invalid date range.');
        return res.status(400).json({ msg: 'Check-out date must be after check-in date.' });
    }

    console.log(`SEARCH_ACCOMMODATIONS: Request received for query: ${destinationCity}, Check-in: ${checkInDate}, Check-out: ${checkOutDate}, Adults: ${adults}, Currency: ${currency}`);

    const apiParams = {
        query: destinationCity,
        checkin: checkInDate,
        checkout: checkOutDate,
        adults: adults,
        currency: currency,
    };
    // Add optional filter params if they exist in req.query
    // Example: if (req.query.priceMin) apiParams.priceMin = parseInt(req.query.priceMin);
    // Example: if (req.query.minBedrooms) apiParams.minBedrooms = parseInt(req.query.minBedrooms);

    const optionsAccommodation = {
        method: 'GET',
        url: `https://${process.env.RAPIDAPI_ACCOMMODATION_API_HOST}/api/v2/searchPropertyByLocation`,
        params: apiParams,
        headers: {
            'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
            'X-RapidAPI-Host': process.env.RAPIDAPI_ACCOMMODATION_API_HOST
        }
    };

    console.log('SEARCH_ACCOMMODATIONS: Preparing to call external API.');
    console.log('SEARCH_ACCOMMODATIONS: API URL:', optionsAccommodation.url);
    console.log('SEARCH_ACCOMMODATIONS: API Params to send:', JSON.stringify(apiParams, null, 2));

    try {
        console.log('SEARCH_ACCOMMODATIONS: Attempting to call external Airbnb API...');
        const response = await axios.request(optionsAccommodation);
        
         console.log('SEARCH_ACCOMMODATIONS: External API Response Status:', response.status);
    
    // --- START OF FORCED DEBUG LOGGING ---
    console.log('SEARCH_ACCOMMODATIONS: ---- START RAW RESPONSE.DATA DEBUG ----');
    if (response && response.data) {
        console.log('SEARCH_ACCOMMODATIONS: type of response.data:', typeof response.data);
        // Attempt to log the whole response.data - if too big, terminal might truncate
        // but we at least want to see its top-level keys.
        try {
            console.log('SEARCH_ACCOMMODATIONS: response.data (full or partial):', JSON.stringify(response.data, null, 2));
        } catch (e) {
            console.error('SEARCH_ACCOMMODATIONS: Error stringifying response.data:', e.message);
            console.log('SEARCH_ACCOMMODATIONS: response.data (raw object, might be complex):', response.data);
        }

        if (response.data.data && response.data.data.list && Array.isArray(response.data.data.list) && response.data.data.list.length > 0) {
            console.log('SEARCH_ACCOMMODATIONS: ---- RAW API response for FIRST LISTING ITEM ----');
            console.log(JSON.stringify(response.data.data.list[0], null, 2));
            console.log('SEARCH_ACCOMMODATIONS: ---- END RAW API response for FIRST LISTING ITEM ----');
        } else {
            console.log('SEARCH_ACCOMMODATIONS: ---- Could not find response.data.data.list[0] ----');
            console.log('SEARCH_ACCOMMODATIONS: response.data.data exists?', !!response.data.data);
            if (response.data.data) {
                console.log('SEARCH_ACCOMMODATIONS: response.data.data.list exists and is array?', Array.isArray(response.data.data.list));
                if (Array.isArray(response.data.data.list)) {
                    console.log('SEARCH_ACCOMMODATIONS: response.data.data.list length:', response.data.data.list.length);
                }
            }
        }
    } else {
        console.log('SEARCH_ACCOMMODATIONS: ---- response.data is missing or undefined ----');
    }
    console.log('SEARCH_ACCOMMODATIONS: ---- END RAW RESPONSE.DATA DEBUG ----');

        let transformedAccommodations = [];
        if (response.data && typeof response.data.status === 'boolean' && response.data.data && Array.isArray(response.data.data.list)) {
            if (response.data.status === true) {
                console.log(`SEARCH_ACCOMMODATIONS: External API reported success. Items in 'list': ${response.data.data.list.length}`);
                transformedAccommodations = response.data.data.list.map(item => {
                    const listing = item.listing;
                    if (!listing || !listing.id) {
                        console.warn('SEARCH_ACCOMMODATIONS_TRANSFORM_WARN: Item in list missing "listing" object or listing.id. Skipping item.');
                        return null; 
                    }

                    let currentPricePerNight = null;
                    let currentTotalPrice = null;
                    let currentRating = null;
                    let currentReviewCount = null;
                    let currentImageUrl = null;
                    let currentImages = [];

                    // --- Price Extraction ---
                    const primaryLine = listing.structuredDisplayPrice?.primaryLine;
                    if (primaryLine) {
                        let priceString = primaryLine.price; 
                        if (primaryLine.__typename === "DiscountedDisplayPriceLine" && primaryLine.discountedPrice) {
                            priceString = primaryLine.discountedPrice;
                        }
                        if (priceString && typeof priceString === 'string') {
                            const priceMatch = priceString.match(/[\d\.]+/);
                            if (priceMatch && priceMatch[0]) {
                                currentPricePerNight = parseFloat(priceMatch[0]);
                            }
                        }
                    }
                    const secondaryLine = listing.structuredDisplayPrice?.secondaryLine;
                    if (secondaryLine?.price && typeof secondaryLine.price === 'string') {
                        const totalMatch = secondaryLine.price.match(/[\d\.]+/);
                        if (totalMatch && totalMatch[0]) {
                            currentTotalPrice = parseFloat(totalMatch[0]);
                        }
                    }

                    // --- Rating and Review Count Extraction ---
                    if (listing.avgRatingLocalized && typeof listing.avgRatingLocalized === 'string') {
                        const ratingMatch = listing.avgRatingLocalized.match(/^([\d\.]+)/);
                        if (ratingMatch && ratingMatch[1]) {
                            currentRating = parseFloat(ratingMatch[1]);
                        }
                        const reviewMatch = listing.avgRatingLocalized.match(/\(([\d,]+)\)/);
                        if (reviewMatch && reviewMatch[1]) {
                            currentReviewCount = parseInt(reviewMatch[1].replace(/,/g, ''), 10);
                        }
                    }
                    if (currentRating === null && listing.ratingAverage !== undefined && listing.ratingAverage !== null) {
                         currentRating = parseFloat(listing.ratingAverage);
                    }
                    if (currentReviewCount === null && listing.ratingCount !== undefined && listing.ratingCount !== null) {
                        currentReviewCount = parseInt(listing.ratingCount, 10);
                    }

                    // --- Image Extraction ---
                    if (listing.contextualPictures && Array.isArray(listing.contextualPictures)) {
                        if (listing.contextualPictures.length > 0 && listing.contextualPictures[0]?.picture) {
                            currentImageUrl = listing.contextualPictures[0].picture;
                        }
                        currentImages = listing.contextualPictures.map(p => p.picture).filter(p => typeof p === 'string');
                    }
                    
                    const airbnbUrl = `https://www.airbnb.com/rooms/${listing.id}`;

                    return {
                        id: listing.id,
                        name: listing.title || listing.legacyName || "N/A",
                        location: listing.demandStayListing?.location?.localizedCityName || listing.demandStayListing?.location?.city || listing.legacyCity || destinationCity,
                        destinationCity: listing.demandStayListing?.location?.city || listing.legacyCity || destinationCity,
                        pricePerNight: currentPricePerNight,
                        totalPrice: currentTotalPrice,
                        currency: currency, // Use the currency from the request, API should respect it
                        rating: currentRating,
                        reviewCount: currentReviewCount,
                        imageUrl: currentImageUrl,
                        images: currentImages,
                        bookingLink: airbnbUrl,
                        provider: 'Airbnb',
                        description: listing.legacyName || listing.title || "No description available.",
                        checkInDate: checkInDate,
                        checkOutDate: checkOutDate,
                        numberOfGuests: parseInt(adults, 10),
                    };
                }).filter(hotel => hotel !== null); // Filter out items that were skipped (returned null)
            } else {
                 console.log('SEARCH_ACCOMMODATIONS_WARN: External API reported status:false. Message:', response.data.message);
            }
        } else {
            console.log('SEARCH_ACCOMMODATIONS_WARN: Unexpected response structure from Airbnb API or missing data.data.list. Full response.data:', JSON.stringify(response.data, null, 2));
        }

        console.log(`SEARCH_ACCOMMODATIONS: Transformation complete. Found ${transformedAccommodations.length} valid accommodations.`);
        if (transformedAccommodations.length > 0) {
            console.log('SEARCH_ACCOMMODATIONS: Sample transformed data being sent to frontend (first item):', JSON.stringify(transformedAccommodations[0], null, 2));
        } else {
            console.log('SEARCH_ACCOMMODATIONS: No accommodations to send to frontend after transformation.');
        }
        res.json(transformedAccommodations);

    } catch (error) {
        console.error('SEARCH_ACCOMMODATIONS: FATAL ERROR during external API call or processing:');
        if (error.response) {
            console.error('External API Error - Status:', error.response.status);
            console.error('External API Error - Data:', JSON.stringify(error.response.data, null, 2));
            res.status(error.response.status).json({
                msg: `Error from accommodation API: ${error.response.data?.message || error.response.data?.title || 'Failed to fetch accommodation data (API Error)'}`,
                details: error.response.data
            });
        } else if (error.request) {
            console.error('External API Error - No response received.');
            res.status(502).json({ msg: 'No response received from accommodation API (Bad Gateway / Timeout)' });
        } else {
            console.error('External API Error - Error in setting up request:', error.message);
            console.error('External API Error - Stack for setup error:', error.stack);
            res.status(500).json({ msg: 'Error in setting up request to accommodation API (Internal Server Error)' });
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

module.exports = router;
