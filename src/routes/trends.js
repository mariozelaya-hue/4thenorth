const express = require('express');
const router = express.Router();
const { getCanadianTrends } = require('../services/trends');

let cache = { data: [], timestamp: 0 };

router.get('/', async (req, res) => {
  const now = Date.now();
  if (now - cache.timestamp < 15 * 60 * 1000 && cache.data.length > 0) {
    return res.json({ trends: cache.data });
  }
  const trends = await getCanadianTrends();
  cache = { data: trends, timestamp: now };
  res.json({ trends });
});

module.exports = router;
