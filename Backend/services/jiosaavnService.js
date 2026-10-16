const fs = require("fs");
const path = require("path");
const axios = require("axios");

const DATA_DIR = path.join(__dirname, "..", "data");
const SONGS_PATH = path.join(DATA_DIR, "songs.json");
const KISHORE_PATH = path.join(DATA_DIR, "kishoreSongs.json");

const JIOSAAVN_BASE_URL =
  process.env.JIOSAAVN_API_BASE_URL ||
  "https://saavn.sumit.co/api";

const REQUEST_TIMEOUT_MS = Number(
  process.env.CATALOG_REQUEST_TIMEOUT_MS || 20000
);

function loadSongs(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const data = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error(`Failed to load songs from ${filePath}:`, error.message);
    return [];
  }
}

function getCatalog(station = "90s") {
  if (station === "kishore") {
    const kishore = loadSongs(KISHORE_PATH);
    if (kishore.length > 0) return kishore;
  }
  const songs = loadSongs(SONGS_PATH);
  if (songs.length > 0) return songs;
  return loadSongs(KISHORE_PATH);
}

async function getRadioSongs(station = "90s") {
  const catalog = getCatalog(station);
  if (catalog.length > 0) {
    return catalog;
  }
  return [
    {
      id: "fallback-1",
      name: "Pehla Nasha",
      artists: ["Udit Narayan", "Sadhana Sargam"],
      album: "Jo Jeeta Wohi Sikandar",
      image: null,
      streamUrl: ""
    }
  ];
}

function getCatalogStatus(station = "90s") {
  const catalog = getCatalog(station);
  return {
    totalSongs: catalog.length,
    station,
    status: catalog.length > 0 ? "ready" : "empty"
  };
}

async function searchTracks(query) {
  if (!query || !query.trim()) {
    return [];
  }

  try {
    const response = await axios.get(
      `${JIOSAAVN_BASE_URL}/search/songs`,
      {
        params: { query, limit: 20 },
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
          Accept: "application/json",
          "User-Agent": "RetroRaag-Backend/1.0"
        }
      }
    );

    const results = response.data?.data?.results || response.data?.results || [];
    return results.map((song) => ({
      id: song.id || null,
      name: song.name || song.title || null,
      artists: Array.isArray(song.artists?.primary)
        ? song.artists.primary.map(a => a.name).filter(Boolean)
        : Array.isArray(song.artists)
        ? song.artists.map(a => a.name || a).filter(Boolean)
        : [],
      album: song.album?.name || song.album || null,
      image: Array.isArray(song.image)
        ? song.image[song.image.length - 1]?.url || null
        : song.image || null,
      streamUrl: Array.isArray(song.downloadUrl)
        ? song.downloadUrl[song.downloadUrl.length - 1]?.url || null
        : song.downloadUrl || null
    })).filter(s => s.name && s.streamUrl);
  } catch (error) {
    console.warn("JioSaavn search API failed, falling back to local catalog search:", error.message);
    const catalog = getCatalog();
    const q = query.toLowerCase();
    return catalog.filter(song => 
      (song.name && song.name.toLowerCase().includes(q)) ||
      (song.album && song.album.toLowerCase().includes(q)) ||
      (song.artists && song.artists.some(a => a.toLowerCase().includes(q)))
    );
  }
}

module.exports = {
  getRadioSongs,
  getCatalogStatus,
  searchTracks
};
