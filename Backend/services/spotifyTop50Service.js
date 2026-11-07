const fs = require("fs");
const path = require("path");
const axios = require("axios");
const CryptoJS = require("crypto-js");

const DATA_DIR = path.join(__dirname, "..", "data");
const SPOTIFY_CATALOG_PATH = path.join(DATA_DIR, "spotifySongs.json");
const SPOTIFY_METADATA_PATH = path.join(DATA_DIR, "spotifyMetadata.json");

// Ensure data directory exists
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

    return {
      streamUrl,
      image,
      album: item.more_info?.album,
      durationMs: Number(item.more_info?.duration || 210) * 1000,
      year: Number(item.year || new Date().getFullYear())
    };
  } catch {
    return null;
  }
}

// Clean string for music search
function cleanSearchTitle(title = "") {
  return String(title)
    .replace(/\(w\/.*?\)/gi, "")
    .replace(/\(From ".*?"\)/gi, "")
    .replace(/\[.*?\]/gi, "")
    .replace(/\|.*$/gi, "")
    .replace(/- Remix/gi, "")
    .trim();
}

/**
 * Scrape current Spotify Top 50 India from official daily chart
 */
async function fetchSpotifyTop50Chart() {
  console.log("[SpotifyTop50] Fetching daily Spotify India chart...");
  const res = await axios.get("https://kworb.net/spotify/country/in_daily.html", {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    },
    timeout: 15000
  });

  const html = res.data;
  const regex = /<td class="text mp"><div>(.*?)<\/div><\/td>/g;
  let match;
  let rank = 1;
  const chartSongs = [];

  while ((match = regex.exec(html)) !== null && rank <= 50) {
    const raw = match[1].replace(/<[^>]+>/g, "").trim();
    const parts = raw.split(" - ");
    const artist = parts[0] ? parts[0].trim() : "";
    const title = parts.slice(1).join(" - ").trim() || artist;

    chartSongs.push({
      rank,
      artist,
      title,
      raw
    });
    rank++;
  }

  console.log(`[SpotifyTop50] Found ${chartSongs.length} chart entries.`);
  return chartSongs;
}

/**
 * Match a chart song against the music streaming engine to get 320kbps MP4 link
 */
async function resolveAudioStream(chartEntry) {
  const primaryArtist = chartEntry.artist.split(",")[0].trim();
  const cleanTitle = cleanSearchTitle(chartEntry.title);

  // Queries to try in order of specificity
  const queries = [
    `${chartEntry.title} ${primaryArtist}`,
    `${cleanTitle} ${primaryArtist}`,
    chartEntry.title,
    cleanTitle
  ];

  for (const query of queries) {
    try {
      const url = `https://saavn.sumit.co/api/search/songs?query=${encodeURIComponent(query)}&limit=1`;
      const res = await axios.get(url, { timeout: 10000 });
      const song = res.data?.data?.results?.[0];

      if (song && Array.isArray(song.downloadUrl) && song.downloadUrl.length > 0) {
        // Find best stream quality (320kbps or highest)
        const bestAudio =
          song.downloadUrl.find((d) => d.quality === "320kbps") ||
          song.downloadUrl[song.downloadUrl.length - 1];

        // Find best image quality (500x500 or highest)
        const bestImage =
          song.image?.find((i) => i.quality === "500x500") ||
          song.image?.[song.image?.length - 1];

        const artistsList =
          Array.isArray(song.artists?.primary) && song.artists.primary.length > 0
            ? song.artists.primary.map((a) => a.name)
            : [chartEntry.artist || "Top Artist"];

        return {
          id: `spotify_${chartEntry.rank}`,
          rank: chartEntry.rank,
          name: chartEntry.title,
          artists: artistsList,
          album: song.album?.name || "Spotify Top 50 India",
          image: bestImage?.url || "https://retroraag.in/images/retroraag-tab-icon-v9.png",
          durationMs: Number(song.duration ? song.duration * 1000 : 210000),
          streamUrl: bestAudio?.url,
          year: Number(song.year || new Date().getFullYear()),
          language: song.language || "hindi",
          sourceLists: ["spotify-top-50-india"]
        };
      }
    } catch {
      // Try next query variant
    }
  }

  // Direct JioSaavn resolution fallback if public proxy is rate-limited
  for (const query of queries) {
    const directMatch = await searchDirectJioSaavn(query);
    if (directMatch && directMatch.streamUrl) {
      return {
        id: `spotify_${chartEntry.rank}`,
        rank: chartEntry.rank,
        name: chartEntry.title,
        artists: [chartEntry.artist || "Top Artist"],
        album: directMatch.album || "Spotify Top 50 India",
        image: directMatch.image || "https://retroraag.in/images/retroraag-tab-icon-v9.png",
        durationMs: directMatch.durationMs,
        streamUrl: directMatch.streamUrl,
        year: directMatch.year,
        language: "hindi",
        sourceLists: ["spotify-top-50-india"]
      };
    }
  }

  // Fallback placeholder if no stream found
  return null;
}

