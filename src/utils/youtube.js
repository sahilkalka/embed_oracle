// src/utils/youtube.js

class YouTubeUrlError extends Error {
  constructor() {
    super('Enter a valid YouTube video link or iframe embed code.');
    this.name = 'YouTubeUrlError';
  }
}

function formatYouTubeEmbedUrl(value) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string') throw new YouTubeUrlError();
  let source = value.trim();
  if (!source) return '';
  if (source.startsWith('<')) {
    const iframe = source.match(/^<iframe\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>\s*<\/iframe>\s*$/i);
    if (!iframe) throw new YouTubeUrlError();
    source = iframe[2].replace(/&amp;/gi, '&');
  }
  let url;
  try {
    url = new URL(source);
  } catch (error) {
    if (error instanceof TypeError || error.code === 'ERR_INVALID_URL') throw new YouTubeUrlError();
    throw error;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) {
    throw new YouTubeUrlError();
  }
  const host = url.hostname.toLowerCase();
  let videoId;
  if (host === 'youtu.be' || host === 'www.youtu.be') {
    videoId = url.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
  } else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)) {
    videoId = url.pathname === '/watch' ? url.searchParams.get('v')
      : url.pathname.match(/^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
  }
  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new YouTubeUrlError();
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`;
}

module.exports = {
  formatYouTubeEmbedUrl,
  YouTubeUrlError
};
