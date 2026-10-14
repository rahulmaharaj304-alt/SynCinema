export const ytId = (u) => u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/)?.[1];
export const vimeoId = (u) => u.match(/vimeo\.com\/(?:video\/)?(\d+)/)?.[1];
// any link works: known platforms get full sync, media files/streams get full sync, everything else embeds
export const detect = (u) => {
  if (ytId(u)) return 'youtube';
  if (vimeoId(u)) return 'vimeo';
  const p = u.split('?')[0].toLowerCase();
  if (p.endsWith('.m3u8')) return 'hls';
  if (p.endsWith('.mpd')) return 'dash';
  if (/\.(mp4|webm|ogv|ogg|mov|m4v|mkv|mp3|m4a|wav|flac)$/.test(p)) return 'file';
  return 'embed';
};
const cache = {};
export const loadScript = (src) => (cache[src] ||= new Promise((res, rej) => {
  const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.append(s);
}));
export const ytReady = () => window.YT?.Player ? Promise.resolve()
  : new Promise((r) => { window.onYouTubeIframeAPIReady = r; loadScript('https://www.youtube.com/iframe_api'); });
// turn share links into embeddable players (unsynced embeds)
export const toEmbed = (src) => {
  try {
    const u = new URL(src);
    if (u.hostname === 'open.spotify.com' && !u.pathname.startsWith('/embed')) u.pathname = '/embed' + u.pathname;
    else if (u.hostname.endsWith('soundcloud.com') && !u.hostname.startsWith('w.')) return 'https://w.soundcloud.com/player/?auto_play=true&url=' + encodeURIComponent(src);
    else if (/dailymotion\.com$/.test(u.hostname) && u.pathname.startsWith('/video/')) u.pathname = '/embed' + u.pathname;
    return u.href;
  } catch { return src; }
};
