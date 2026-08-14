require("dotenv").config();

const fs = require("fs");
const path = require("path");
const axios = require("axios");

const DATA_DIR = path.join(__dirname, "..", "data");

const SONGS_PATH = path.join(
  DATA_DIR,
  "songs.json"
);

const CACHE_PATH = path.join(
  DATA_DIR,
  "catalogBuildCache.json"
);

// =====================================================
// JIOSAAVN CONFIG
// =====================================================

const JIOSAAVN_BASE_URL =
  process.env.JIOSAAVN_API_BASE_URL ||
  "https://saavn.sumit.co/api";

const SEARCH_LIMIT = Math.max(
  10,
  Math.min(
    Number(process.env.CATALOG_SEARCH_LIMIT || 30),
    50
  )
);

const REQUEST_TIMEOUT_MS = Number(
  process.env.CATALOG_REQUEST_TIMEOUT_MS || 25000
);

const BETWEEN_SEARCHES_MS = Number(
  process.env.CATALOG_SEARCH_DELAY_MS || 2500
);

const MAX_RETRIES = Number(
  process.env.CATALOG_MAX_RETRIES || 5
);

const RETRY_BASE_MS = Number(
  process.env.CATALOG_RETRY_BASE_MS || 15000
);

// =====================================================
// USER SOURCE LINKS
// =====================================================

const SPOTIFY_PLAYLIST_ID =
  "213I5nK2GxrRSIBJZh87fO";

const SPOTIFY_EMBED_URL =
  `https://open.spotify.com/embed/playlist/${SPOTIFY_PLAYLIST_ID}`;

const HINDITRACKS_URL =
  "https://www.hinditracks.in/90s-songs-list-top-100-romantic-hindi-songs";

const GAANA_SEOKEY =
  "dubaitrade-axgyh-bollywood-top-200-songs";

const GAANA_URL =
  `https://gaana.com/playlist/${GAANA_SEOKEY}`;

const GAANA_API_URL =
  `https://gaana.com/apiv2?type=playlistDetail&seokey=${GAANA_SEOKEY}`;

const BROWSER_HEADERS = {
  Accept:
    "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "Accept-Language":
    "en-IN,en;q=0.9,hi;q=0.8",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/151.0.0.0 Safari/537.36"
};

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// =====================================================
// HTML HELPERS
// =====================================================

