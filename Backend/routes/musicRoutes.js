const express = require("express");

const router = express.Router();

const musicController =
  require("../controllers/musicController");


// Search any song
router.get(
  "/api/music/search",
  musicController.search
);


// Get complete RetroRaag radio catalog
router.get(
  "/api/radio/songs",
  musicController.radioSongs
);


// Check catalog status
router.get(
  "/api/radio/status",
  musicController.radioStatus
);

// Get Spotify Top 50 metadata (last updated timestamp)
router.get(
  "/api/radio/spotify-status",
  musicController.spotifyStatus
);


module.exports = router;