/**
 * Main routine: Fetch chart, resolve all 50 tracks, write to spotifySongs.json
 */
async function updateSpotifyCatalog() {
  try {
    const chart = await fetchSpotifyTop50Chart();
    if (chart.length === 0) {
      console.warn("[SpotifyTop50] Empty chart returned, keeping existing catalog.");
      return false;
    }

    const resolvedSongs = [];
    console.log("[SpotifyTop50] Resolving audio streams for Top 50 tracks...");

    for (const entry of chart) {
      const resolved = await resolveAudioStream(entry);
      if (resolved && resolved.streamUrl) {
        resolvedSongs.push(resolved);
      }
      // Small delay between requests to be gentle to the API
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    if (resolvedSongs.length > 0) {
      const now = new Date();
      const dateFormatted = now.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata"
      });

      const timeFormatted = now.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: "Asia/Kolkata"
      });

      const lastUpdatedFull = `${dateFormatted} at ${timeFormatted} IST`;

      const metadata = {
        lastUpdatedISO: now.toISOString(),
        lastUpdatedDate: dateFormatted,
        lastUpdatedTime: timeFormatted,
        lastUpdatedFull,
        count: resolvedSongs.length,
        success: true
      };

      const enrichedSongs = resolvedSongs.map((song) => ({
        ...song,
        lastUpdated: dateFormatted,
        lastUpdatedFull
      }));

      fs.writeFileSync(
        SPOTIFY_CATALOG_PATH,
        JSON.stringify(enrichedSongs, null, 2),
        "utf8"
      );

      fs.writeFileSync(
        SPOTIFY_METADATA_PATH,
        JSON.stringify(metadata, null, 2),
        "utf8"
      );

      console.log(
        `[SpotifyTop50] Successfully updated catalog with ${enrichedSongs.length} songs on ${lastUpdatedFull}`
      );
      return true;
    } else {
      console.warn("[SpotifyTop50] No audio streams resolved; keeping previous catalog.");
      return false;
    }
  } catch (err) {
    console.error("[SpotifyTop50] Error updating catalog:", err.message);
    return false;
  }
}

function getSpotifyMetadata() {
  if (fs.existsSync(SPOTIFY_METADATA_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(SPOTIFY_METADATA_PATH, "utf8"));
    } catch {
      return null;
    }
  }
  return null;
}

function getSpotifyCatalog() {
  if (fs.existsSync(SPOTIFY_CATALOG_PATH)) {
    try {
      const data = fs.readFileSync(SPOTIFY_CATALOG_PATH, "utf8");
      return JSON.parse(data);
    } catch {
      return [];
    }
  }
  return [];
}

module.exports = {
  updateSpotifyCatalog,
  getSpotifyCatalog,
  getSpotifyMetadata,
  SPOTIFY_CATALOG_PATH,
  SPOTIFY_METADATA_PATH
};

