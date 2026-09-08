const jiosaavnService =
  require("../services/jiosaavnService");


/**
 * Search song
 *
 * GET:
 * /api/music/search?q=Pehla Nasha
 */
async function search(req, res, next) {

  try {

    const { q } = req.query;

    if (!q || !q.trim()) {

      return res.status(400).json({
        success: false,
        message: "Search query 'q' is required."
      });

    }

    const results =
      await jiosaavnService.searchTracks(q);

    res.json(results);

  } catch (error) {

    next(error);

  }

}


/**
 * Complete radio songs
 *
 * GET:
 * /api/radio/songs
 */
async function radioSongs(req, res, next) {
  try {
    const station = req.query.station || "90s";
    const songs =
      await jiosaavnService.getRadioSongs(station);

    if (req.query.compact === "1") {
      return res.json(
        songs.map((song) => ({
          id: song.id,
          name: song.name,
          artists: song.artists,
          album: song.album,
          image: song.image,
          streamUrl: song.streamUrl
        }))
      );
    }

    res.json(songs);
  } catch (error) {
    next(error);
  }
}

function radioStatus(req, res, next) {
  try {
    const station = req.query.station || "90s";
    const status =
      jiosaavnService.getCatalogStatus(station);

    res.json(status);
  } catch (error) {
    next(error);
  }
}


module.exports = {
  search,
  radioSongs,
  radioStatus
};