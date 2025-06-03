const express = require('express');
const router = express.Router();
const db = require('../models/db');

// Get user profile
router.get('/', async (req, res) => {
  try {
    const { user_id } = req.session;

    if (!user_id) {
      return res.redirect('/login');
    }

    // Get user details
    const [user] = await db.query('SELECT * FROM users WHERE id = ?', [user_id]);
    
    if (!user[0]) {
      return res.redirect('/login');
    }

    res.render('profile', { 
      user: user[0],
      title: 'Profile' 
    });
  } catch (error) {
    console.error('Error getting profile:', error);
    res.status(500).send('Error getting profile');
  }
});

module.exports = router;
