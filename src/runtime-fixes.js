(() => {
  let retryTimer = null;
  const MAX_HISTORY = 80;

  function isSupportedImageUrl(value) {
    const url = String(value || '');
    const imageHost = /(^https:\/\/)?(i\.redd\.it|preview\.redd\.it|external-preview\.redd\.it|i\.imgur\.com|preview\.redd\.media|meme-api\.com)/i.test(url);
    const imageExtension = /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url);
    return /^https:\/\//i.test(url) && (imageHost || imageExtension);
  }

  function trimHistory() {
    state.memeHistory.urls = uniqueStrings(state.memeHistory.urls).slice(-MAX_HISTORY);
    state.memeHistory.postIds = uniqueStrings(state.memeHistory.postIds).filter(Boolean).slice(-MAX_HISTORY);
    saveMemeHistory();
  }

  trimHistory();

  isSafeNewMeme = function patchedSafeNewMeme(meme) {
    if (!meme?.url || meme.nsfw || meme.spoiler) return false;
    const allowedSources = (state.config.meme.sources || ['deutschememes', 'ich_iel'])
      .map((source) => String(source).toLowerCase());
    if (!allowedSources.includes(String(meme.subreddit || '').toLowerCase())) return false;
    if (state.memeHistory.urls.includes(meme.url)) return false;
    const postId = extractPostId(meme);
    if (postId && state.memeHistory.postIds.includes(postId)) return false;
    if (!isSupportedImageUrl(meme.url)) return false;
    const searchable = `${meme.title || ''} ${meme.postLink || ''}`.toLowerCase();
    return !(state.config.meme.blockedKeywords || []).some((word) => searchable.includes(String(word).toLowerCase()));
  };

  const originalDisplayMeme = displayMeme;
  displayMeme = function patchedDisplayMeme(meme) {
    const image = new Image();
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';

    image.onload = () => {
      originalDisplayMeme(meme);
      trimHistory();
    };

    image.onerror = () => {
      console.warn(`Defektes Meme übersprungen: ${meme?.url || 'ohne URL'}`);
      state.memeLoading = false;
      setTimeout(() => loadMeme(false), 150);
    };

    image.src = meme.url;
  };

  refillMemePool = async function patchedRefillMemePool(forceRefresh = false) {
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Meme-Pool Zeitüberschreitung nach 20 Sekunden')), 20000);
    });
    const result = await Promise.race([
      window.dashboardAPI.getMemePool(forceRefresh),
      timeout
    ]);
    let candidates = Array.isArray(result?.memes) ? result.memes.filter(isSafeNewMeme) : [];

    if (!candidates.length && (state.memeHistory.urls.length || state.memeHistory.postIds.length)) {
      state.memeHistory = { urls: [], postIds: [] };
      saveMemeHistory();
      candidates = Array.isArray(result?.memes) ? result.memes.filter(isSafeNewMeme) : [];
    }

    state.memePool = shuffle(candidates);
    state.memePoolDate = getPoolDateKey();
    return state.memePool.length;
  };

  const originalLoad = loadMeme;
  loadMeme = async function patchedLoadMeme(forceRefresh = false) {
    await originalLoad(forceRefresh);
    if (state.hasVisibleMeme) {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      return;
    }

    elements.memeContent.className = 'meme-content fallback-meme';
    elements.memeContent.innerHTML = '<div><div class="fallback-emoji">🔄</div><h2>Neue Memes werden gesucht</h2><p>Die Quellen werden automatisch erneut abgefragt.</p></div>';

    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      state.memeLoading = false;
      loadMeme(true);
    }, 15000);
  };

  setTimeout(() => {
    if (!state.hasVisibleMeme) {
      state.memeLoading = false;
      loadMeme(true);
    }
  }, 1500);

  window.addEventListener('beforeunload', () => {
    if (retryTimer) clearTimeout(retryTimer);
  });
})();