function decodeHtml(value = "") {
  return String(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(
      /&#(\d+);/g,
      (_, code) => String.fromCharCode(Number(code))
    )
    .replace(
      /&#x([0-9a-f]+);/gi,
      (_, code) => String.fromCharCode(parseInt(code, 16))
    );
}

function stripHtml(value = "") {
  return decodeHtml(
    String(value)
      .replace(
        /<script\b[^>]*>[\s\S]*?<\/script>/gi,
        " "
      )
      .replace(
        /<style\b[^>]*>[\s\S]*?<\/style>/gi,
        " "
      )
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

// =====================================================
// TEXT NORMALIZATION
// =====================================================

function normalizeText(value = "") {
  return decodeHtml(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\bpyaar\b/g, "pyar")
    .replace(/\bpyaara\b/g, "pyara")
    .replace(/\bpyaari\b/g, "pyari")
    .replace(/\byeh\b/g, "ye")
    .replace(/\bmein\b/g, "me")
    .replace(/\bhoon\b/g, "hun")
    .replace(/\bhain\b/g, "hai")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTitleForSearch(value = "") {
  return decodeHtml(value)
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s*\(\s*from\b[^)]*\)/gi, " ")
    .replace(/\s*\(\s*from\b.*$/gi, " ")
    .replace(
      /\s*\[[^\]]*\b(from|version|jhankar|remix|mix|edit|live|sad|reprise|acoustic)\b[^\]]*\]/gi,
      " "
    )
    .replace(
      /\s*\([^)]*\b(male|female|version|jhankar|remix|mix|edit|live|sad|reprise|acoustic)\b[^)]*\)/gi,
      " "
    )
    .replace(/\s+-\s+from\s+.*$/gi, " ")
    .replace(/\s+-\s+(male|female)\s+version.*$/gi, " ")
    .replace(/\s+-\s+[^-]*\bversion\b.*$/gi, " ")
    .replace(/\s+-\s+jhankar.*$/gi, " ")
    .replace(
      /\s+-\s+(remix|mix|edit|live|sad|reprise|acoustic).*$/gi,
      " "
    )
    .replace(/\s+-\s+part\s*\d+.*$/gi, " ")
    .replace(/\s+\((male|female|duet)\)\s*$/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedTitle(value = "") {
  return normalizeText(cleanTitleForSearch(value));
}

function titleVariants(value = "") {
  const raw = stripHtml(value);
  const cleaned = cleanTitleForSearch(raw);
  const variants = new Set();

  if (raw) variants.add(raw);
  if (cleaned) variants.add(cleaned);

  for (const candidate of [raw, cleaned]) {
    if (!candidate) continue;

    const parts = candidate
      .split(/\s+[–—-]\s+/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length === 2) {
      if (parts[0].length >= 4) {
        variants.add(parts[0]);
      }

      if (
        parts[1].length >= 4 &&
        !/^(from|male|female|jhankar|version)/i.test(parts[1])
      ) {
        variants.add(parts[1]);
      }
    }
  }

  return [...variants];
}

// =====================================================
// TITLE SIMILARITY
// =====================================================

function tokenSet(value = "") {
  return new Set(
    normalizedTitle(value)
      .split(" ")
      .filter(Boolean)
  );
}

function tokenSimilarity(a, b) {
  const left = tokenSet(a);
  const right = tokenSet(b);

  if (!left.size || !right.size) {
    return 0;
  }

  let common = 0;

  for (const token of left) {
    if (right.has(token)) {
      common += 1;
    }
  }

  return common / Math.max(left.size, right.size);
}

function titleSimilarity(a, b) {
  const left = normalizedTitle(a);
  const right = normalizedTitle(b);

  if (!left || !right) return 0;
  if (left === right) return 1;

  if (
    left.includes(right) ||
    right.includes(left)
  ) {
    const shorter = Math.min(left.length, right.length);
    const longer = Math.max(left.length, right.length);

    return 0.88 + 0.1 * (shorter / longer);
  }

  return tokenSimilarity(left, right);
}

function bestTitleSimilarity(
  sourceTitle,
  candidateTitle
) {
  let best = 0;

  for (const sourceVariant of titleVariants(sourceTitle)) {
    for (const candidateVariant of titleVariants(candidateTitle)) {
      best = Math.max(
        best,
        titleSimilarity(sourceVariant, candidateVariant)
      );
    }
  }

  return best;
}

// =====================================================
// SOURCE DUPLICATE REMOVAL
// FIXED: supports both entry.source and entry.sources
// =====================================================

function uniqueSourceEntries(entries = []) {
  const map = new Map();

  for (const entry of entries) {
    const title = stripHtml(
      entry?.title || ""
    );

    const key = normalizedTitle(
      title
    );

    if (!title || !key) {
      continue;
    }

    let sources = [];

    if (Array.isArray(entry?.sources)) {
      sources = entry.sources
        .map((source) =>
          String(source)
            .toLowerCase()
            .trim()
        )
        .filter(Boolean);
    } else if (entry?.source) {
      sources = [
        String(entry.source)
          .toLowerCase()
          .trim()
      ];
    }

    if (!sources.length) {
      continue;
    }

    if (!map.has(key)) {
      map.set(key, {
        title,
        sources: [...new Set(sources)]
      });

      continue;
    }

    const existing = map.get(key);

    existing.sources = [
      ...new Set([
        ...existing.sources,
        ...sources
      ])
    ];
  }

  return [...map.values()];
}

// =====================================================
// GENERIC PAGE FETCH
// =====================================================

async function fetchText(url) {
  const response = await axios.get(
    url,
    {
      timeout: REQUEST_TIMEOUT_MS,
      headers: BROWSER_HEADERS,
      responseType: "text"
    }
  );

  return String(response.data || "");
}

// =====================================================
// SPOTIFY
// =====================================================

function getSpotifyTitles(html) {
  const entries = [];

  for (
    const match of String(html).matchAll(
      /<h3\b[^>]*>([\s\S]*?)<\/h3>/gi
    )
  ) {
    const title = stripHtml(match[1]);

    if (!title) continue;

    if (
      normalizedTitle(title) ===
      normalizedTitle("My Top 100 90s Bollywood")
    ) {
      continue;
    }

    entries.push({
      title,
      source: "spotify"
    });
  }

  return uniqueSourceEntries(entries);
}

async function fetchSpotify() {
  console.log(
    "Fetching Spotify playlist..."
  );

  const html = await fetchText(
    SPOTIFY_EMBED_URL
  );

  const entries = getSpotifyTitles(
    html
  );

  if (entries.length < 50) {
    throw new Error(
      `Spotify parser found only ${entries.length} songs; refusing partial build.`
    );
  }

  console.log(
    `Spotify songs: ${entries.length}`
  );

  return entries;
}

// =====================================================
// HINDITRACKS
// =====================================================

function getHindiTracksTitles(html) {
  const entries = [];

  for (
    const tableMatch of String(html).matchAll(
      /<table\b[^>]*>([\s\S]*?)<\/table>/gi
    )
  ) {
    const table = tableMatch[1];

    for (
      const rowMatch of table.matchAll(
        /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
      )
    ) {
      const cells = [
        ...rowMatch[1].matchAll(
          /<td\b[^>]*>([\s\S]*?)<\/td>/gi
        )
      ];

      if (cells.length < 2) {
        continue;
      }

      const serialText = stripHtml(
        cells[0][1]
      );

      if (
        !/^\d{1,3}[.)]?$/i.test(serialText)
      ) {
        continue;
      }

      const songCell = cells[1][1];

      const firstAnchor = songCell.match(
        /<a\b[^>]*>([\s\S]*?)<\/a>/i
      );

      const title = firstAnchor
        ? stripHtml(firstAnchor[1])
        : stripHtml(songCell);

      if (title) {
        entries.push({
          title,
          source: "hinditracks"
        });
      }
    }
  }

  return uniqueSourceEntries(entries);
}

