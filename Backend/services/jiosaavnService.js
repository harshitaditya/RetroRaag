const fs = require("fs");
const path = require("path");

const CATALOG_PATH_90S =
  path.join(
    __dirname,
    "..",
    "data",
    "songs.json"
  );

const CATALOG_PATH_KISHORE =
  path.join(
    __dirname,
    "..",
    "data",
    "kishoreSongs.json"
  );

const stationStores = {
  "90s": {
    path: CATALOG_PATH_90S,
    cache: null,
    lastMtime: 0
  },
  "kishore": {
    path: CATALOG_PATH_KISHORE,
    cache: null,
    lastMtime: 0
  }
};

function normalizeText(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPlayableSong(song) {
  return Boolean(
    song &&
    song.name &&
    song.streamUrl
  );
}

function getStore(station = "90s") {
  const key = String(station || "").toLowerCase().trim();
  return key === "kishore" ? stationStores.kishore : stationStores["90s"];
}

function loadCatalog(station = "90s") {
  const store = getStore(station);

  if (!fs.existsSync(store.path)) {
    store.cache = [];
    return store.cache;
  }

  try {
    const stat = fs.statSync(store.path);
    if (store.cache && stat.mtimeMs === store.lastMtime) {
      return store.cache;
    }
    store.lastMtime = stat.mtimeMs;
    const parsed = JSON.parse(
      fs.readFileSync(store.path, "utf8") || "[]"
    );
    store.cache = Array.isArray(parsed)
      ? parsed.filter(isPlayableSong)
      : [];
    return store.cache;
  } catch (error) {
    console.error(`Failed to read catalog at ${store.path}:`, error.message);
    store.cache = store.cache || [];
    return store.cache;
  }
}

/**
 * Search ONLY inside the final curated RetroRaag catalog.
 *
 * Important:
 * Runtime search does not call JioSaavn.
 * The self-hosted JioSaavn API is only used by catalog:build.
 */
async function searchTracks(
  query,
  options = {}
) {
  const needle =
    normalizeText(
      query
    );

  if (!needle) {
    return [];
  }

  const limit =
    Math.max(
      1,
      Math.min(
        Number(
          options.limit ||
          20
        ),
        100
      )
    );

  const queryTokens =
    needle
      .split(" ")
      .filter(Boolean);

  return loadCatalog(options.station)
    .map(
      (song) => {
        const name =
          normalizeText(
            song.name
          );

        const artists =
          normalizeText(
            Array.isArray(
              song.artists
            )
              ? song.artists.join(
                  " "
                )
              : ""
          );

        const album =
          normalizeText(
            song.album ||
            ""
          );

        const haystack =
          `${name} ${artists} ${album}`;

        let score = 0;

        if (
          name === needle
        ) {
          score += 100;
        } else if (
          name.startsWith(
            needle
          )
        ) {
          score += 80;
        } else if (
          name.includes(
            needle
          )
        ) {
          score += 65;
        } else if (
          haystack.includes(
            needle
          )
        ) {
          score += 45;
        }

        for (
          const token of
          queryTokens
        ) {
          if (
            name.includes(
              token
            )
          ) {
            score += 8;
          } else if (
            haystack.includes(
              token
            )
          ) {
            score += 3;
          }
        }

        return {
          song,
          score
        };
      }
    )
    .filter(
      (item) =>
        item.score > 0
    )
    .sort(
      (a, b) =>
        b.score -
        a.score
    )
    .slice(
      0,
      limit
    )
    .map(
      (item) =>
        item.song
    );
}

async function getRadioSongs(station = "90s") {
  return loadCatalog(station);
}

function getCatalogStatus(station = "90s") {
  const songs =
    loadCatalog(station);

  const bySource = {};

  for (
    const song of
    songs
  ) {
    for (
      const source of
      song.sourceLists ||
      []
    ) {
      bySource[
        source
      ] =
        (
          bySource[
            source
          ] ||
          0
        ) + 1;
    }
  }

  const activeStore = getStore(station);

  return {
    built:
      songs.length > 0,

    count:
      songs.length,

    station:
      String(station).toLowerCase() === "kishore" ? "kishore" : "90s",

    sourceFiltered:
      true,

    runtimeProvider:
      path.basename(activeStore.path),

    buildProvider:
      "self-hosted JioSaavn API",

    bySource
  };
}

function clearCatalogCache(station) {
  if (station) {
    const store = getStore(station);
    store.cache = null;
  } else {
    stationStores["90s"].cache = null;
    stationStores.kishore.cache = null;
  }
}

// Kept for compatibility with older imports.
function normalizeSong(song) {
  return song || null;
}

module.exports = {
  searchTracks,
  getRadioSongs,
  getCatalogStatus,
  clearCatalogCache,
  normalizeSong
};