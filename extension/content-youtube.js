// Life Tracker — YouTube watch logger.
// Accumulates actual playback seconds for each video. Reports PERIODICALLY while
// watching (every ~15s), not only at teardown — in MV3 a sendMessage fired during
// pagehide/navigation often never reaches a sleeping service worker, which is why
// watches used to go unlogged. Each session carries a stable key so the background
// merges the repeated reports into one growing 'youtube' log.

(() => {
  let watch = null; // { videoId, title, start, secs, lastT, key, sent }
  const REPORT_EVERY = 15; // seconds of new playback between reports

  function videoIdFromUrl() {
    try { return new URL(location.href).searchParams.get('v'); } catch { return null; }
  }

  function titleNow() {
    const el = document.querySelector('h1.ytd-watch-metadata, h1.title');
    return (el && el.textContent.trim()) || document.title.replace(/ - YouTube$/, '');
  }

  function send(final) {
    if (!watch || watch.secs < 5) { if (final) watch = null; return; }
    // only emit when playback grew enough since last report (or at teardown)
    if (!final && watch.secs - watch.sent < REPORT_EVERY) return;
    watch.sent = watch.secs;
    try {
      chrome.runtime.sendMessage({
        kind: 'yt-watch',
        key: watch.key,
        videoId: watch.videoId,
        title: watch.title,
        start: watch.start,
        secs: Math.round(watch.secs),
      });
    } catch { /* extension reloaded */ }
    if (final) watch = null;
  }

  function tick() {
    const id = videoIdFromUrl();
    const video = document.querySelector('video');
    if (watch && id !== watch.videoId) send(true); // switched videos → finalize old
    if (!id || !video) return;
    if (!watch) watch = { videoId: id, title: titleNow(), start: Date.now(), secs: 0, lastT: video.currentTime, key: id + '|' + Date.now(), sent: 0 };
    watch.title = titleNow() || watch.title;
    if (!video.paused && !video.ended) {
      const dt = video.currentTime - watch.lastT;
      if (dt > 0 && dt < 3) watch.secs += dt; // real playback, not a seek
    }
    watch.lastT = video.currentTime;
    send(false); // periodic report (self-throttles to REPORT_EVERY)
  }

  setInterval(tick, 1000);
  window.addEventListener('yt-navigate-start', () => send(true));
  window.addEventListener('pagehide', () => send(true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) send(false); });
})();