async function fetchHindiTracks() {
  console.log(
    "Fetching HindiTracks list..."
  );

  const html = await fetchText(
    HINDITRACKS_URL
  );

  const entries = getHindiTracksTitles(
    html
  );

  if (entries.length < 70) {
    throw new Error(
      `HindiTracks parser found only ${entries.length} songs; refusing partial build.`
    );
  }

  console.log(
    `HindiTracks songs: ${entries.length}`
  );

  return entries;
}

// =====================================================
// GAANA
// =====================================================

function collectGaanaTracks(
  value,
  output,
  seen = new Set()
) {
  if (
    !value ||
    typeof value !== "object" ||
    seen.has(value)
  ) {
    return;
  }

  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      collectGaanaTracks(
        item,
        output,
        seen
      );
    }

    return;
  }

  const title =
    value.track_title ||
    value.song_name ||
    value.trackTitle ||
    value.songName ||
    null;

  const trackMarker =
    value.track_id ||
    value.song_id ||
    value.trackid ||
    value.songid ||
    value.trackId ||
    value.songId ||
    value.duration ||
    value.track_duration;

  if (
    typeof title === "string" &&
    trackMarker
  ) {
    output.push({
      title,
      source: "gaana"
    });
  }

  for (const child of Object.values(value)) {
    collectGaanaTracks(
      child,
      output,
      seen
    );
  }
}

async function fetchGaana() {
  console.log(
    "Fetching Gaana playlist..."
  );

  const entries = [];

  try {
    const response = await axios.get(
      GAANA_API_URL,
      {
        timeout: REQUEST_TIMEOUT_MS,

        headers: {
          ...BROWSER_HEADERS,
          Accept:
            "application/json,text/plain,*/*"
        }
      }
    );

    let payload = response.data;

    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch {
        payload = null;
      }
    }

    if (payload) {
      collectGaanaTracks(
        payload,
        entries
      );
    }
  } catch (error) {
    console.warn(
      `Gaana API request failed: ${
        error.response?.status ||
        error.message
      }`
    );
  }

  if (entries.length < 20) {
    const html = await fetchText(
      GAANA_URL
    );

    for (
      const match of html.matchAll(
        /"(?:track_title|song_name)"\s*:\s*"((?:\\.|[^"\\])+)"/gi
      )
    ) {
      try {
        entries.push({
          title: JSON.parse(
            `"${match[1]}"`
          ),
          source: "gaana"
        });
      } catch {
        entries.push({
          title: decodeHtml(match[1]),
          source: "gaana"
        });
      }
    }
  }

  const unique = uniqueSourceEntries(
    entries
  );

  if (unique.length < 20) {
    throw new Error(
      `Gaana parser found only ${unique.length} songs; refusing partial build.`
    );
  }

  console.log(
    `Gaana songs: ${unique.length}`
  );

  return unique;
}

