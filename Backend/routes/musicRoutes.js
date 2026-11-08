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

// Get Sufi Love metadata (last updated timestamp)
router.get(
  "/api/radio/sufi-status",
  musicController.sufiStatus
);


// Get Diwali Puja metadata (last updated timestamp)
router.get(
  "/api/radio/diwali-status",
  musicController.diwaliStatus
);


// Get active radio stations (only those with songs > 0)
router.get(
  "/api/radio/stations",
  musicController.activeStations
);


module.exports = router;