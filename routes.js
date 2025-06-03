const express = require('express');
const axios = require('axios');
const router = express.Router();
const db = require('../models/db');
const bcrypt = require('bcrypt');
const session = require('express-session');

// RapidAPI key
const RAPID_API_KEY = "a197fe5d52msh808c1a0202b7069p13429fjsn3a7434fa6241";
const RAPID_API_HOST = "zillow-com1.p.rapidapi.com";

// Configure session middleware (add this to your app.js)
/*
app.use(session({
  secret: 'your_secret_key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));
*/

// Middleware to check if user is logged in
const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.userId) {
    return next();
  }
  res.redirect('/login');
};

// Profile route
router.get('/profile', isAuthenticated, (req, res) => {
  res.render('profile', {
    user: {
      id: req.session.userId,
      username: req.session.username,
      email: req.session.email
    }
  });
});

// Login page route (GET)
router.get('/login', (req, res) => {
  res.render('login');
});

// Login page route (POST)
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  // Check if username exists
  db.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).render('login', { error: 'An error occurred. Please try again.' });
    }
    
    if (results.length === 0) {
      return res.render('login', { error: 'Invalid username or password' });
    }
    
    const user = results[0];
    
    // Compare passwords
    try {
      const match = await bcrypt.compare(password, user.password);
      
      if (match) {
        // Set session
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.email = user.email;
        
        // Redirect to home page
        return res.redirect('/');
      } else {
        return res.render('login', { error: 'Invalid username or password' });
      }
    } catch (error) {
      console.error('Password comparison error:', error);
      return res.status(500).render('login', { error: 'An error occurred. Please try again.' });
    }
  });
});

// Sign-up page route (GET)
router.get('/sign-up', (req, res) => {
  res.render('sign-up');
});

// Sign-up page route (POST)
router.post('/sign-up', async (req, res) => {
  const { username, email, password, confirmPassword } = req.body;
  
  // Validation
  if (!username || !email || !password || !confirmPassword) {
    return res.render('sign-up', { error: 'All fields are required' });
  }
  
  if (password !== confirmPassword) {
    return res.render('sign-up', { error: 'Passwords do not match' });
  }
  
  try {
    // Check if username or email already exists
    db.query(
      'SELECT * FROM users WHERE username = ? OR email = ?',
      [username, email],
      async (err, results) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).render('sign-up', { error: 'An error occurred. Please try again.' });
        }
        
        if (results.length > 0) {
          return res.render('sign-up', { error: 'Username or email already exists' });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Insert new user
        db.query(
          'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
          [username, email, hashedPassword],
          (err, results) => {
            if (err) {
              console.error('Database error:', err);
              return res.status(500).render('sign-up', { error: 'An error occurred. Please try again.' });
            }
            
            // Redirect to login page with success message
            res.render('login', { success: 'Registration successful! Please log in.' });
          }
        );
      }
    );
  } catch (error) {
    console.error('Sign-up error:', error);
    res.status(500).render('sign-up', { error: 'An error occurred. Please try again.' });
  }
});

// Logout route
router.get('/logout', (req, res) => {
  // Destroy session
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).send('An error occurred during logout');
    }
    res.redirect('/login');
  });
});

// Profile routes
router.get('/profile', isAuthenticated, async (req, res) => {
  try {
    // Fetch user data
    const [user] = await db.promise().query(
      'SELECT id, username, email, created_at FROM users WHERE id = ?',
      [req.session.userId]
    );

    if (!user) {
      req.session.destroy();
      return res.redirect('/login');
    }

    // Fetch user's favorite properties
    const [favorites] = await db.promise().query(
      'SELECT * FROM favorites WHERE user_id = ? ORDER BY added_date DESC',
      [req.session.userId]
    );

    res.render('profile', { user, favorites });
  } catch (error) {
    console.error('Error fetching profile data:', error);
    res.status(500).render('error', { message: 'An error occurred while fetching your profile' });
  }
});

