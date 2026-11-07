const fs = require("fs");
const path = require("path");
const CryptoJS = require("crypto-js");
const axios = require("axios");

const DATA_DIR = path.join(__dirname, "..", "data");
const SUFI_CATALOG_PATH = path.join(DATA_DIR, "sufiSongs.json");
const SUFI_METADATA_PATH = path.join(DATA_DIR, "sufiMetadata.json");

// Filtr India Sufi Love Spotify Playlist
const SPOTIFY_PLAYLIST_ID = "7adqaCwE1HEsVoJum9y3qB";
const SPOTIFY_EMBED_URL = `https://open.spotify.com/embed/playlist/${SPOTIFY_PLAYLIST_ID}`;

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
      album: item.more_info?.album || "",
      image: image || "https://retroraag.in/images/retroraag-tab-icon-v9.png",
      streamUrl,
      durationMs: Number(item.more_info?.duration || 240) * 1000,
      year: Number(item.year || 2020)
    };
  } catch (err) {
    return null;
  }
}

async function fetchSufiLoveSpotifyTracks() {
  console.log("[SufiLove] Scraping Filtr India Sufi Love playlist from Spotify...");
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

  console.log(`[SufiLove] Found ${trackList.length} tracks in Spotify Sufi Love playlist.`);
  return trackList.map((t, idx) => ({
    rank: idx + 1,
    title: t.title,
    artist: t.subtitle,
    durationMs: t.duration || 240000
  }));
}

async function updateSufiCatalog() {
  console.log("[SufiLove] Starting Sufi Love catalog update...");
  try {
    const spotifyTracks = await fetchSufiLoveSpotifyTracks();
    if (!spotifyTracks || spotifyTracks.length === 0) {
      console.warn("[SufiLove] No tracks retrieved; aborting update to protect existing catalog.");
      return false;
    }

    // Smart Diff Check: If playlist tracks have not changed, skip heavy audio re-resolution
    const existing = getSufiCatalog();
    const existingTitles = existing.map((s) => s.name).join("||");
    const newTitles = spotifyTracks.map((s) => s.title).join("||");

    if (existing.length > 0 && existingTitles === newTitles) {
      console.log("[SufiLove] Playlist tracks on Spotify have not changed. Catalog is already up to date.");
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

    for (let i = 0; i < spotifyTracks.length; i++) {
      const entry = spotifyTracks[i];
      const primaryArtist = entry.artist.split(",")[0].trim();
      const query = `${entry.title} ${primaryArtist}`;

      let match = await searchDirectJioSaavn(query);
      if (!match) {
        match = await searchDirectJioSaavn(entry.title);
      }

      if (match && match.streamUrl) {
        resolvedSongs.push({
          id: `sufi_${entry.rank}`,
          name: entry.title,
          artists: entry.artist.split(",").map((a) => a.trim()),
          album: match.album || "Sufi Love",
          image: match.image || "https://retroraag.in/images/retroraag-tab-icon-v9.png",
          durationMs: match.durationMs || entry.durationMs,
          streamUrl: match.streamUrl,
          year: match.year || 2020,
          language: "hindi",
          sourceLists: ["sufi-love-filtr"],
          rank: entry.rank,
          lastUpdated: lastUpdatedString
        });
      }

      await new Promise((r) => setTimeout(r, 100));
    }

    console.log(`[SufiLove] Resolved ${resolvedSongs.length}/${spotifyTracks.length} playable tracks.`);

    if (resolvedSongs.length > 0) {
      fs.writeFileSync(SUFI_CATALOG_PATH, JSON.stringify(resolvedSongs, null, 2), "utf8");

      const metadata = {
        lastUpdated: lastUpdatedString,
        timestamp: Date.now(),
        trackCount: resolvedSongs.length,
        playlist: "Sufi Love (Curated by Filtr / Sony Music)",
        spotifyUrl: `https://open.spotify.com/playlist/${SPOTIFY_PLAYLIST_ID}`
      };
      fs.writeFileSync(SUFI_METADATA_PATH, JSON.stringify(metadata, null, 2), "utf8");

      console.log(`[SufiLove] Catalog saved successfully with ${resolvedSongs.length} tracks.`);
      return true;
    } else {
      console.warn("[SufiLove] 0 playable tracks resolved, retaining existing catalog.");
      return false;
    }
  } catch (err) {
    console.error("[SufiLove] Failed to update Sufi Love catalog:", err.message);
    return false;
  }
}

function getSufiMetadata() {
  try {
    if (fs.existsSync(SUFI_METADATA_PATH)) {
      return JSON.parse(fs.readFileSync(SUFI_METADATA_PATH, "utf8"));
    }
  } catch (e) {}
  return null;
}

function getSufiCatalog() {
  try {
    if (fs.existsSync(SUFI_CATALOG_PATH)) {
      return JSON.parse(fs.readFileSync(SUFI_CATALOG_PATH, "utf8"));
    }
  } catch (e) {}
  return [];
}

module.exports = {
  updateSufiCatalog,
  getSufiCatalog,
  getSufiMetadata
};

