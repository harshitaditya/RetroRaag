const fs = require("fs");
const path = require("path");
const CryptoJS = require("crypto-js");
const axios = require("axios");

const DATA_DIR = path.join(__dirname, "..", "data");
const DIWALI_CATALOG_PATH = path.join(DATA_DIR, "diwaliSongs.json");
const DIWALI_METADATA_PATH = path.join(DATA_DIR, "diwaliMetadata.json");

// "Diwali - A Celebration" Spotify Album
const SPOTIFY_ALBUM_ID = "6aiidEnMrJmhP2so5NXuSS";
const SPOTIFY_EMBED_URL = `https://open.spotify.com/embed/album/${SPOTIFY_ALBUM_ID}`;

// Additional iconic Diwali Puja essentials to make the prayer sangrah complete
const ESSENTIAL_DIWALI_PRAYERS = [
  { title: "Shree Hanuman Chalisa", artist: "Hariharan", query: "Shree Hanuman Chalisa Hariharan Gulshan Kumar" },
  { title: "Sukhkarta Dukhharta", artist: "Anuradha Paudwal", query: "Sukhkarta Dukhharta Anuradha Paudwal" },
  { title: "Shri Ramchandra Kripalu Bhajman", artist: "Anuradha Paudwal", query: "Shri Ramchandra Kripalu Bhajman Anuradha Paudwal" },
  { title: "MahaLakshmi Ashtakam", artist: "Anuradha Paudwal", query: "Mahalakshmi Ashtakam Anuradha Paudwal" },
  { title: "Laxmi Chalisa", artist: "Anuradha Paudwal", query: "Lakshmi Chalisa Anuradha Paudwal" },
  { title: "Aarti Kunj Bihari Ki", artist: "Anuradha Paudwal", query: "Aarti Kunj Bihari Ki Anuradha Paudwal" },
  { title: "Jai Ambe Gauri", artist: "Anuradha Paudwal", query: "Jai Ambe Gauri Anuradha Paudwal" }
];

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function decryptMediaUrl(encryptedUrl) {
  try {
    const key = CryptoJS.enc.Utf8.parse("38346591");
    const decrypted = CryptoJS.DES.decrypt(
      { ciphertext: CryptoJS.enc.Base64.parse(encryptedUrl) },
      key,
      {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.Pkcs7
      }
    );
    const decryptedStr = decrypted.toString(CryptoJS.enc.Utf8);
    return decryptedStr
      .replace(/_[0-9]+\.mp4$/, "_320.mp4")
      .replace(/_[0-9]+\.m4a$/, "_320.mp4");
  } catch (err) {
    return "";
  }
}