// Add property to favorites
router.post('/api/favorites', isAuthenticated, async (req, res) => {
  try {
    const { propertyId, address, price, type } = req.body;

    // Check if property is already in favorites
    const [existing] = await db.promise().query(
      'SELECT * FROM favorites WHERE user_id = ? AND property_id = ?',
      [req.session.userId, propertyId]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        error: 'This property is already in your favorites'
      });
    }

    // Add to favorites
    await db.promise().query(
      'INSERT INTO favorites (user_id, property_id, property_address, property_price, property_type) VALUES (?, ?, ?, ?, ?)',
      [req.session.userId, propertyId, address, price, type]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error adding to favorites:', error);
    res.status(500).json({
      error: 'Failed to add property to favorites'
    });
  }
});

// Remove property from favorites
router.delete('/api/favorites/:propertyId', isAuthenticated, async (req, res) => {
  try {
    const { propertyId } = req.params;

    // Remove from favorites
    const [result] = await db.promise().query(
      'DELETE FROM favorites WHERE user_id = ? AND property_id = ?',
      [req.session.userId, propertyId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        error: 'Property not found in favorites'
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error removing from favorites:', error);
    res.status(500).json({
      error: 'Failed to remove property from favorites'
    });
  }
});

// Edit profile route
router.get('/profile/edit', isAuthenticated, async (req, res) => {
  try {
    const [user] = await db.promise().query(
      'SELECT id, username, email FROM users WHERE id = ?',
      [req.session.userId]
    );

    if (!user) {
      req.session.destroy();
      return res.redirect('/login');
    }

    res.render('edit-profile', { user });
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(500).render('error', { message: 'An error occurred while fetching your profile' });
  }
});

// Update profile route
router.post('/profile/update', isAuthenticated, async (req, res) => {
  try {
    const { email } = req.body;

    // Update user data
    await db.promise().query(
      'UPDATE users SET email = ? WHERE id = ?',
      [email, req.session.userId]
    );

    res.redirect('/profile');
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).render('error', { message: 'An error occurred while updating your profile' });
  }
});

// API endpoint for property recommendations
router.get('/api/recommendations', async (req, res) => {
  try {
    const { 
      propertyType, 
      bedrooms, 
      priceRange, 
      location, 
      features,
      limit = 3
    } = req.query;

    // Build query parameters for the API
    const params = {
      location: location || 'London',
      radius: '5',
      page: '1',
      minPrice: '0',
      maxPrice: '10000000',
      sort: 'Relevance'
    };

    // Add filters if provided
    if (propertyType) params.home_type = propertyType;
    if (bedrooms) {
      params.minBeds = bedrooms;
      params.maxBeds = bedrooms;
    }
    if (priceRange) {
      const [min, max] = priceRange.split('-');
      params.minPrice = min || '0';
      if (max) params.maxPrice = max;
    }

    // Make API request to Zillow
    const response = await axios({
      method: 'GET',
      url: 'https://zillow-com1.p.rapidapi.com/propertyExtendedSearch',
      params,
      headers: {
        'X-RapidAPI-Key': RAPID_API_KEY,
        'X-RapidAPI-Host': RAPID_API_HOST
      }
    });

    // Process and filter results
    let properties = [];
    if (response.data?.props) {
      properties = response.data.props
        .map(prop => ({
          id: prop.zpid,
          address: prop.address,
          price: prop.price ? `$${prop.price.toLocaleString()}` : 'Price on request',
          bedrooms: prop.bedrooms || 0,
          bathrooms: prop.bathrooms || 0,
          propertyType: prop.homeType || 'Property',
          description: prop.description || '',
          image: prop.imgSrc || '/images/default-property.jpg',
          features: prop.homeFacts?.map(fact => fact.text) || []
        }))
        .slice(0, parseInt(limit));
    }

    res.json({ success: true, properties });
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch recommendations',
      details: error.message 
    });
  }
});

// Example of protected route
router.get('/profile', isAuthenticated, (req, res) => {
  // Fetch user data
  db.query('SELECT id, username, email, created_at FROM users WHERE id = ?', [req.session.userId], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).send('An error occurred');
    }
    
    if (results.length === 0) {
      req.session.destroy();
      return res.redirect('/login');
    }
    
    const user = results[0];
    res.render('profile', { user });
  });
});