// =====================================================
// URL PICKER
// =====================================================

function pickBestUrl(
  items = [],
  preferredQualities = []
) {
  if (
    !Array.isArray(items) ||
    !items.length
  ) {
    return null;
  }

  for (const quality of preferredQualities) {
    const match = items.find(
      (item) =>
        item?.quality === quality &&
        item?.url
    );

    if (match) {
      return match.url;
    }
  }

  return (
    items.find((item) => item?.url)
      ?.url ||
    null
  );
}

// =====================================================
// JIOSAAVN SONG FORMAT
// =====================================================

function normalizeJioSaavnSong(
  rawSong
) {
  if (!rawSong) {
    return null;
  }

  const artists = Array.isArray(
    rawSong.artists?.primary
  )
    ? rawSong.artists.primary
        .map((artist) => artist?.name)
        .filter(Boolean)
    : Array.isArray(rawSong.artists)
    ? rawSong.artists
        .map(
          (artist) =>
            artist?.name ||
            artist
        )
        .filter(Boolean)
    : [];

  const durationSeconds = Number(
    rawSong.duration
  );

  const year = Number(
    rawSong.year
  );

  return {
    id:
      rawSong.id ||
      null,

    name:
      rawSong.name ||
      rawSong.title ||
      null,

    artists,

    album:
      rawSong.album?.name ||
      rawSong.album?.title ||
      rawSong.album ||
      null,

    image:
      pickBestUrl(
        rawSong.image,
        [
          "500x500",
          "150x150",
          "50x50"
        ]
      ),

    durationMs:
      Number.isFinite(
        durationSeconds
      )
        ? durationSeconds *
          1000
        : null,

    streamUrl:
      pickBestUrl(
        rawSong.downloadUrl,
        [
          "320kbps",
          "160kbps",
          "96kbps"
        ]
      ),

    year:
      Number.isFinite(year)
        ? year
        : null,

    language:
      rawSong.language ||
      null
  };
}

function isPlayableSong(song) {
  return Boolean(
    song &&
    song.name &&
    song.streamUrl
  );
}

// =====================================================
// EXISTING LOCAL SONGS.JSON
// =====================================================

function loadLocalCatalog() {
  if (
    !fs.existsSync(
      SONGS_PATH
    )
  ) {
    return [];
  }

  try {
    const parsed = JSON.parse(
      fs.readFileSync(
        SONGS_PATH,
        "utf8"
      )
    );

    return Array.isArray(parsed)
      ? parsed.filter(
          isPlayableSong
        )
      : [];
  } catch (error) {
    throw new Error(
      `Could not read existing songs.json: ${error.message}`
    );
  }
}

// =====================================================
// LOCAL INDEX + MATCH
// =====================================================

function buildExactTitleIndex(
  catalog
) {
  const index = new Map();

  for (const song of catalog) {
    for (
      const variant of titleVariants(
        song.name
      )
    ) {
      const key = normalizedTitle(
        variant
      );

      if (!key) continue;

      if (!index.has(key)) {
        index.set(key, []);
      }

      index.get(key).push(song);
    }
  }

  return index;
}

function chooseBestFromCandidates(
  sourceTitle,
  candidates = []
) {
  let bestSong = null;
  let bestScore = 0;

  for (const song of candidates) {
    const score = bestTitleSimilarity(
      sourceTitle,
      song.name
    );

    if (score > bestScore) {
      bestSong = song;
      bestScore = score;
    }
  }

  return bestSong
    ? {
        song: bestSong,
        score: bestScore
      }
    : null;
}

