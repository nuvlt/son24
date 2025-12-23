// src/routes/index.js
// Route aggregator

const express = require('express');
const router = express.Router();

const postsRoutes = require('./posts');
const spacesRoutes = require('./spaces');
const systemRoutes = require('./system');

// Mount routes
router.use('/posts', postsRoutes);
router.use('/space', spacesRoutes);
router.use('/spaces', spacesRoutes);  // Alias
router.use('/', systemRoutes);

module.exports = router;