async function searchDirectJioSaavn(query) {
  try {
    const url = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&q=${encodeURIComponent(query)}`;
    const res = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*"
      },
      timeout: 10000
    });

    const item = res.data?.results?.[0];
    if (!item || !item.more_info?.encrypted_media_url) return null;

    const streamUrl = decryptMediaUrl(item.more_info.encrypted_media_url);
    if (!streamUrl) return null;

    const image = (item.image || "")
      .replace("-150x150.", "-500x500.")
      .replace("-50x50.", "-500x500.");

    const rawTitle = item.title
      ? item.title.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, "&")
      : "";

    return {
      name: rawTitle,
      album: item.more_info?.album || "Diwali Puja & Aarti",
      image: image || "https://retroraag.in/images/retroraag-tab-icon-v9.png",
      streamUrl,
      durationMs: Number(item.more_info?.duration || 240) * 1000,
      year: Number(item.year || 2024)
    };
  } catch (err) {
    return null;
  }
}

async function fetchDiwaliSpotifyTracks() {
  console.log("[DiwaliPuja] Scraping Diwali - A Celebration album from Spotify...");
  const res = await axios.get(SPOTIFY_EMBED_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    },
    timeout: 15000
  });

  const nextData = res.data.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!nextData) {
    throw new Error("Could not parse Spotify __NEXT_DATA__ from embed page");
  }

  const json = JSON.parse(nextData[1]);
  const entity = json.props?.pageProps?.state?.data?.entity;
  const trackList = entity?.trackList || [];

  console.log(`[DiwaliPuja] Found ${trackList.length} tracks in Spotify album.`);
  const albumTracks = trackList.map((t, idx) => ({
    rank: idx + 1,
    title: t.title,
    artist: t.subtitle,
    durationMs: t.duration || 240000
  }));

  // Append essential Diwali prayers
  const totalTracks = [...albumTracks];
  let curRank = albumTracks.length + 1;
  for (const extra of ESSENTIAL_DIWALI_PRAYERS) {
    totalTracks.push({
      rank: curRank++,
      title: extra.title,
      artist: extra.artist,
      query: extra.query,
      durationMs: 300000
    });
  }

  return totalTracks;
}

async function updateDiwaliCatalog() {
  console.log("[DiwaliPuja] Starting Diwali Puja catalog update...");
  try {
    const allTracks = await fetchDiwaliSpotifyTracks();
    if (!allTracks || allTracks.length === 0) {
      console.warn("[DiwaliPuja] No tracks retrieved; aborting update to protect existing catalog.");
      return false;
    }

    // Smart Diff Check
    const existing = getDiwaliCatalog();
    const existingTitles = existing.map((s) => s.name).join("||");
    const newTitles = allTracks.map((s) => s.title).join("||");

    if (existing.length > 0 && existingTitles === newTitles) {
      console.log("[DiwaliPuja] Tracks have not changed. Catalog is already up to date.");
      return true;
    }

    const resolvedSongs = [];
    const now = new Date();
    const dateFormatted = now.toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      year: "numeric"
    });
    const timeFormatted = now.toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });
    const lastUpdatedString = `${dateFormatted} at ${timeFormatted} IST`;

    for (let i = 0; i < allTracks.length; i++) {
      const entry = allTracks[i];
      let searchQuery = entry.query;

      if (!searchQuery) {
        if (entry.title.includes("Gokul Godhan")) {
          searchQuery = "Gokul Godhan Poojiye Govardhan Pooja";
        } else if (entry.title.includes("Jai Lakshmiramana")) {
          searchQuery = "Jai Lakshmiramana Satyanarayan Aarti";
        } else if (entry.title.includes("Deep Maalika")) {
          searchQuery = "Dekho In Deepan Ki Sundarayi Deep Maalika";
        } else {
          const primaryArtist = (entry.artist || "").split(",")[0].trim();
          searchQuery = `${entry.title} ${primaryArtist}`;
        }
      }

      let match = await searchDirectJioSaavn(searchQuery);
      if (!match) {
        match = await searchDirectJioSaavn(entry.title);
      }

      if (match && match.streamUrl) {
        resolvedSongs.push({
          id: `diwali_${entry.rank}`,
          name: entry.title,
          artists: (entry.artist || "Devotional").split(",").map((a) => a.trim()),
          album: match.album || "Diwali Puja & Aarti",
          image: match.image || "https://retroraag.in/images/retroraag-tab-icon-v9.png",
          durationMs: match.durationMs || entry.durationMs,
          streamUrl: match.streamUrl,
          year: match.year || 2024,
          language: "hindi",
          sourceLists: ["diwali-puja-celebration"],
          rank: entry.rank,
          lastUpdated: lastUpdatedString
        });
      }

      await new Promise((r) => setTimeout(r, 100));
    }

    console.log(`[DiwaliPuja] Resolved ${resolvedSongs.length}/${allTracks.length} playable tracks.`);

    if (resolvedSongs.length > 0) {
      fs.writeFileSync(DIWALI_CATALOG_PATH, JSON.stringify(resolvedSongs, null, 2), "utf8");

      const metadata = {
        lastUpdated: lastUpdatedString,
        lastUpdatedDate: dateFormatted,
        lastUpdatedTime: timeFormatted,
        lastUpdatedFull: lastUpdatedString,
        timestamp: Date.now(),
        trackCount: resolvedSongs.length,
        count: resolvedSongs.length,
        success: true,
        album: "Diwali - A Celebration (Festival Puja, Aartis & Bhajans)",
        spotifyUrl: `https://open.spotify.com/album/${SPOTIFY_ALBUM_ID}`
      };
      fs.writeFileSync(DIWALI_METADATA_PATH, JSON.stringify(metadata, null, 2), "utf8");

      console.log(`[DiwaliPuja] Catalog saved successfully with ${resolvedSongs.length} tracks.`);
      return true;
    } else {
      console.warn("[DiwaliPuja] 0 playable tracks resolved, retaining existing catalog.");
      return false;
    }
  } catch (err) {
    console.error("[DiwaliPuja] Failed to update Diwali catalog:", err.message);
    return false;
  }
}

function getDiwaliMetadata() {
  try {
    if (fs.existsSync(DIWALI_METADATA_PATH)) {
      return JSON.parse(fs.readFileSync(DIWALI_METADATA_PATH, "utf8"));
    }
  } catch (e) {}
  return null;
}

function getDiwaliCatalog() {
  try {
    if (fs.existsSync(DIWALI_CATALOG_PATH)) {
      return JSON.parse(fs.readFileSync(DIWALI_CATALOG_PATH, "utf8"));
    }
  } catch (e) {}
  return [];
}

module.exports = {
  updateDiwaliCatalog,
  getDiwaliCatalog,
  getDiwaliMetadata
};
