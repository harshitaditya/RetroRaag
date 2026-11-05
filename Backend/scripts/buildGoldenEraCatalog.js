const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");

const DATA_DIR = path.join(__dirname, "..", "data");
const OUTPUT_FILE = path.join(DATA_DIR, "goldenSongs.json");

// Load local catalogs for instant match
function loadLocalCatalog(file) {
  try {
    const p = path.join(DATA_DIR, file);
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf8"));
    }
  } catch (e) {}
  return [];
}

const localPool = [
  ...loadLocalCatalog("kishoreSongs.json"),
  ...loadLocalCatalog("rafiSongs.json"),
  ...loadLocalCatalog("songs.json")
];

function normalizeText(v = "") {
  return String(v)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function findInLocalPool(songName, artistName) {
  const normName = normalizeText(songName);
  const normArtist = normalizeText(artistName.split(",")[0]);
  return localPool.find(item => {
    const itemNorm = normalizeText(item.name);
    return itemNorm.includes(normName) || normName.includes(itemNorm);
  });
}

function decryptMediaUrl(encryptedUrl) {
  try {
    const key = Buffer.from("38346591", "utf8");
    const decipher = crypto.createDecipheriv("des-ecb", key, "");
    decipher.setAutoPadding(true);
    let decrypted = decipher.update(encryptedUrl, "base64", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted
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
    if (!item) return null;

    let streamUrl = "";
    if (item.more_info?.encrypted_media_url) {
      streamUrl = decryptMediaUrl(item.more_info.encrypted_media_url);
    }

    const image = (item.image || "")
      .replace("-150x150.", "-500x500.")
      .replace("-50x50.", "-500x500.");

    return {
      name: item.title ? item.title.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, "&") : "",
      album: item.more_info?.album || "",
      image: image || "https://retroraag.in/images/retroraag-tab-icon-v9.png",
      streamUrl,
      durationMs: Number(item.more_info?.duration || 240) * 1000,
      year: Number(item.year || 1970)
    };
  } catch (err) {
    return null;
  }
}

const RAW_SONGS = [
  { name: "Lag Ja Gale Se Phir", artist: "Lata Mangeshkar", album: "Woh Kaun Thi", year: 1964 },
  { name: "Yeh Shaam Mastani", artist: "Kishore Kumar", album: "Kati Patang", year: 1971 },
  { name: "Pal Pal Dil Ke Paas", artist: "Kishore Kumar", album: "Blackmail", year: 1973 },
  { name: "Chura Liya Hai Tumne Jo Dil Ko", artist: "Mohammad Rafi, Asha Bhosle", album: "Yaadon Ki Baaraat", year: 1973 },
  { name: "Abhi Na Jao Chhod Kar", artist: "Mohammad Rafi, Asha Bhosle", album: "Hum Dono", year: 1961 },
  { name: "O Mere Dil Ke Chain", artist: "Kishore Kumar", album: "Mere Jeevan Saathi", year: 1972 },
  { name: "Tere Bina Zindagi Se", artist: "Kishore Kumar, Lata Mangeshkar", album: "Aandhi", year: 1975 },
  { name: "Aap Ki Ankhon Mein Kuch", artist: "Kishore Kumar, Lata Mangeshkar", album: "Ghar", year: 1978 },
  { name: "Dekha Ek Khwaab", artist: "Kishore Kumar, Lata Mangeshkar", album: "Silsila", year: 1981 },
  { name: "Hamen Tumse Pyar Kitna", artist: "Kishore Kumar", album: "Kudrat", year: 1981 },
  { name: "Rimjhim Gire Sawan", artist: "Kishore Kumar", album: "Manzil", year: 1979 },
  { name: "Kahiin Door Jab Din Dhal Jaaye", artist: "Mukesh", album: "Anand", year: 1971 },
  { name: "Pyar Diwana Hota Hai", artist: "Kishore Kumar", album: "Kati Patang", year: 1971 },
  { name: "Chaudhvin Ka Chand Ho", artist: "Mohammad Rafi", album: "Chaudhvin Ka Chand", year: 1960 },
  { name: "Bahon Mein Chale Aao", artist: "Lata Mangeshkar", album: "Anamika", year: 1972 },
  { name: "Mere Sapno Ki Rani", artist: "Kishore Kumar", album: "Aradhana", year: 1969 },
  { name: "Kya Hua Tera Wada", artist: "Mohammad Rafi", album: "Hum Kisise Kum Naheen", year: 1977 },
  { name: "Ek Pyar Ka Naghma Hai", artist: "Lata Mangeshkar, Mukesh", album: "Shor", year: 1972 },
  { name: "Gulabi Aankhen", artist: "Mohammad Rafi", album: "The Train", year: 1970 },
  { name: "Likhe Jo Khat Tujhe", artist: "Mohammad Rafi", album: "Kanyadaan", year: 1968 },
  { name: "Aanewala Pal Janewala Hai", artist: "Kishore Kumar", album: "Gol Maal", year: 1979 },
  { name: "Kabhi Kabhie Mere Dil Mein", artist: "Mukesh, Lata Mangeshkar", album: "Kabhi Kabhie", year: 1976 },
  { name: "Roop Tera Mastana", artist: "Kishore Kumar", album: "Aradhana", year: 1969 },
  { name: "Yeh Dosti Hum Nahi Todenge", artist: "Kishore Kumar, Manna Dey", album: "Sholay", year: 1975 },
  { name: "Aaja Re Pardesi", artist: "Lata Mangeshkar", album: "Madhumati", year: 1958 },
  { name: "Chingari Koi Bhadke", artist: "Kishore Kumar", album: "Amar Prem", year: 1972 },
  { name: "Kuch Toh Log Kahenge", artist: "Kishore Kumar", album: "Amar Prem", year: 1972 },
  { name: "Jane Kahan Gaye Woh Din", artist: "Mukesh", album: "Mera Naam Joker", year: 1970 },
  { name: "Dil Kya Kare Jab Kisi Se", artist: "Kishore Kumar", album: "Julie", year: 1975 },
  { name: "Dum Maro Dum", artist: "Asha Bhosle", album: "Hare Rama Hare Krishna", year: 1971 },
  { name: "Tu Ganga Ki Mauj", artist: "Mohammad Rafi", album: "Baiju Bawra", year: 1952 },
  { name: "Parde Mein Rehne Do", artist: "Asha Bhosle", album: "Shikar", year: 1968 },
  { name: "Khoya Khoya Chand", artist: "Mohammad Rafi", album: "Kala Bazar", year: 1960 },
  { name: "Pyar Hua Iqrar Hua", artist: "Manna Dey, Lata Mangeshkar", album: "Shree 420", year: 1955 },
  { name: "Zindagi Ek Safar Hai Suhana", artist: "Kishore Kumar", album: "Andaz", year: 1971 },
  { name: "Ehsaan Tera Hoga Mujh Par", artist: "Mohammad Rafi", album: "Junglee", year: 1961 },
  { name: "Ajeeb Dastan Hai Yeh", artist: "Lata Mangeshkar", album: "Dil Apna Aur Preet Parai", year: 1960 },
  { name: "Suhana Safar Aur Yeh Mausam", artist: "Mukesh", album: "Madhumati", year: 1958 },
  { name: "Tum Pukar Lo", artist: "Hemant Kumar", album: "Khamoshi", year: 1969 },
  { name: "Piya Tose Naina Lage Re", artist: "Lata Mangeshkar", album: "Guide", year: 1965 },
  { name: "Chhukar Mere Man Ko", artist: "Kishore Kumar", album: "Yaraana", year: 1981 },
  { name: "Teri Bindiya Re", artist: "Mohammad Rafi, Lata Mangeshkar", album: "Abhimaan", year: 1973 },
  { name: "Raat Kali Ek Khwab Mein Aai", artist: "Kishore Kumar", album: "Buddha Mil Gaya", year: 1971 },
  { name: "Awara Hoon", artist: "Mukesh", album: "Awaara", year: 1951 },
  { name: "In Aankhon Ki Masti", artist: "Asha Bhosle", album: "Umrao Jaan", year: 1981 },
  { name: "Aaj Phir Jeene Ki Tamanna Hai", artist: "Lata Mangeshkar", album: "Guide", year: 1965 },
  { name: "Babul Ki Duayen Leti Ja", artist: "Mohammad Rafi", album: "Neel Kamal", year: 1968 },
  { name: "Zindagi Kaisi Hai Paheli", artist: "Manna Dey", album: "Anand", year: 1971 },
  { name: "Diwana Hua Badal", artist: "Mohammad Rafi, Asha Bhosle", album: "Kashmir Ki Kali", year: 1964 },
  { name: "Gaata Rahe Mera Dil", artist: "Kishore Kumar, Lata Mangeshkar", album: "Guide", year: 1965 },
  { name: "Mere Mehboob Qayamat Hogi", artist: "Kishore Kumar", album: "Mr. X in Bombay", year: 1964 },
  { name: "Taarif Karoon Kya Uski", artist: "Mohammad Rafi", album: "Kashmir Ki Kali", year: 1964 },
  { name: "Chalte Chalte Yunhi Koi", artist: "Lata Mangeshkar", album: "Pakeezah", year: 1972 },
  { name: "Yeh Reshmi Zulfen", artist: "Mohammad Rafi", album: "Do Raaste", year: 1969 },
  { name: "O Saathi Re Tere Bina Bhi Kya Jeena", artist: "Kishore Kumar", album: "Muqaddar Ka Sikandar", year: 1978 },
  { name: "Yeh Kahan Aa Gaye Hum", artist: "Lata Mangeshkar, Amitabh Bachchan", album: "Silsila", year: 1981 },
  { name: "Chala Jata Hoon", artist: "Kishore Kumar", album: "Mere Jeevan Saathi", year: 1972 },
  { name: "Baharon Phool Barsao", artist: "Mohammad Rafi", album: "Suraj", year: 1966 },
  { name: "Jeena Yahan Marna Yahan", artist: "Mukesh", album: "Mera Naam Joker", year: 1970 },
  { name: "Aap Ki Nazron Ne Samjha", artist: "Lata Mangeshkar", album: "Anpadh", year: 1962 },
  { name: "Yeh Jo Mohabbat Hai", artist: "Kishore Kumar", album: "Kati Patang", year: 1971 },
  { name: "Badan Pe Sitare Lapete Huye", artist: "Mohammad Rafi", album: "Prince", year: 1969 },
  { name: "Dum Bhar Jo Udhar Munh Phere", artist: "Mukesh, Lata Mangeshkar", album: "Awaara", year: 1951 },
  { name: "Wada Karo Nahin Chodoge", artist: "Kishore Kumar, Lata Mangeshkar", album: "Aa Gale Lag Jaa", year: 1973 },
  { name: "Gun Guna Rahe Hai Bhanware", artist: "Mohammad Rafi, Asha Bhosle", album: "Aradhana", year: 1969 },
  { name: "Musafir Hoon Yaaron", artist: "Kishore Kumar", album: "Parichay", year: 1972 },
  { name: "Yaad Kiya Dil Ne Kahan Ho Tum", artist: "Hemant Kumar, Geeta Dutt", album: "Patita", year: 1953 },
  { name: "Hothon Se Chhu Lo Tum", artist: "Jagjit Singh", album: "Prem Geet", year: 1981 },
  { name: "Meri Bheegi Bheegi Si", artist: "Kishore Kumar", album: "Anamika", year: 1972 },
  { name: "Kya Khoob Lagti Ho", artist: "Mukesh, Kanchan", album: "Dharmatma", year: 1975 },
  { name: "Tere Chehre Se Nazar Nahin", artist: "Kishore Kumar, Lata Mangeshkar", album: "Kabhi Kabhie", year: 1976 },
  { name: "Kabhi Aar Kabhi Paar", artist: "Shamshad Begum", album: "Aar Paar", year: 1954 },
  { name: "Choti Si Kahani Se", artist: "Asha Bhosle", album: "Ijaazat", year: 1987 },
  { name: "Tum Itna Jo Muskura Rahe Ho", artist: "Jagjit Singh", album: "Arth", year: 1982 },
  { name: "Main Pal Do Pal Ka Shayar Hoon", artist: "Mukesh", album: "Kabhi Kabhie", year: 1976 },
  { name: "Karvaten Badalte Rahe", artist: "Kishore Kumar, Lata Mangeshkar", album: "Aap Ki Kasam", year: 1974 },
  { name: "Chand Si Mehbooba Ho Meri", artist: "Mukesh", album: "Himalay Ki God Mein", year: 1965 },
  { name: "Kasme Vaade Nibhayenge Hum", artist: "Kishore Kumar, Lata Mangeshkar", album: "Kasme Vaade", year: 1978 },
  { name: "Phoolon Ke Rang Se", artist: "Kishore Kumar", album: "Prem Pujari", year: 1970 },
  { name: "Yaadon Ki Baaraat Nikli Hai", artist: "Kishore Kumar, Mohammad Rafi", album: "Yaadon Ki Baaraat", year: 1973 },
  { name: "Ek Ajnabee Haseena Se", artist: "Kishore Kumar", album: "Ajanabee", year: 1974 },
  { name: "Mera Joota Hai Japani", artist: "Mukesh", album: "Shree 420", year: 1955 },
  { name: "Waqt Ne Kiya Kya Haseen Sitam", artist: "Geeta Dutt", album: "Kaagaz Ke Phool", year: 1959 },
  { name: "Dil Pukare Aare Aare", artist: "Mohammad Rafi, Lata Mangeshkar", album: "Jewel Thief", year: 1967 },
  { name: "Kora Kagaz Tha Yeh Man Mera", artist: "Kishore Kumar, Lata Mangeshkar", album: "Aradhana", year: 1969 },
  { name: "Pukarta Chala Hoon Main", artist: "Mohammad Rafi", album: "Mere Sanam", year: 1965 },
  { name: "Sawan Ka Mahina", artist: "Mukesh, Lata Mangeshkar", album: "Milan", year: 1967 },
  { name: "Jai Jai Shiv Shankar", artist: "Kishore Kumar, Lata Mangeshkar", album: "Aap Ki Kasam", year: 1974 },
  { name: "Dilbar Mere Kab Tak Mujhe", artist: "Kishore Kumar", album: "Satte Pe Satta", year: 1982 },
  { name: "Meri Pyari Bindu", artist: "Kishore Kumar", album: "Padosan", year: 1968 },
  { name: "O Haseena Zulfonwali Jane Jahan", artist: "Mohammad Rafi, Asha Bhosle", album: "Teesri Manzil", year: 1966 },
  { name: "Hum Dono Do Premi", artist: "Kishore Kumar, Lata Mangeshkar", album: "Ajanabee", year: 1974 },
  { name: "Tum Aa Gaye Ho Noor Aa Gaya", artist: "Kishore Kumar, Lata Mangeshkar", album: "Aandhi", year: 1975 },
  { name: "Ek Chatur Naar Karke Sringaar", artist: "Kishore Kumar, Manna Dey", album: "Padosan", year: 1968 },
  { name: "Tumko Dekha Toh Yeh Khayal Aaya", artist: "Jagjit Singh, Chitra Singh", album: "Saath Saath", year: 1982 },
  { name: "Do Lafzon Ki Hai Dil Ki Kahani", artist: "Asha Bhosle", album: "The Great Gambler", year: 1979 },
  { name: "Chalte Chalte Mere Ye Geet", artist: "Kishore Kumar", album: "Chalte Chalte", year: 1976 },
  { name: "Yeh Raaten Yeh Mausam", artist: "Kishore Kumar, Asha Bhosle", album: "Dilli Ka Thug", year: 1958 },
  { name: "Tere Hothon Ke Do Phool", artist: "Mukesh, Lata Mangeshkar", album: "Paras", year: 1971 },
  { name: "Chaudhvin Ka Chand", artist: "Mohammad Rafi", album: "Chaudhvin Ka Chand", year: 1960 }
];

async function resolveSong(song, index) {
  // 1. Try local pool first
  const localMatch = findInLocalPool(song.name, song.artist);
  if (localMatch && localMatch.streamUrl) {
    return {
      id: `gh_${index + 1}`,
      name: song.name,
      artists: Array.isArray(localMatch.artists) ? localMatch.artists : song.artist.split(",").map(a => a.trim()),
      album: localMatch.album || song.album,
      image: localMatch.image || "https://retroraag.in/images/retroraag-tab-icon-v9.png",
      durationMs: localMatch.durationMs || 240000,
      streamUrl: localMatch.streamUrl,
      year: localMatch.year || song.year,
      language: "hindi",
      sourceLists: ["golden-era-heritage"]
    };
  }

  // 2. Query direct JioSaavn API
  const query = `${song.name} ${song.artist.split(",")[0]}`;
  const directMatch = await searchDirectJioSaavn(query);

  if (directMatch && directMatch.streamUrl) {
    return {
      id: `gh_${index + 1}`,
      name: song.name,
      artists: song.artist.split(",").map(a => a.trim()),
      album: directMatch.album || song.album,
      image: directMatch.image,
      durationMs: directMatch.durationMs,
      streamUrl: directMatch.streamUrl,
      year: directMatch.year || song.year,
      language: "hindi",
      sourceLists: ["golden-era-heritage"]
    };
  }

  // Secondary search with song title only if artist combo returned nothing
  const titleMatch = await searchDirectJioSaavn(song.name);
  if (titleMatch && titleMatch.streamUrl) {
    return {
      id: `gh_${index + 1}`,
      name: song.name,
      artists: song.artist.split(",").map(a => a.trim()),
      album: titleMatch.album || song.album,
      image: titleMatch.image,
      durationMs: titleMatch.durationMs,
      streamUrl: titleMatch.streamUrl,
      year: titleMatch.year || song.year,
      language: "hindi",
      sourceLists: ["golden-era-heritage"]
    };
  }

  return {
    id: `gh_${index + 1}`,
    name: song.name,
    artists: song.artist.split(",").map(a => a.trim()),
    album: song.album,
    image: "https://retroraag.in/images/retroraag-tab-icon-v9.png",
    durationMs: 240000,
    streamUrl: "",
    year: song.year,
    language: "hindi",
    sourceLists: ["golden-era-heritage"]
  };
}

async function build() {
  console.log(`Starting Golden Era Heritage Catalog build for ${RAW_SONGS.length} songs...`);
  const resolved = [];

  for (let i = 0; i < RAW_SONGS.length; i++) {
    const s = await resolveSong(RAW_SONGS[i], i);
    resolved.push(s);
    if ((i + 1) % 10 === 0 || i === RAW_SONGS.length - 1) {
      console.log(`Resolved ${i + 1}/${RAW_SONGS.length} songs... (Playable so far: ${resolved.filter(x => x.streamUrl).length})`);
    }
    await new Promise(r => setTimeout(r, 100));
  }

  const playable = resolved.filter(s => s.streamUrl && s.streamUrl.trim());
  console.log(`Finished! Playable songs resolved: ${playable.length}/${RAW_SONGS.length}`);

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(playable, null, 2), "utf8");
  console.log(`Saved catalog to ${OUTPUT_FILE}`);
}

build().catch(console.error);