// Keep your existing routes
router.get('/', async (req, res) => {
  try {
    const { location = 'London', radius = '1', minPrice = '0', maxPrice = '1000000', minBeds = '0', maxBeds = '5', propertyType = 'residential', page = '1' } = req.query;

    // Fetch Featured Listings from RapidAPI
    const response = await axios({
      method: 'GET',
      url: 'https://zillow-com1.p.rapidapi.com/propertyExtendedSearch',
      params: {
        location: location,
        radius: radius,
        minPrice: minPrice,
        maxPrice: maxPrice,
        minBeds: minBeds,
        maxBeds: maxBeds,
        home_type: propertyType,
        page: page
      },
      headers: {
        'X-RapidAPI-Key': RAPID_API_KEY,
        'X-RapidAPI-Host': RAPID_API_HOST
      }
    });

    let listings = [];
    if (response.data && response.data.props) {
      listings = response.data.props.map(prop => {
        return {
          listing_id: prop.zpid || '',
          displayable_address: prop.address || '',
          price: prop.price || 0,
          property_type: prop.homeType || 'Property',
          num_bedrooms: prop.bedrooms || 0,
          num_bathrooms: prop.bathrooms || 0,
          short_description: prop.description || '',
          agent_name: prop.brokerName || 'Agent',
          image_url: prop.imgSrc || ''
        };
      });
    }

    // Fetch Latest Listings (use a similar method as above)
    const latestResponse = await axios({
      method: 'GET',
      url: 'https://zillow-com1.p.rapidapi.com/propertyExtendedSearch',
      params: {
        location: location,
        radius: radius,
        minPrice: minPrice,
        maxPrice: maxPrice,
        minBeds: minBeds,
        maxBeds: maxBeds,
        home_type: propertyType,
        page: page
      },
      headers: {
        'X-RapidAPI-Key': RAPID_API_KEY,
        'X-RapidAPI-Host': RAPID_API_HOST
      }
    });

    let latestListings = [];
    if (latestResponse.data && latestResponse.data.props) {
      latestListings = latestResponse.data.props.slice(0, 9).map(prop => {
        return {
          listing_id: prop.zpid || '',
          displayable_address: prop.address || '',
          price: prop.price || 0,
          property_type: prop.homeType || 'Property',
          num_bedrooms: prop.bedrooms || 0,
          num_bathrooms: prop.bathrooms || 0,
          short_description: prop.description || '',
          agent_name: prop.brokerName || 'Agent',
          image_url: prop.imgSrc || ''
        };
      });
    }

    // Pass user info to the template if logged in
    const user = req.session && req.session.userId ? { username: req.session.username } : null;
    res.render('index', { listings, latestListings, user });
  } catch (error) {
    console.error('Error fetching listings:', error);
    res.render('index', { listings: [], latestListings: [], user: null });
  }
});

router.get('/home', (req, res) => {
  res.render('index');
});

// Listings page route with RapidAPI integration
router.get('/listings', async (req, res) => {
  try {
    // Check if API key is available
    if (!RAPID_API_KEY) {
      throw new Error('RapidAPI key is missing');
    }

    // Get query parameters with defaults
    const {
      location = 'London',
      radius = '1',
      minPrice = '0',
      maxPrice = '1000000',
      minBeds = '0',
      maxBeds = '5',
      propertyType = 'residential',
      page = '1'
    } = req.query;

    // Call to RapidAPI
    const response = await axios({
      method: 'GET',
      url: 'https://zillow-com1.p.rapidapi.com/propertyExtendedSearch',
      params: {
        location: location,
        radius: radius,
        minPrice: minPrice,
        maxPrice: maxPrice,
        minBeds: minBeds,
        maxBeds: maxBeds,
        home_type: propertyType,
        page: page
      },
      headers: {
        'X-RapidAPI-Key': RAPID_API_KEY,
        'X-RapidAPI-Host': RAPID_API_HOST
      }
    });

    // Log full response for debugging
    // console.log('API Response:', JSON.stringify(response.data, null, 2));

    // Process the response data
    let listings = [];
    let totalResults = 0;

    if (response.data && response.data.props) {
      listings = response.data.props.map(prop => {
        // Ensure all required properties exist
        return {
          listing_id: prop.zpid || '',
          displayable_address: prop.address || '',
          price: prop.price || 0,
          property_type: prop.homeType || prop.propertyType || 'Property',
          num_bedrooms: prop.bedrooms || 0,
          num_bathrooms: prop.bathrooms || 0,
          num_recepts: prop.receptionRooms || 0,
          short_description: prop.description || '',
          agent_name: prop.brokerName || 'Agent',
          image_url: prop.imgSrc || prop.primaryImageUrl || '',
        };
      });

      totalResults = response.data.totalResultCount || listings.length;
    }

    const resultsPerPage = 20; // Adjust based on API's default
    const totalPages = Math.ceil(totalResults / resultsPerPage);

    // Render the listings page with the data
    res.render('listings', {
      listings,
      totalResults,
      currentPage: parseInt(page),
      totalPages,
      searchParams: { location, radius, minPrice, maxPrice, minBeds, maxBeds, propertyType }
    });
  } catch (error) {
    console.error('Error fetching property listings:', error);
    res.render('listings', {
      error: 'Failed to fetch property listings: ' + (error.response?.data?.message || error.message),
      listings: [],
      totalResults: 0,
      currentPage: 1,
      totalPages: 0,
      searchParams: req.query || {}
    });
  }
});