function findBestLocalMatch(
  sourceEntry,
  catalog,
  exactIndex
) {
  for (
    const variant of titleVariants(
      sourceEntry.title
    )
  ) {
    const exact = exactIndex.get(
      normalizedTitle(variant)
    );

    if (exact?.length) {
      const chosen =
        chooseBestFromCandidates(
          sourceEntry.title,
          exact
        );

      if (chosen) {
        return chosen;
      }
    }
  }

  let bestSong = null;
  let bestScore = 0;

  for (const song of catalog) {
    const score = bestTitleSimilarity(
      sourceEntry.title,
      song.name
    );

    if (score > bestScore) {
      bestSong = song;
      bestScore = score;
    }
  }

  if (
    !bestSong ||
    bestScore < 0.76
  ) {
    return null;
  }

  return {
    song: bestSong,
    score: bestScore
  };
}

// =====================================================
// CACHE
// =====================================================

function loadCache() {
  if (
    !fs.existsSync(
      CACHE_PATH
    )
  ) {
    return {
      version: 1,
      matches: {}
    };
  }

  try {
    const parsed = JSON.parse(
      fs.readFileSync(
        CACHE_PATH,
        "utf8"
      )
    );

    if (
      !parsed ||
      typeof parsed !== "object"
    ) {
      throw new Error(
        "invalid cache"
      );
    }

    if (
      !parsed.matches ||
      typeof parsed.matches !== "object"
    ) {
      parsed.matches = {};
    }

    return parsed;
  } catch {
    return {
      version: 1,
      matches: {}
    };
  }
}

function saveCache(cache) {
  fs.mkdirSync(
    DATA_DIR,
    {
      recursive: true
    }
  );

  fs.writeFileSync(
    CACHE_PATH,
    `${JSON.stringify(
      cache,
      null,
      2
    )}\n`,
    "utf8"
  );
}

// =====================================================
// RATE-LIMIT SAFE JIOSAAVN SEARCH
// =====================================================

