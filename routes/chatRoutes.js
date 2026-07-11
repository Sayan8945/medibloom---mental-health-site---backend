const express = require('express');
const { sendMessage } = require('../controllers/chatController');

const router = express.Router();

// Public endpoint — guests get generic responses, logged-in users get
// personalized ones. Rate limited in server.js (LLM calls cost money).
router.post('/', sendMessage);

module.exports = router;
