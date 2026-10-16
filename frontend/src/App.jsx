import React, { useState, useEffect, useRef } from "";

export default function App() {
  const [station, setStation] = useState("90s");
  const [songs, setSongs] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeUsers, setActiveUsers] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isRadioLoading, setIsRadioLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  // Station Dropdown state
  const [isStationDropdownOpen, setIsStationDropdownOpen] = useState(false);
  const stationDropdownRef = useRef(null);

  const audioRef = useRef(null);

  const stations = [
    { id: "90s", label: "90s Golden Melody" },
    { id: "kishore", label: "Kishore Kumar Classics" }
  ];

  const currentSong = songs[currentIndex] || null;

  // Close station dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        stationDropdownRef.current &&
        !stationDropdownRef.current.contains(event.target)
      ) {
        setIsStationDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Fetch station songs
  useEffect(() => {
    let isMounted = true;
    setIsRadioLoading(true);
    setErrorMsg("");

    fetch(`/api/radio/songs?station=${station}`)
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (Array.isArray(data) && data.length > 0) {
          setSongs(data);
          setCurrentIndex(0);
          setCurrentTime(0);
        } else {
          setSongs([]);
          setErrorMsg("No songs found for this station.");
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("Failed to load station songs:", err);
        setErrorMsg("Failed to load radio catalog.");
      })
      .finally(() => {
        if (isMounted) setIsRadioLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [station]);

  // Active users SSE stream
  useEffect(() => {
    let eventSource;
    let reconnectTimer;

    function connectSSE() {
      eventSource = new EventSource("/api/active-users/stream");
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && typeof data.activeUsers === "number") {
            setActiveUsers(data.activeUsers);
          }
        } catch (e) {
          // ignore
        }
      };
      eventSource.onerror = () => {
        eventSource.close();
        reconnectTimer = setTimeout(connectSSE, 5000);
      };
    }

    connectSSE();

    return () => {
      if (eventSource) eventSource.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, []);

  // Handle audio playback sync
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (currentSong && currentSong.streamUrl) {
      audio.src = currentSong.streamUrl;
      audio.load();
      if (isPlaying) {
        audio.play().catch((err) => {
          console.error("Playback error:", err);
          setIsPlaying(false);
        });
      }
    } else {
      audio.src = "";
      setIsPlaying(false);
    }
  }, [currentIndex, currentSong?.id]);

  // Handle play/pause toggle
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentSong) return;

    if (isPlaying) {
      audio.play().catch((err) => {
        console.error("Playback error:", err);
        setIsPlaying(false);
      });
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  // Volume control
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  // Search handling
  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(() => {
      setIsSearching(true);
      fetch(`/api/music/search?q=${encodeURIComponent(query)}&station=${station}`)
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setSearchResults(data);
          } else {
            setSearchResults([]);
          }
        })
        .catch((err) => {
          console.error("Search error:", err);
          setSearchResults([]);
        })
        .finally(() => {
          setIsSearching(false);
        });
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, station]);

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTime(audio.currentTime || 0);
    setDuration(audio.duration || 0);
  };

  const handleSongEnded = () => {
    // Auto play next song
    if (songs.length > 0) {
      setCurrentIndex((prev) => (prev + 1) % songs.length);
      setIsPlaying(true);
    }
  };

  const formatTime = (seconds) => {
    if (isNaN(seconds) || seconds <= 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const handleSelectSong = (songId) => {
    const idx = songs.findIndex((s) => s.id === songId);
    if (idx !== -1) {
      setCurrentIndex(idx);
      setIsPlaying(true);
      setSearchQuery("");
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between relative overflow-hidden text-white font-sans bg-[#070b19]">
      {/* Background Image / Ambient Glow */}
      <div className="absolute inset-0 z-0 opacity-40 pointer-events-none bg-cover bg-center bg-no-repeat" style={{ backgroundImage: `url('/images/retroraag_desktop_4k.png')` }} />
      <div className="absolute inset-0 z-0 bg-gradient-to-t from-[#070b19] via-transparent to-[#070b19]/80 pointer-events-none" />

      {/* Hidden Audio Element */}
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleSongEnded}
        onLoadedMetadata={handleTimeUpdate}
      />

      {/* Top Header / Nav */}
      <header className="relative z-20 flex flex-col sm:flex-row items-center justify-between px-4 sm:px-8 py-4 bg-[#0b1329]/70 backdrop-blur-md border-b border-white/10 gap-4">
        <div className="flex items-center gap-3">
          <img
            src="/images/retroraag-tab-icon-v9.png"
            alt="RetroRaag Logo"
            className="w-10 h-10 object-contain rounded-full shadow-lg border border-amber-400/30"
          />
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-amber-500 font-['Baloo_2']">
              RetroRaag
            </h1>
            <p className="text-xs text-amber-100/70 font-medium">
              Timeless Bollywood Classics
            </p>
          </div>
        </div>

        {/* Station Selector Dropdown & Live Active Listeners */}
        <div className="flex flex-wrap items-center justify-center gap-3 w-full sm:w-auto">
          {/* Custom Responsive Dropdown for Song Type / Deck */}
          <div className="relative w-full sm:w-64" ref={stationDropdownRef}>
            <button
              onClick={() => setIsStationDropdownOpen(!isStationDropdownOpen)}
              className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-gradient-to-r from-slate-900/90 to-indigo-950/90 border border-amber-500/40 hover:border-amber-400 text-amber-200 shadow-lg text-sm font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
            >
              <div className="flex items-center gap-2 truncate">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span className="truncate">
                  {stations.find((s) => s.id === station)?.label || "Select Deck"}
                </span>
              </div>
              <svg
                className={`w-4 h-4 text-amber-400 transition-transform duration-300 ${
                  isStationDropdownOpen ? "rotate-180" : ""
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isStationDropdownOpen && (
              <div className="absolute left-0 right-0 mt-2 z-50 rounded-xl bg-[#0d1631] border border-amber-500/30 shadow-2xl backdrop-blur-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="p-1.5 space-y-1">
                  {stations.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setStation(s.id);
                        setIsStationDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 flex items-center justify-between ${
                        station === s.id
                          ? "bg-gradient-to-r from-amber-500/20 to-amber-600/20 text-amber-300 border border-amber-500/30 font-semibold shadow-inner"
                          : "text-slate-300 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <span>{s.label}</span>
                      {station === s.id && (
                        <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Live Listeners Badge */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs font-semibold shadow-inner">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>{activeUsers} Listening Live</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 flex flex-col lg:flex-row items-center justify-center p-4 sm:p-8 gap-6 max-w-7xl mx-auto w-full">
        {/* Left / Center: Player & Current Song Art */}
        <div className="flex-1 flex flex-col items-center justify-center w-full max-w-md">
          <div className="relative w-full aspect-square max-w-[280px] sm:max-w-[340px] rounded-3xl overflow-hidden shadow-2xl border border-amber-500/30 bg-slate-900/80 group">
            {currentSong && currentSong.image ? (
              <img
                src={currentSong.image}
                alt={currentSong.name}
                className={`w-full h-full object-cover transition-transform duration-700 ${
                  isPlaying ? "scale-105" : "scale-100"
                }`}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-slate-800 text-slate-400">
                <span className="text-sm">No Image</span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-90" />
            
            {/* Vinyl spinning record effect indicator */}
            <div className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/60 border border-amber-400/40 flex items-center justify-center backdrop-blur-md">
              <div className={`w-3 h-3 rounded-full bg-amber-400 ${isPlaying ? "animate-pulse" : ""}`} />
            </div>

            <div className="absolute bottom-4 left-4 right-4 text-left">
              <h2 className="text-lg sm:text-xl font-bold text-white truncate drop-shadow">
                {isRadioLoading ? "Loading station..." : currentSong ? currentSong.name : "Select a song"}
              </h2>
              <p className="text-xs sm:text-sm text-amber-200/90 truncate drop-shadow">
                {currentSong && currentSong.artists ? currentSong.artists.join(", ") : "RetroRaag"}
              </p>
            </div>
          </div>

          {/* Progress Bar & Controls */}
          <div className="w-full max-w-[340px] mt-6 bg-slate-900/60 backdrop-blur-md p-4 rounded-2xl border border-white/10 shadow-xl">
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={currentTime}
              onChange={(e) => {
                const val = Number(e.target.value);
                setCurrentTime(val);
                if (audioRef.current) {
                  audioRef.current.currentTime = val;
                }
              }}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />

            {/* Playback Controls */}
            <div className="flex items-center justify-center gap-6 mt-4">
              <button
                onClick={() => {
                  if (songs.length === 0) return;
                  setCurrentIndex((prev) => (prev - 1 + songs.length) % songs.length);
                  setIsPlaying(true);
                }}
                className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 text-amber-300 transition-colors"
                title="Previous Song"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M8.445 14.832A1 1 0 0010 14v-2.768l5.445 3.63A1 1 0 0017 14V6a1 1 0 00-1.555-.832L10 8.768V6a1 1 0 00-1.555-.832l-6 4a1 1 0 000 1.664l6 4z" />
                </svg>
              </button>

              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="p-4 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 shadow-lg shadow-amber-500/30 transition-transform active:scale-95"
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 translate-x-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                )}
              </button>

              <button
                onClick={() => {
                  if (songs.length === 0) return;
                  setCurrentIndex((prev) => (prev + 1) % songs.length);
                  setIsPlaying(true);
                }}
                className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 text-amber-300 transition-colors"
                title="Next Song"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M11.555 5.168A1 1 0 0010 6v2.768L4.555 5.136A1 1 0 003 6v8a1 1 0 001.555.832L10 11.232V14a1 1 0 001.555.832l6-4a1 1 0 000-1.664l-6-4z" />
                </svg>
              </button>
            </div>

            {/* Volume Control */}
            <div className="flex items-center gap-3 mt-4 pt-3 border-t border-white/10">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                {isMuted || volume === 0 ? (
                  <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-slate-300" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.21-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.414 0A5.98 5.98 0 0115 10a5.98 5.98 0 01-1.757 4.243 1 1 0 01-1.414-1.414A3.984 3.984 0 0013 10a3.984 3.984 0 00-1.172-2.828 1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  setVolume(Number(e.target.value));
                  if (isMuted) setIsMuted(false);
                }}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-400"
              />
            </div>
          </div>
        </div>

        {/* Right / Queue & Search Panel */}
        <div className="flex-1 flex flex-col w-full max-w-lg bg-slate-900/60 backdrop-blur-md rounded-3xl border border-white/10 p-5 shadow-2xl h-[480px]">
          {/* Search Box */}
          <div className="relative mb-4">
            <input
              type="text"
              placeholder="Search songs, artists, albums..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-3 pl-11 rounded-xl bg-slate-800/80 border border-white/10 text-white placeholder-slate-400 text-sm focus:outline-none focus:border-amber-400 transition-colors"
            />
            <svg className="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3.5 top-3.5 text-slate-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Results / Playlist Header */}
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="text-sm font-bold text-amber-200 uppercase tracking-wider">
              {searchQuery ? `Search Results (${searchResults.length})` : `Station Queue (${songs.length})`}
            </h3>
            {isSearching && <span className="text-xs text-amber-400 animate-pulse">Searching...</span>}
          </div>

          {/* Song List */}
          <div className="flex-1 overflow-y-auto pr-1 space-y-2">
            {errorMsg ? (
              <div className="text-center py-10 text-red-300 text-sm">{errorMsg}</div>
            ) : isRadioLoading && !searchQuery ? (
              <div className="text-center py-10 text-slate-400 text-sm animate-pulse">Loading station songs...</div>
            ) : searchQuery ? (
              searchResults.length > 0 ? (
                searchResults.map((song) => (
                  <div
                    key={song.id}
                    onClick={() => handleSelectSong(song.id)}
                    className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all ${
                      currentSong?.id === song.id
                        ? "bg-amber-500/20 border border-amber-500/40 text-amber-200"
                        : "bg-white/5 hover:bg-white/10 text-slate-300"
                    }`}
                  >
                    <img src={song.image} alt={song.name} className="w-10 h-10 rounded-lg object-cover" />
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold truncate text-white">{song.name}</h4>
                      <p className="text-xs text-slate-400 truncate">{song.artists?.join(", ")}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-slate-400 text-sm">No matching songs found.</div>
              )
            ) : (
              songs.map((song, idx) => (
                <div
                  key={song.id || idx}
                  onClick={() => {
                    setCurrentIndex(idx);
                    setIsPlaying(true);
                  }}
                  className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all ${
                    currentIndex === idx
                      ? "bg-amber-500/20 border border-amber-500/40 text-amber-200 shadow-sm"
                      : "bg-white/5 hover:bg-white/10 text-slate-300"
                  }`}
                >
                  <span className="text-xs font-mono text-slate-400 w-5 text-center">
                    {currentIndex === idx && isPlaying ? (
                      <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                    ) : (
                      idx + 1
                    )}
                  </span>
                  <img src={song.image} alt={song.name} className="w-10 h-10 rounded-lg object-cover" />
                  <div className="flex-1 min-w-0">
                    <h4 className={`text-sm font-semibold truncate ${currentIndex === idx ? "text-amber-300" : "text-white"}`}>
                      {song.name}
                    </h4>
                    <p className="text-xs text-slate-400 truncate">{song.artists?.join(", ")}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-20 py-4 text-center text-xs text-slate-400 bg-[#0b1329]/70 backdrop-blur-md border-t border-white/10">
        <p>© {new Date().getFullYear()} RetroRaag. All rights reserved. Made with ❤️ for Bollywood music lovers.</p>
      </footer>
    </div>
  );
}
