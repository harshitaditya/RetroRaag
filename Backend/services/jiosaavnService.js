const fs = require("fs");
const path = require("path");

const CATALOG_PATH =
  path.join(
    __dirname,
    "..",
    "data",
    "songs.json"
  );

let catalogCache = null;

function normalizeText(
  value = ""
) {
  return String(value)
    .normalize("NFKD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(
      /[^a-z0-9\s]/g,
      " "
    )
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

function loadCatalog() {
  if (catalogCache) {
    return catalogCache;
  }

  if (
    !fs.existsSync(
      CATALOG_PATH
    )
  ) {
    catalogCache = [];
    return catalogCache;
  }

  try {
    const parsed =
      JSON.parse(
        fs.readFileSync(
          CATALOG_PATH,
          "utf8"
        ) || "[]"
      );

    catalogCache =
      Array.isArray(
        parsed
      )
        ? parsed.filter(
            isPlayableSong
          )
        : [];

    return catalogCache;
  } catch (error) {
    console.error(
      "Failed to read songs.json:",
      error.message
    );

    catalogCache = [];
    return catalogCache;
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

  return loadCatalog()
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

async function getRadioSongs() {
  return loadCatalog();
}

function getCatalogStatus() {
  const songs =
    loadCatalog();

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

  return {
    built:
      songs.length > 0,

    count:
      songs.length,

    sourceFiltered:
      true,

    yearFilter:
      false,

    languageFilter:
      false,

    runtimeProvider:
      "local songs.json",

    buildProvider:
      "self-hosted JioSaavn API",

    sources: [
      "spotify",
      "hinditracks",
      "gaana"
    ],

    bySource
  };
}

function clearCatalogCache() {
  catalogCache = null;
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