import { useEffect, useRef, useState } from "react";

const PLAYLIST_BATCH_SIZE = 120;

const NOSTALGIA_MESSAGES = [
  "सिर्फ़ यादें",
  "पुरानी धुनें",
  "फिर वही दौर",
  "यादों का रेडियो"
];

// =====================================================
// PURE HELPERS (same logic as the old player.js)
// =====================================================

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function playableSongs(items) {
  return items.filter(
    (song) =>
      song &&
      typeof song.name === "string" &&
      typeof song.streamUrl === "string" &&
      song.streamUrl.trim() !== ""
  );
}

function artistText(song) {
  if (Array.isArray(song?.artists) && song.artists.length) {
    return song.artists.join(" • ");
  }
  return song?.album || "RetroRaag";
}

function songStorageKey(song) {
  if (!song) return "";
  return String(
    song.id ||
      song.streamUrl ||
      `${song.name || "song"}|${artistText(song)}`
  );
}

function formatTime(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return "0:00";

  const totalSeconds = Math.floor(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secondsLeft = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secondsLeft).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secondsLeft).padStart(2, "0")}`;
}

export default function App() {
  // -----------------------------------------------------
  // DOM refs (replace document.getElementById from player.js)
  // -----------------------------------------------------
  const audioRef = useRef(null);
  const seekBarRef = useRef(null);
  const currentTimeLabelRef = useRef(null);
  const totalDurationLabelRef = useRef(null);
  const playlistListRef = useRef(null);
  const playlistPanelRef = useRef(null);
  const queueButtonRef = useRef(null);

  // -----------------------------------------------------
  // Mutable "latest value" refs — mirror of player.js module-level
  // `let` state, kept in sync with React state via effects below.
  // Needed so event listeners / async callbacks always see the
  // current value instead of a stale closure.
  // -----------------------------------------------------
  const queueRef = useRef([]);
  const currentIndexRef = useRef(0);
  const playlistOpenRef = useRef(false);
  const renderedCountRef = useRef(0);
  const trackLoadTokenRef = useRef(0);
  const userStartedPlaybackRef = useRef(false);
  const timelineAnimationFrameRef = useRef(0);
  const lastMediaPositionUpdateRef = useRef(0);

  // -----------------------------------------------------
  // React state (drives rendering)
  // -----------------------------------------------------
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [controlsEnabled, setControlsEnabled] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playlistOpen, setPlaylistOpenState] = useState(false);
  const [renderedCount, setRenderedCount] = useState(0);
  const [coverLoaded, setCoverLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [activeUsers, setActiveUsers] = useState("—");
  const [localTime, setLocalTime] = useState("--:--");
  const [brandActive, setBrandActive] = useState(false);
  const [favoriteKeys, setFavoriteKeys] = useState([]);
  const [volume, setVolume] = useState(0.82);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [nostalgiaMessageIndex, setNostalgiaMessageIndex] = useState(0);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);
  useEffect(() => {
    playlistOpenRef.current = playlistOpen;
  }, [playlistOpen]);
  useEffect(() => {
    renderedCountRef.current = renderedCount;
  }, [renderedCount]);

  // Rotate the small nostalgic message in the old era-label position.
  useEffect(() => {
    const messageTimer = window.setInterval(() => {
      setNostalgiaMessageIndex(
        (current) => (current + 1) % NOSTALGIA_MESSAGES.length
      );
    }, 7000);

    return () => window.clearInterval(messageTimer);
  }, []);

  // -----------------------------------------------------
  // Small player preferences
  // Favorites and volume stay on this browser/device.
  // -----------------------------------------------------
  useEffect(() => {
    try {
      const savedFavorites = JSON.parse(
        localStorage.getItem("retroraag:favorites") || "[]"
      );

      if (Array.isArray(savedFavorites)) {
        setFavoriteKeys(savedFavorites.map(String));
      }

      const savedVolume = Number(
        localStorage.getItem("retroraag:volume")
      );

      if (Number.isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 1) {
        setVolume(savedVolume);
      }
    } catch (error) {
      console.warn("Could not restore RetroRaag preferences:", error);
    }
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = Math.max(0, Math.min(1, volume));
    }

    try {
      localStorage.setItem("retroraag:volume", String(volume));
    } catch {
      // Storage can be unavailable in some privacy modes.
    }
  }, [volume]);

  function getCurrentSong() {
    return queueRef.current[currentIndexRef.current] || null;
  }

  // -----------------------------------------------------
  // Duration helpers
  // -----------------------------------------------------
  function catalogDurationSeconds() {
    const song = getCurrentSong();
    const durationMs = Number(song?.durationMs);
    if (Number.isFinite(durationMs) && durationMs > 0) return durationMs / 1000;
    return 0;
  }

  function getDuration() {
    const audio = audioRef.current;
    const audioDuration = Number(audio?.duration);
    if (Number.isFinite(audioDuration) && audioDuration > 0) return audioDuration;
    return catalogDurationSeconds();
  }

  // -----------------------------------------------------
  // Media Session
  // Gives supported phones/browsers lock-screen / notification
  // metadata and hardware media controls without changing the UI.
  // -----------------------------------------------------
  function hasMediaSession() {
    return (
      typeof navigator !== "undefined" &&
      "mediaSession" in navigator
    );
  }

  function setMediaSessionPlaybackState(state) {
    if (!hasMediaSession()) return;

    try {
      navigator.mediaSession.playbackState = state;
    } catch {
      // Some browsers expose only part of the Media Session API.
    }
  }

  function updateMediaSessionMetadata(song) {
    if (
      !song ||
      !hasMediaSession() ||
      typeof window === "undefined" ||
      typeof window.MediaMetadata !== "function"
    ) {
      return;
    }

    const artwork = [];

    if (typeof song.image === "string" && song.image.trim()) {
      try {
        artwork.push({
          src: new URL(song.image, window.location.href).href,
        });
      } catch {
        artwork.push({ src: song.image });
      }
    }

    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: song.name || "RetroRaag",
        artist: artistText(song),
        album: song.album || "RetroRaag",
        artwork,
      });
    } catch (error) {
      console.warn("Could not set Media Session metadata:", error);
    }
  }

  function resetMediaSessionPosition() {
    if (!hasMediaSession() || typeof navigator.mediaSession.setPositionState !== "function") {
      return;
    }

    try {
      navigator.mediaSession.setPositionState(null);
      lastMediaPositionUpdateRef.current = 0;
    } catch {
      // Position state is optional and browser support varies.
    }
  }

  function syncMediaSessionPosition(force = false) {
    if (!hasMediaSession() || typeof navigator.mediaSession.setPositionState !== "function") {
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;

    const duration = getDuration();
    if (!Number.isFinite(duration) || duration <= 0) return;

    const now = Date.now();
    if (!force && now - lastMediaPositionUpdateRef.current < 1000) {
      return;
    }

    const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const position = Math.max(0, Math.min(current, duration));
    const playbackRate =
      Number.isFinite(audio.playbackRate) && audio.playbackRate > 0
        ? audio.playbackRate
        : 1;

    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate,
        position,
      });
      lastMediaPositionUpdateRef.current = now;
    } catch {
      // Ignore partial implementations.
    }
  }

  // -----------------------------------------------------
  // Timeline (seek bar + time labels) — updated imperatively via
  // refs, same as the original, to avoid a React re-render on every
  // "timeupdate" tick (multiple times a second).
  // -----------------------------------------------------
  function updateTimeline() {
    const audio = audioRef.current;
    const seekBar = seekBarRef.current;
    const currentTimeLabel = currentTimeLabelRef.current;
    const totalDurationLabel = totalDurationLabelRef.current;
    if (!audio || !seekBar || !currentTimeLabel || !totalDurationLabel) return;

    const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const duration = getDuration();

    currentTimeLabel.textContent = formatTime(current);
    totalDurationLabel.textContent = duration > 0 ? formatTime(duration) : "0:00";

    if (duration <= 0) {
      seekBar.value = "0";
      seekBar.disabled = true;
      seekBar.style.setProperty("--seek-progress", "0%");
      return;
    }

    seekBar.disabled = false;
    seekBar.min = "0";
    seekBar.max = String(duration);
    seekBar.value = String(Math.min(current, duration));

    const progress = Math.max(0, Math.min(100, (current / duration) * 100));
    seekBar.style.setProperty("--seek-progress", `${progress}%`);

    syncMediaSessionPosition();
  }

  function resetTimeline() {
    const seekBar = seekBarRef.current;
    const currentTimeLabel = currentTimeLabelRef.current;
    const totalDurationLabel = totalDurationLabelRef.current;
    if (!seekBar || !currentTimeLabel || !totalDurationLabel) return;

    currentTimeLabel.textContent = "0:00";
    const duration = catalogDurationSeconds();
    totalDurationLabel.textContent = duration > 0 ? formatTime(duration) : "0:00";

    seekBar.value = "0";
    seekBar.min = "0";
    seekBar.max = duration > 0 ? String(duration) : "100";
    seekBar.disabled = duration <= 0;
    seekBar.style.setProperty("--seek-progress", "0%");
  }

  function stopTimelineAnimation() {
    if (timelineAnimationFrameRef.current) {
      cancelAnimationFrame(timelineAnimationFrameRef.current);
      timelineAnimationFrameRef.current = 0;
    }
  }

  function startTimelineAnimation() {
    stopTimelineAnimation();
    function animation() {
      updateTimeline();
      const audio = audioRef.current;
      if (audio && !audio.paused && !audio.ended) {
        timelineAnimationFrameRef.current = requestAnimationFrame(animation);
      } else {
        timelineAnimationFrameRef.current = 0;
      }
    }
    animation();
  }

  // -----------------------------------------------------
  // Load a track (by index) into the <audio> element
  // -----------------------------------------------------
  function loadTrack(index, { autoplay = false } = {}) {
    const q = queueRef.current;
    if (!q.length) return;

    const newIndex = (index + q.length) % q.length;
    currentIndexRef.current = newIndex;
    setCurrentIndex(newIndex);

    const song = q[newIndex];
    if (!song) return;

    updateMediaSessionMetadata(song);
    resetMediaSessionPosition();
    setMediaSessionPlaybackState("paused");

    const thisLoad = ++trackLoadTokenRef.current;
    stopTimelineAnimation();

    const audio = audioRef.current;
    audio.pause();
    setIsPlaying(false);
    setCoverLoaded(false);

    // Make sure the playlist row for the new song is actually rendered
    // (mirrors the lazy-loaded playlist behaviour from player.js).
    if (newIndex >= renderedCountRef.current) {
      const target = Math.min(q.length, newIndex + PLAYLIST_BATCH_SIZE);
      renderedCountRef.current = target;
      setRenderedCount(target);
    }

    resetTimeline();

    // IMPORTANT (same as original): set src + load() immediately so
    // browser metadata (duration) is available before Play is pressed.
    audio.src = song.streamUrl;
    audio.load();

    if (!autoplay) return;

    audio
      .play()
      .then(() => {
        if (thisLoad !== trackLoadTokenRef.current) return;
      })
      .catch((error) => {
        console.warn("Playback failed:", error);
        setIsPlaying(false);
      });
  }

  // -----------------------------------------------------
  // Play / Pause
  // -----------------------------------------------------
  async function togglePlayback() {
    const q = queueRef.current;
    if (!q.length) return;

    userStartedPlaybackRef.current = true;
    const audio = audioRef.current;

    if (audio.paused) {
      try {
        await audio.play();
      } catch (error) {
        console.warn("Could not play song:", error);
        // Current stream failed -> try the next song.
        if (q.length > 1) {
          loadTrack(currentIndexRef.current + 1, { autoplay: true });
        }
      }
    } else {
      audio.pause();
    }
  }

  function nextSong() {
    if (!queueRef.current.length) return;
    const shouldPlay = !audioRef.current.paused;
    loadTrack(currentIndexRef.current + 1, { autoplay: shouldPlay });
  }

  function previousSong() {
    if (!queueRef.current.length) return;
    const audio = audioRef.current;

    // If more than 3s into the song, restart it instead of going back.
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      updateTimeline();
      return;
    }

    const shouldPlay = !audio.paused;
    loadTrack(currentIndexRef.current - 1, { autoplay: shouldPlay });
  }

  function toggleFavorite() {
    const song = getCurrentSong();
    const key = songStorageKey(song);
    if (!key) return;

    setFavoriteKeys((current) => {
      const alreadySaved = current.includes(key);
      const next = alreadySaved
        ? current.filter((item) => item !== key)
        : [...current, key];

      try {
        localStorage.setItem("retroraag:favorites", JSON.stringify(next));
      } catch {
        // The heart still works for this session if storage is unavailable.
      }

      return next;
    });
  }

  function reshuffleUpcoming() {
    const q = queueRef.current;
    if (q.length < 2) return;

    const activeIndex = currentIndexRef.current;
    const currentSong = q[activeIndex];
    const upcoming = q.filter((_, index) => index !== activeIndex);
    const nextQueue = [currentSong, ...shuffle(upcoming)];

    // Keep the current audio untouched; only reorder what comes next.
    queueRef.current = nextQueue;
    currentIndexRef.current = 0;
    renderedCountRef.current = Math.min(
      nextQueue.length,
      Math.max(renderedCountRef.current, PLAYLIST_BATCH_SIZE)
    );

    setQueue(nextQueue);
    setCurrentIndex(0);
    setRenderedCount(renderedCountRef.current);
  }

  function playSomethingOld() {
    const q = queueRef.current;
    if (!q.length) return;

    userStartedPlaybackRef.current = true;

    let randomIndex = 0;

    if (q.length > 1) {
      // Always try to choose a different song from the one currently playing.
      do {
        randomIndex = Math.floor(Math.random() * q.length);
      } while (randomIndex === currentIndexRef.current);
    }

    setPlaylistOpenState(false);
    loadTrack(randomIndex, { autoplay: true });
  }

  function handleVolumeInput(event) {
    const nextVolume = Number(event.currentTarget.value);
    if (!Number.isFinite(nextVolume)) return;
    setVolume(Math.max(0, Math.min(1, nextVolume)));
  }

  function selectSong(index) {
    const q = queueRef.current;
    if (!Number.isInteger(index) || index < 0 || index >= q.length) return;

    userStartedPlaybackRef.current = true;
    loadTrack(index, { autoplay: true });

    if (window.matchMedia("(max-width: 760px)").matches) {
      setPlaylistOpenState(false);
    }
  }

  // -----------------------------------------------------
  // Playlist open / close
  // -----------------------------------------------------
  function setPlaylistOpen(open) {
    setPlaylistOpenState(Boolean(open));
  }

  useEffect(() => {
    if (!playlistOpen) return;
    requestAnimationFrame(() => {
      const selected = playlistListRef.current?.querySelector('[aria-selected="true"]');
      selected?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, [playlistOpen]);

  // -----------------------------------------------------
  // Playlist lazy loading
  // -----------------------------------------------------
  function appendPlaylistBatch(target) {
    const q = queueRef.current;
    const nextTarget = target ?? renderedCountRef.current + PLAYLIST_BATCH_SIZE;
    const end = Math.min(q.length, nextTarget);
    if (renderedCountRef.current >= end) return;
    renderedCountRef.current = end;
    setRenderedCount(end);
  }

  function handlePlaylistScroll() {
    const list = playlistListRef.current;
    if (!list) return;
    const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
    if (distanceFromBottom < 180 && renderedCountRef.current < queueRef.current.length) {
      appendPlaylistBatch();
    }
  }

  // -----------------------------------------------------
  // Load songs from backend
  // -----------------------------------------------------
  async function loadSongs() {
    try {
      const response = await fetch("/api/radio/songs?compact=1", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Radio API error: ${response.status}`);
      }

      const data = await response.json();
      const playable = playableSongs(Array.isArray(data) ? data : []);

      if (!playable.length) {
        throw new Error("No playable songs found");
      }

      const shuffled = shuffle(playable);

      queueRef.current = shuffled;
      currentIndexRef.current = 0;
      renderedCountRef.current = Math.min(shuffled.length, PLAYLIST_BATCH_SIZE);

      setQueue(shuffled);
      setCurrentIndex(0);
      setRenderedCount(renderedCountRef.current);
      setControlsEnabled(true);
      setLoadFailed(false);

      // First song's metadata is loaded right away (not autoplaying),
      // same fix as the original player.js.
      loadTrack(0, { autoplay: false });
    } catch (error) {
      console.error("RetroRaag error:", error);
      setLoadFailed(true);
    }
  }

  // -----------------------------------------------------
  // Seek bar
  // -----------------------------------------------------
  function handleSeekInput() {
    const seekBar = seekBarRef.current;
    const audio = audioRef.current;
    const duration = getDuration();
    const requestedTime = Number(seekBar.value);

    if (duration <= 0 || !Number.isFinite(requestedTime)) return;

    audio.currentTime = Math.max(0, Math.min(requestedTime, duration));
    updateTimeline();
    syncMediaSessionPosition(true);
  }

  // -----------------------------------------------------
  // <audio> element event wiring (mount once)
  // -----------------------------------------------------
  useEffect(() => {
    const audio = audioRef.current;

    function handlePlay() {
      setIsPlaying(true);
      setMediaSessionPlaybackState("playing");
      syncMediaSessionPosition(true);
      startTimelineAnimation();
    }

    function handlePause() {
      setIsPlaying(false);
      setMediaSessionPlaybackState("paused");
      stopTimelineAnimation();
      updateTimeline();
      syncMediaSessionPosition(true);
    }

    function handleEnded() {
      stopTimelineAnimation();
      loadTrack(currentIndexRef.current + 1, { autoplay: true });
    }

    function handleError() {
      // Metadata preload failed and user hasn't started playback yet ->
      // don't auto-skip.
      if (!userStartedPlaybackRef.current || queueRef.current.length <= 1) return;
      console.warn("Skipping unavailable stream:", getCurrentSong()?.name);
      loadTrack(currentIndexRef.current + 1, { autoplay: true });
    }

    audio.addEventListener("loadedmetadata", updateTimeline);
    audio.addEventListener("durationchange", updateTimeline);
    audio.addEventListener("canplay", updateTimeline);
    audio.addEventListener("timeupdate", updateTimeline);
    audio.addEventListener("seeking", updateTimeline);
    audio.addEventListener("seeked", updateTimeline);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("loadedmetadata", updateTimeline);
      audio.removeEventListener("durationchange", updateTimeline);
      audio.removeEventListener("canplay", updateTimeline);
      audio.removeEventListener("timeupdate", updateTimeline);
      audio.removeEventListener("seeking", updateTimeline);
      audio.removeEventListener("seeked", updateTimeline);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------------------------------
  // Media Session action handlers
  // Supported devices can control RetroRaag from lock screen,
  // notification shade, headphones, keyboard media keys, etc.
  // -----------------------------------------------------
  useEffect(() => {
    if (!hasMediaSession()) return undefined;

    const mediaSession = navigator.mediaSession;
    const registeredActions = [];

    function registerAction(action, handler) {
      try {
        mediaSession.setActionHandler(action, handler);
        registeredActions.push(action);
      } catch {
        // Unsupported action on this browser — safely ignore it.
      }
    }

    registerAction("play", async () => {
      const audio = audioRef.current;
      if (!audio) return;

      userStartedPlaybackRef.current = true;

      try {
        await audio.play();
      } catch (error) {
        console.warn("Media Session play failed:", error);
      }
    });

    registerAction("pause", () => {
      audioRef.current?.pause();
    });

    registerAction("previoustrack", () => {
      previousSong();
    });

    registerAction("nexttrack", () => {
      nextSong();
    });

    registerAction("seekbackward", (details) => {
      const audio = audioRef.current;
      if (!audio) return;

      const offset =
        Number.isFinite(details?.seekOffset) && details.seekOffset > 0
          ? details.seekOffset
          : 10;

      audio.currentTime = Math.max(0, audio.currentTime - offset);
      updateTimeline();
      syncMediaSessionPosition(true);
    });

    registerAction("seekforward", (details) => {
      const audio = audioRef.current;
      if (!audio) return;

      const duration = getDuration();
      if (!Number.isFinite(duration) || duration <= 0) return;

      const offset =
        Number.isFinite(details?.seekOffset) && details.seekOffset > 0
          ? details.seekOffset
          : 10;

      audio.currentTime = Math.min(duration, audio.currentTime + offset);
      updateTimeline();
      syncMediaSessionPosition(true);
    });

    registerAction("seekto", (details) => {
      const audio = audioRef.current;
      if (!audio || !Number.isFinite(details?.seekTime)) return;

      const duration = getDuration();
      if (!Number.isFinite(duration) || duration <= 0) return;

      const target = Math.max(0, Math.min(details.seekTime, duration));

      if (details.fastSeek && typeof audio.fastSeek === "function") {
        audio.fastSeek(target);
      } else {
        audio.currentTime = target;
      }

      updateTimeline();
      syncMediaSessionPosition(true);
    });

    registerAction("stop", () => {
      const audio = audioRef.current;
      if (!audio) return;

      audio.pause();
      audio.currentTime = 0;
      setMediaSessionPlaybackState("none");
      resetMediaSessionPosition();
      updateTimeline();
    });

    return () => {
      registeredActions.forEach((action) => {
        try {
          mediaSession.setActionHandler(action, null);
        } catch {
          // Ignore unsupported cleanup calls.
        }
      });
    };

    // These handlers intentionally use refs so they always act on the
    // latest queue/current song without re-registering every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------------------------------
  // Clock
  // -----------------------------------------------------
  useEffect(() => {
    function updateClock() {
      setLocalTime(
        new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date())
      );
    }
    updateClock();
    const id = setInterval(updateClock, 1000);
    return () => clearInterval(id);
  }, []);

  // -----------------------------------------------------
  // Active users (SSE with fetch fallback)
  // -----------------------------------------------------
  useEffect(() => {
    let source;

    function applyCount(data) {
      const count = Number(data.activeUsers);
      setActiveUsers(Number.isFinite(count) ? count.toLocaleString() : "—");
    }

    if ("EventSource" in window) {
      source = new EventSource("/api/active-users/stream");
      source.onmessage = (event) => {
        try {
          applyCount(JSON.parse(event.data));
        } catch {
          // Keep previous count
        }
      };
    } else {
      fetch("/api/active-users")
        .then((response) => response.json())
        .then(applyCount)
        .catch(() => setActiveUsers("—"));
    }

    return () => source?.close();
  }, []);

  // -----------------------------------------------------
  // Keyboard shortcuts
  // -----------------------------------------------------
  useEffect(() => {
    function handleKeydown(event) {
      const target = event.target;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;

      if (event.key === "Escape" && playlistOpenRef.current) {
        setPlaylistOpenState(false);
        queueButtonRef.current?.focus();
        return;
      }

      if (typing || !queueRef.current.length) return;

      if (event.code === "Space") {
        event.preventDefault();
        togglePlayback();
      }

      if (event.code === "ArrowRight") nextSong();
      if (event.code === "ArrowLeft") previousSong();
    }

    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------------------------------
  // Click outside closes playlist
  // -----------------------------------------------------
  useEffect(() => {
    function handlePointerDown(event) {
      if (!playlistOpenRef.current) return;

      const panel = playlistPanelRef.current;
      const btn = queueButtonRef.current;
      if (!panel || !btn) return;

      if (!panel.contains(event.target) && !btn.contains(event.target)) {
        setPlaylistOpenState(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  // -----------------------------------------------------
  // Initial song fetch (runs once on mount)
  // -----------------------------------------------------
  useEffect(() => {
    loadSongs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------------------------------
  // Render
  // -----------------------------------------------------
  const activeSong = queue[currentIndex] || null;
  const activeFavorite = activeSong
    ? favoriteKeys.includes(songStorageKey(activeSong))
    : false;

  const songName = loadFailed
    ? "Could not load RetroRaag"
    : activeSong?.name || "Loading RetroRaag…";

  const songArtistLine = loadFailed
    ? "Please try again"
    : activeSong
    ? artistText(activeSong)
    : "Bollywood classics";

  return (
    <main className="radio-shell" aria-label="RetroRaag Bollywood radio">
      <picture className="scene" aria-hidden="true">
        {/* Ultra-wide monitors (21:9 and beyond) */}
        <source media="(min-aspect-ratio: 2/1)" srcSet="/images/retroraag_ultrawide_4k.png" />
        {/* Standard desktops / large monitors (16:9) */}
        <source media="(min-aspect-ratio: 7/4)" srcSet="/images/retroraag_desktop_4k.png" />
        {/* Laptops (16:10) */}
        <source media="(min-aspect-ratio: 3/2)" srcSet="/images/retroraag_laptop_4k.png" />
        {/* Tablets / small landscape windows (4:3) */}
        <source media="(min-aspect-ratio: 1/1)" srcSet="/images/retroraag_tablet_4k.png" />
        {/* Phones / any portrait orientation — also the fallback <img> */}
        <img
          className="scene-image"
          src="/images/retroraag_mobile_4k.png"
          alt=""
          width="941"
          height="1672"
          fetchPriority="high"
          decoding="async"
          draggable="false"
        />
      </picture>

      <div className="sun-wash" aria-hidden="true"></div>
      <div className="grain" aria-hidden="true"></div>
      <div className="vignette" aria-hidden="true"></div>

      <header className="status-strip" aria-label="RetroRaag status">
        <div className="status-time" aria-label="Local time">
          {localTime}
        </div>

        <div className="active-status" aria-live="polite">
          <span className="live-dot" aria-hidden="true"></span>
          <strong>{activeUsers}</strong>
          <span className="active-label">listening now</span>
        </div>

        <div className="nostalgia-message" aria-hidden="true">
          <span
            className="nostalgia-message-text"
            key={nostalgiaMessageIndex}
          >
            {NOSTALGIA_MESSAGES[nostalgiaMessageIndex]}
          </span>
        </div>
      </header>

      <div className="hero-title">
        <button
          className={`brand-reveal${brandActive ? " is-active" : ""}`}
          type="button"
          aria-label="रेट्रो राग"
          aria-pressed={brandActive}
          onPointerUp={(event) => {
            // Desktop/laptop mouse keeps the hover-only behavior.
            // Phones, tablets, pens and other touch-capable pointers can tap.
            if (event.pointerType !== "mouse") {
              setBrandActive((active) => !active);
            }
          }}
        >
          <span className="brand-stage" aria-hidden="true">
            <span className="brand-retro brand-retro-base">रेट्रो</span>
            <span className="brand-retro brand-retro-top">रेट्रो</span>
            <span className="brand-retro brand-retro-bottom">रेट्रो</span>
            <span className="brand-raag">राग</span>
          </span>
          <span className="sr-only">रेट्रो राग</span>
        </button>
      </div>

      <section className="player-wrap" aria-label="Music player">
        <section
          className={`playlist-popover${playlistOpen ? " is-open" : ""}`}
          id="playlistPanel"
          aria-label="Song list"
          aria-hidden={String(!playlistOpen)}
          ref={playlistPanelRef}
        >
          <div className="playlist-head">
            <div>
              <span className="playlist-kicker">रेट्रो राग</span>
              <h2>Up next</h2>
            </div>

            <button
              className="playlist-close"
              type="button"
              aria-label="Close song list"
              onClick={() => setPlaylistOpen(false)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>

          <div
            className="playlist-list"
            role="listbox"
            aria-label="Songs"
            ref={playlistListRef}
            onScroll={handlePlaylistScroll}
          >
            {queue.slice(0, renderedCount).map((song, index) => (
              <button
                key={song.id ?? `${song.name}-${index}`}
                type="button"
                className="playlist-row"
                role="option"
                aria-selected={index === currentIndex}
                onClick={() => selectSong(index)}
              >
                <span className="playlist-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="playlist-title">{song.name}</span>
                <span className="playlist-artist">{artistText(song)}</span>
              </button>
            ))}
          </div>
        </section>

        <div className={`player${isPlaying ? " is-playing" : ""}`} id="playerPanel">
          <div className="song-area" aria-live="polite" aria-atomic="true">
            <div className="cover-shell" aria-hidden="true">
              <img
                className={`song-cover${coverLoaded ? " is-loaded" : ""}`}
                alt=""
                src={activeSong?.image || undefined}
                onLoad={() => setCoverLoaded(true)}
                onError={() => setCoverLoaded(false)}
              />
              <div className="cover-equalizer">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>

            <div className="song-copy">
              <h1 className="song-title">{songName}</h1>
              <p className="song-artist">{songArtistLine}</p>

              <div className="track-timeline">
                <input
                  className="seek-bar"
                  type="range"
                  min="0"
                  max="100"
                  defaultValue="0"
                  step="0.1"
                  aria-label="Seek through song"
                  disabled
                  ref={seekBarRef}
                  onInput={handleSeekInput}
                />

                <div className="track-time" aria-label="Song playback time">
                  <span ref={currentTimeLabelRef}>0:00</span>
                  <span className="time-separator">/</span>
                  <span ref={totalDurationLabelRef}>0:00</span>
                </div>
              </div>

              <div className="player-tools" aria-label="Song options">
                <button
                  className={`mini-tool favorite-tool${activeFavorite ? " is-active" : ""}`}
                  type="button"
                  aria-label={activeFavorite ? "Remove from favorites" : "Add to favorites"}
                  aria-pressed={activeFavorite}
                  disabled={!controlsEnabled}
                  onClick={toggleFavorite}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 20.3 4.15 12.9A5.15 5.15 0 0 1 11.4 5.6L12 6.2l.6-.6a5.15 5.15 0 0 1 7.25 7.3L12 20.3Z" />
                  </svg>
                </button>

                <button
                  className="mini-tool shuffle-tool"
                  type="button"
                  aria-label="Shuffle upcoming songs"
                  disabled={!controlsEnabled}
                  onClick={reshuffleUpcoming}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M16.5 4.75H20v3.5" />
                    <path d="m20 4.75-4.6 4.6a4 4 0 0 1-2.83 1.17H11.4" />
                    <path d="M4 7h2.15a4 4 0 0 1 2.83 1.17l6.44 6.45A4 4 0 0 0 18.25 15.8H20" />
                    <path d="M16.5 12.3H20v3.5" />
                    <path d="m20 15.8-3.5-3.5" />
                    <path d="M4 16.25h2.15a4 4 0 0 0 2.83-1.17l.82-.82" />
                  </svg>
                </button>

                <div className={`volume-tool${volumeOpen ? " is-open" : ""}`}>
                  <button
                    className="mini-tool volume-button"
                    type="button"
                    aria-label="Volume"
                    aria-expanded={volumeOpen}
                    disabled={!controlsEnabled}
                    onClick={() => setVolumeOpen((open) => !open)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 10v4h3.2L12 18V6L7.2 10H4Z" />
                      <path d="M15.2 9.1a4 4 0 0 1 0 5.8" />
                      <path d="M17.7 6.8a7.2 7.2 0 0 1 0 10.4" />
                    </svg>
                  </button>

                  <div className="volume-slider-shell">
                    <input
                      className="volume-slider"
                      type="range"
                      min="0"
                      max="1"
                      step="0.02"
                      value={volume}
                      aria-label="Volume level"
                      onChange={handleVolumeInput}
                      onInput={handleVolumeInput}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="controls" aria-label="Playback controls">
            <button
              className="control-button secondary"
              type="button"
              aria-label="Previous song"
              disabled={!controlsEnabled}
              onClick={previousSong}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6.5 5a1 1 0 0 1 1 1v12a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1Z" />
                <path d="M19.02 5.6a1 1 0 0 1 .48.85v11.1a1 1 0 0 1-1.53.83L8.94 12.83a1 1 0 0 1 0-1.66l9.03-5.55a1 1 0 0 1 1.05 0Z" />
              </svg>
            </button>

            <button
              className="control-button play"
              type="button"
              aria-label={isPlaying ? "Pause" : "Play"}
              disabled={!controlsEnabled}
              onClick={togglePlayback}
            >
              <span className="play-glow" aria-hidden="true"></span>
              <svg className="play-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 5.3a1.3 1.3 0 0 1 1.98-1.1l9.15 5.7a1.3 1.3 0 0 1 0 2.2l-9.15 5.7A1.3 1.3 0 0 1 9 16.8V5.3Z" />
              </svg>
              <svg className="pause-icon" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="6.6" y="5" width="4" height="14" rx="1.6" />
                <rect x="13.4" y="5" width="4" height="14" rx="1.6" />
              </svg>
            </button>

            <button
              className="control-button secondary"
              type="button"
              aria-label="Next song"
              disabled={!controlsEnabled}
              onClick={nextSong}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M17.5 5a1 1 0 0 0-1 1v12a1 1 0 1 0 2 0V6a1 1 0 0 0-1-1Z" />
                <path d="M4.98 5.6a1 1 0 0 0-.48.85v11.1a1 1 0 0 0 1.53.83l9.03-5.55a1 1 0 0 0 0-1.66L6.03 5.6a1 1 0 0 0-1.05 0Z" />
              </svg>
            </button>

            <button
              className="control-button secondary queue-button"
              type="button"
              aria-label={playlistOpen ? "Hide song list" : "Show song list"}
              aria-controls="playlistPanel"
              aria-expanded={String(playlistOpen)}
              disabled={!controlsEnabled}
              ref={queueButtonRef}
              onClick={() => setPlaylistOpen(!playlistOpen)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3.75 6.5h10.5" />
                <path d="M3.75 12h10.5" />
                <path d="M3.75 17.5h6" />
                <circle cx="18" cy="17.5" r="2.35" />
                <path d="M20.35 17.5V6.6l-4.1 1.05v9.85" />
              </svg>
            </button>
          </div>
        </div>

        <button
          className="nostalgia-button"
          type="button"
          disabled={!controlsEnabled}
          onClick={playSomethingOld}
          aria-label="Play a random old song"
        >
          <span className="nostalgia-radio" aria-hidden="true">📻</span>
          <span>कुछ पुराना सुनाओ</span>
        </button>
      </section>

      <audio ref={audioRef} preload="metadata"></audio>
    </main>
  );
}