async function searchJioSaavn(
  query
) {
  let lastError = null;

  for (
    let attempt = 0;
    attempt <= MAX_RETRIES;
    attempt += 1
  ) {
    try {
      const response = await axios.get(
        `${JIOSAAVN_BASE_URL}/search/songs`,
        {
          params: {
            query,
            page: 0,
            limit: SEARCH_LIMIT
          },

          timeout: REQUEST_TIMEOUT_MS,

          headers: {
            Accept:
              "application/json",

            "User-Agent":
              "RetroRaag-Catalog-Builder/3.1"
          }
        }
      );

      await sleep(
        BETWEEN_SEARCHES_MS
      );

      return (
        response.data?.data
          ?.results ||
        []
      );
    } catch (error) {
      lastError = error;

      const status =
        error.response?.status;

      if (
        status === 429 &&
        attempt < MAX_RETRIES
      ) {
        const retryAfterHeader =
          Number(
            error.response?.headers?.[
              "retry-after"
            ] || 0
          );

        const waitMs =
          retryAfterHeader > 0
            ? retryAfterHeader *
              1000
            : RETRY_BASE_MS *
              Math.pow(
                2,
                attempt
              );

        console.warn(
          `429 rate limit. Waiting ${Math.ceil(
            waitMs / 1000
          )}s before retry ${
            attempt + 1
          }/${MAX_RETRIES}...`
        );

        await sleep(waitMs);
        continue;
      }

      if (
        (
          !status ||
          status >= 500
        ) &&
        attempt < MAX_RETRIES
      ) {
        const waitMs =
          Math.min(
            RETRY_BASE_MS *
              Math.pow(
                2,
                attempt
              ),
            60000
          );

        console.warn(
          `JioSaavn request failed (${
            status ||
            error.code ||
            "network"
          }). Waiting ${Math.ceil(
            waitMs / 1000
          )}s...`
        );

        await sleep(waitMs);
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

// =====================================================
// JIOSAAVN FALLBACK MATCH
// =====================================================

async function findJioSaavnFallback(
  sourceEntry
) {
  const queries = titleVariants(
    sourceEntry.title
  )
    .map((value) =>
      cleanTitleForSearch(value)
    )
    .filter(Boolean);

  let bestSong = null;
  let bestScore = 0;

  const seenQueries =
    new Set();

  const seenIds =
    new Set();

  for (const query of queries) {
    const queryKey =
      normalizeText(query);

    if (
      !queryKey ||
      seenQueries.has(queryKey)
    ) {
      continue;
    }

    seenQueries.add(queryKey);

    let results;

    try {
      results =
        await searchJioSaavn(
          query
        );
    } catch (error) {
      console.warn(
        `Search failed for "${sourceEntry.title}": ${
          error.response?.status ||
          error.message
        }`
      );

      continue;
    }

    for (const rawSong of results) {
      if (
        !rawSong?.id ||
        seenIds.has(
          rawSong.id
        )
      ) {
        continue;
      }

      seenIds.add(rawSong.id);

      const song =
        normalizeJioSaavnSong(
          rawSong
        );

      if (
        !isPlayableSong(
          song
        )
      ) {
        continue;
      }

      const score =
        bestTitleSimilarity(
          sourceEntry.title,
          song.name
        );

      if (score > bestScore) {
        bestSong = song;
        bestScore = score;
      }
    }

    if (bestScore >= 0.96) {
      break;
    }
  }

  if (
    !bestSong ||
    bestScore < 0.74
  ) {
    return null;
  }

  return {
    song: bestSong,
    score: bestScore
  };
}

// =====================================================
// FINAL SONG MERGE
// =====================================================

function mergeFinalSong(
  finalMap,
  sourceEntry,
  matchedSong,
  score,
  matchMethod
) {
  const key =
    matchedSong.id ||
    `${normalizedTitle(
      matchedSong.name
    )}|${normalizeText(
      (
        matchedSong.artists ||
        []
      ).join(" ")
    )}`;

  if (
    !finalMap.has(key)
  ) {
    finalMap.set(
      key,
      {
        ...matchedSong,

        sourceLists: [
          ...new Set(
            sourceEntry.sources
          )
        ],

        sourceTitles: [
          sourceEntry.title
        ],

        matchScore:
          Number(
            score.toFixed(3)
          ),

        matchMethod
      }
    );

    return;
  }

  const existing =
    finalMap.get(key);

  existing.sourceLists = [
    ...new Set([
      ...(existing.sourceLists || []),
      ...sourceEntry.sources
    ])
  ];

  existing.sourceTitles = [
    ...new Set([
      ...(existing.sourceTitles || []),
      sourceEntry.title
    ])
  ];

  existing.matchScore =
    Math.max(
      existing.matchScore || 0,
      Number(
        score.toFixed(3)
      )
    );
}

// =====================================================
// MAIN
// =====================================================

async function main() {
  console.log(
    "\n========================================"
  );

  console.log(
    " RetroRaag - All Source Playlist Songs"
  );

  console.log(
    "========================================"
  );

  console.log(
    "Year filter: OFF"
  );

  console.log(
    "Language filter: OFF"
  );

  console.log(
    "Rule: only songs present in the 3 supplied source lists"
  );

  console.log(
    `JioSaavn fallback delay: ${BETWEEN_SEARCHES_MS}ms\n`
  );

  const localCatalog =
    loadLocalCatalog();

  const exactIndex =
    buildExactTitleIndex(
      localCatalog
    );

  const cache =
    loadCache();

  console.log(
    `Existing playable local catalog: ${localCatalog.length}`
  );

  console.log(
    `Cached fallback matches: ${
      Object.keys(
        cache.matches
      ).length
    }\n`
  );

  const [
    spotify,
    hindiTracks,
    gaana
  ] =
    await Promise.all([
      fetchSpotify(),
      fetchHindiTracks(),
      fetchGaana()
    ]);

  const sourceEntries =
    uniqueSourceEntries([
      ...spotify,
      ...hindiTracks,
      ...gaana
    ]);

  console.log(
    `\nUnique source titles: ${sourceEntries.length}`
  );

  console.log(
    "Matching locally first, then using slow JioSaavn fallback...\n"
  );

  const finalMap =
    new Map();

  const unmatched = [];

  let localMatches = 0;
  let cachedMatches = 0;
  let apiMatches = 0;

  for (
    let index = 0;
    index <
    sourceEntries.length;
    index += 1
  ) {
    const sourceEntry =
      sourceEntries[index];

    const prefix =
      `[${index + 1}/${sourceEntries.length}]`;

    const cacheKey =
      normalizedTitle(
        sourceEntry.title
      );

    const local =
      findBestLocalMatch(
        sourceEntry,
        localCatalog,
        exactIndex
      );

    if (local) {
      localMatches += 1;

      mergeFinalSong(
        finalMap,
        sourceEntry,
        local.song,
        local.score,
        "local"
      );

      console.log(
        `${prefix} LOCAL | ${sourceEntry.title} -> ${local.song.name} [${local.score.toFixed(
          2
        )}]`
      );

      continue;
    }

    const cached =
      cache.matches[
        cacheKey
      ];

    if (
      cached?.song &&
      isPlayableSong(
        cached.song
      )
    ) {
      cachedMatches += 1;

      mergeFinalSong(
        finalMap,
        sourceEntry,
        cached.song,
        Number(
          cached.score || 1
        ),
        "cache"
      );

      console.log(
        `${prefix} CACHE | ${sourceEntry.title} -> ${cached.song.name}`
      );

      continue;
    }

    console.log(
      `${prefix} API   | searching ${sourceEntry.title}`
    );

    const fallback =
      await findJioSaavnFallback(
        sourceEntry
      );

    if (!fallback) {
      unmatched.push(
        sourceEntry
      );

      console.log(
        `${prefix} MISS  | ${sourceEntry.title}`
      );

      continue;
    }

    apiMatches += 1;

    mergeFinalSong(
      finalMap,
      sourceEntry,
      fallback.song,
      fallback.score,
      "jiosaavn"
    );

    cache.matches[
      cacheKey
    ] = {
      sourceTitle:
        sourceEntry.title,

      song:
        fallback.song,

      score:
        Number(
          fallback.score.toFixed(
            3
          )
        ),

      savedAt:
        new Date().toISOString()
    };

    saveCache(cache);

    console.log(
      `${prefix} FOUND | ${sourceEntry.title} -> ${fallback.song.name} [${fallback.score.toFixed(
        2
      )}]`
    );
  }

  const finalSongs = [
    ...finalMap.values()
  ].sort(
    (a, b) =>
      String(
        a.name || ""
      ).localeCompare(
        String(
          b.name || ""
        )
      )
  );

  if (!finalSongs.length) {
    throw new Error(
      "No songs matched. songs.json was not changed."
    );
  }

  fs.writeFileSync(
    SONGS_PATH,
    `${JSON.stringify(
      finalSongs,
      null,
      2
    )}\n`,
    "utf8"
  );

  const sourceCounts = {};

  for (const song of finalSongs) {
    for (
      const source of
      song.sourceLists ||
      []
    ) {
      sourceCounts[source] =
        (
          sourceCounts[
            source
          ] || 0
        ) + 1;
    }
  }

  console.log(
    "\n========================================"
  );

  console.log(
    " CATALOG BUILD COMPLETE"
  );

  console.log(
    "========================================"
  );

  console.log(
    `Source titles: ${sourceEntries.length}`
  );

  console.log(
    `Matched source titles: ${
      sourceEntries.length -
      unmatched.length
    }`
  );

  console.log(
    `FINAL UNIQUE SONG COUNT: ${finalSongs.length}`
  );

  console.log(
    `Local matches: ${localMatches}`
  );

  console.log(
    `Cached matches: ${cachedMatches}`
  );

  console.log(
    `JioSaavn fallback matches: ${apiMatches}`
  );

  console.log(
    `Unmatched: ${unmatched.length}`
  );

  console.log(
    `Saved: ${SONGS_PATH}`
  );

  console.log(
    "\nSongs by source:"
  );

  console.table(
    sourceCounts
  );

  if (unmatched.length) {
    console.log(
      "\nStill unmatched source songs:"
    );

    for (const item of unmatched) {
      console.log(
        `- ${item.title}`
      );
    }

    console.log(
      "\nRun npm run catalog:build again later; successful API matches are cached."
    );
  }
}

main().catch(
  (error) => {
    console.error(
      "\nCatalog build failed:"
    );

    console.error(
      error.response?.data ||
      error.message
    );

    console.error(
      "\nExisting songs.json was not intentionally overwritten after this failure."
    );

    process.exitCode = 1;
  }
);