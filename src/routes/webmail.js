// src/routes/webmail.js
// Local testing & development route for Microsoft Outlook Web Webmail client
const express = require('express');
const router = express.Router();

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.get('/', (req, res) => {
  res.render('webmail/index');
});

module.exports = router;