// Listing detail page route
router.get('/listing/:id', async (req, res) => {
  try {
    const listingId = req.params.id;
    
    const response = await axios({
      method: 'GET',
      url: 'https://zillow-com1.p.rapidapi.com/property',
      params: {
        zpid: listingId
      },
      headers: {
        'X-RapidAPI-Key': RAPID_API_KEY,
        'X-RapidAPI-Host': RAPID_API_HOST
      }
    });

    const property = response.data;
    res.render('listing-detail', { property });

  } catch (error) {
    console.error('Error fetching property details:', error);
    res.render('listing-detail', {
      error: 'Failed to fetch property details: ' + (error.response?.data?.message || error.message),
      property: null
    });
  }
});


// Property images route
router.get('/propertyImages/:id', async (req, res) => {
  try {
    const propertyId = req.params.id;

    const response = await axios({
      method: 'GET',
      url: 'https://zillow-com1.p.rapidapi.com/images',
      params: {
        zpid: propertyId
      },
      headers: {
        'X-RapidAPI-Key': RAPID_API_KEY,
        'X-RapidAPI-Host': RAPID_API_HOST
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error fetching property images:', error);
    res.status(500).json({
      error: 'Failed to fetch property images: ' + (error.response?.data?.message || error.message)
    });
  }
});

// Floor plan route
router.get('/propertyFloorPlan/:id', async (req, res) => {
  try {
    const propertyId = req.params.id;

    const response = await axios({
      method: 'GET',
      url: 'https://zillow-com1.p.rapidapi.com/propertyFloorPlan',
      params: {
        zpid: propertyId
      },
      headers: {
        'X-RapidAPI-Key': RAPID_API_KEY,
        'X-RapidAPI-Host': RAPID_API_HOST
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error fetching floor plan:', error);
    res.status(500).json({
      error: 'Failed to fetch floor plan: ' + (error.response?.data?.message || error.message)
    });
  }
});

// About page route
router.get('/about', (req, res) => {
  // Query the 'about' table to fetch the content
  db.query('SELECT * FROM about', (err, results) => {
    if (err) {
      console.error('Error fetching data:', err);
      return res.status(500).send('Internal Server Error');
    }

    // Check if there's content in the result and pass it to the template
    if (results.length > 0) {
      res.render('about', { content: results[0].content });
    } else {
      res.render('about', { content: 'No content available.' });
    }
  });
});


// Contact page route
router.get('/contact', (req, res) => {
  res.render('contact');
});

router.post('/contact', (req, res) => {
  const { name, email, message } = req.body;
  db.query(
    'INSERT INTO contacts (name, email, message) VALUES (?, ?, ?)',
    [name, email, message],
    (err, results) => {
      if (err) throw err;
      res.send('Message sent!');
    }
  );
});

router.get('/mortgageCalculator', async (req, res) => {
  try {
    // Get cities data from database or predefined list
    const cities = [
      { id: 1, name: 'London', country: 'UK' },
      { id: 2, name: 'Manchester', country: 'UK' },
      { id: 3, name: 'Birmingham', country: 'UK' },
      { id: 4, name: 'Leeds', country: 'UK' },
      { id: 5, name: 'Glasgow', country: 'UK' }
    ];

    res.render('mortgageCalculator', { cities });
  } catch (error) {
    console.error('Error fetching cities:', error);
    res.render('mortgageCalculator', { cities: [] });
  }
});

// New route to fetch properties based on city
router.get('/api/properties/:city', async (req, res) => {
  try {
    const city = req.params.city;

    const response = await axios({
      method: 'GET',
      url: 'https://zillow-com1.p.rapidapi.com/propertyExtendedSearch',
      params: {
        location: city,
        radius: '1',
        minPrice: '0',
        maxPrice: '1000000',
        minBeds: '0',
        maxBeds: '5',
        home_type: 'residential'
      },
      headers: {
        'X-RapidAPI-Key': RAPID_API_KEY,
        'X-RapidAPI-Host': RAPID_API_HOST
      }
    });

    let properties = [];
    if (response.data && response.data.props) {
      properties = response.data.props.map(prop => {
        return {
          zpid: prop.zpid || '',
          address: prop.address || '',
          price: prop.price || 0
        };
      });
    }

    res.json(properties);
  } catch (error) {
    console.error('Error fetching properties:', error);
    res.status(500).json({
      error: 'Failed to fetch properties: ' + (error.response?.data?.message || error.message)
    });
  }
});

// Zillow estimate API endpoint
router.post('/api/zillowEstimate', async (req, res) => {
  try {
    const { zpid, downPayment } = req.body;

    // Check if API key is available
    if (!RAPID_API_KEY) {
      throw new Error('RapidAPI key is missing');
    }

    // Get property details
    const propertyResponse = await axios({
      method: 'GET',
      url: 'https://zillow-com1.p.rapidapi.com/property',
      params: {
        zpid: zpid
      },
      headers: {
        'X-RapidAPI-Key': RAPID_API_KEY,
        'X-RapidAPI-Host': RAPID_API_HOST
      }
    });

    const property = propertyResponse.data;

    // Calculate mortgage estimate
    const price = property.price || 0;
    const downPaymentAmount = (price * (downPayment / 100));
    const loanAmount = price - downPaymentAmount;
    const interestRate = 4.5; // Default interest rate
    const loanTerm = 360; // 30 years in months

    // Calculate monthly payment
    const monthlyRate = interestRate / 100 / 12;
    const monthlyPayment = (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, loanTerm)) / (Math.pow(1 + monthlyRate, loanTerm) - 1);

    res.json({
      property,
      downPaymentAmount,
      loanAmount,
      monthlyPayment: monthlyPayment.toFixed(2)
    });
  } catch (error) {
    console.error('Error calculating Zillow estimate:', error);
    res.status(500).json({
      error: 'Failed to calculate estimate: ' + (error.response?.data?.message || error.message)
    });
  }
});

// Mortgage calculator API endpoint
router.post('/api/mortgageEstimate', async (req, res) => {
  try {
    // Check if API key is available
    if (!RAPID_API_KEY) {
      throw new Error('RapidAPI key is missing');
    }

    const { zpid, price, down, loanType } = req.body;

    // Build request parameters
    const params = { zpid };
    if (price) params.price = price;
    if (down) params.down = down;
    if (loanType) params.loanType = loanType;

    // Call to RapidAPI
    const response = await axios({
      method: 'GET',
      url: 'https://zillow-com1.p.rapidapi.com/propertyEstimateMortgage',
      params,
      headers: {
        'X-RapidAPI-Key': RAPID_API_KEY,
        'X-RapidAPI-Host': RAPID_API_HOST
      }
    });

    // Return the mortgage estimation data
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching mortgage estimate:', error);
    res.status(500).json({
      error: 'Failed to fetch mortgage estimate: ' + (error.response?.data?.message || error.message)
    });
  }
});

router.get('/login', (req, res) => {
  res.render('login');
});

router.get('/sign-up', (req, res) => {
  res.render('sign-up');
});

module.exports = router;