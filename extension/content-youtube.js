// Life Tracker — YouTube watch logger.
// Accumulates actual playback seconds for each video and reports the watch
// when you navigate away, close the tab, or switch videos.

(() => {
  let watch = null; // { videoId, title, start, secs, lastT }

  function videoIdFromUrl() {
    try { return new URL(location.href).searchParams.get('v'); } catch { return null; }
  }

  function titleNow() {
    const el = document.querySelector('h1.ytd-watch-metadata, h1.title');
    return (el && el.textContent.trim()) || document.title.replace(/ - YouTube$/, '');
  }

  function report() {
    if (!watch || watch.secs < 5) { watch = null; return; }
    try {
      chrome.runtime.sendMessage({
        kind: 'yt-watch',
        videoId: watch.videoId,
        title: watch.title,
        start: watch.start,
        secs: watch.secs,
      });
    } catch { /* extension reloaded */ }
    watch = null;
  }

  function tick() {
    const id = videoIdFromUrl();
    const video = document.querySelector('video');
    if (watch && id !== watch.videoId) report(); // switched videos
    if (!id || !video) return;
    if (!watch) watch = { videoId: id, title: titleNow(), start: Date.now(), secs: 0, lastT: video.currentTime };
    watch.title = titleNow() || watch.title;
    if (!video.paused && !video.ended) {
      const dt = video.currentTime - watch.lastT;
      if (dt > 0 && dt < 3) watch.secs += dt; // real playback, not a seek
    }
    watch.lastT = video.currentTime;
  }

  setInterval(tick, 1000);
  window.addEventListener('yt-navigate-start', report);
  window.addEventListener('pagehide', report);
  document.addEventListener('visibilitychange', () => { if (document.hidden) report(); });
})();
