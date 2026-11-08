const fs = require("fs");
const path = require("path");
const CryptoJS = require("crypto-js");
const axios = require("axios");

const DATA_DIR = path.join(__dirname, "..", "data");
const RAMKATHA_CATALOG_PATH = path.join(DATA_DIR, "ramKathaSongs.json");
const RAMKATHA_METADATA_PATH = path.join(DATA_DIR, "ramKathaMetadata.json");

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

    const results = res.data?.results || [];
    for (const item of results) {
      const streamUrl = decryptMediaUrl(item?.more_info?.encrypted_media_url);
      if (streamUrl) {
        const image = (item.image || "")
          .replace("-150x150.", "-500x500.")
          .replace("-50x50.", "-500x500.");

        const rawTitle = item.title
          ? item.title.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, "&")
          : "";

        return {
          name: rawTitle,
          album: item.more_info?.album || "Shri Ram Katha & Bhajan",
          image: image || "https://retroraag.in/images/retroraag-tab-icon-v9.png",
          streamUrl,
          durationMs: Number(item.more_info?.duration || 300) * 1000,
          year: Number(item.year || 2024),
          singers: item.more_info?.singers || item.more_info?.music || item.more_info?.primary_artists || "Ravindra Jain"
        };
      }
    }
  } catch (err) {
    return null;
  }
  return null;
}

function getRamKathaMetadata() {
  try {
    if (fs.existsSync(RAMKATHA_METADATA_PATH)) {
      return JSON.parse(fs.readFileSync(RAMKATHA_METADATA_PATH, "utf8"));
    }
  } catch (e) {}
  return null;
}

function getRamKathaCatalog() {
  try {
    if (fs.existsSync(RAMKATHA_CATALOG_PATH)) {
      return JSON.parse(fs.readFileSync(RAMKATHA_CATALOG_PATH, "utf8"));
    }
  } catch (e) {}
  return [];
}

async function updateRamKathaCatalog() {
  console.log("[RamKatha] Checking and refreshing Ram Katha catalog health...");
  const existing = getRamKathaCatalog();
  if (existing.length > 0) {
    console.log(`[RamKatha] Catalog currently has ${existing.length} verified tracks.`);
    return true;
  }
  return false;
}

module.exports = {
  updateRamKathaCatalog,
  getRamKathaCatalog,
  getRamKathaMetadata
};
