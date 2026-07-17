(() => {
  let retryTimer = null;

  function isSupportedImageUrl(value) {
    const url = String(value || '');
    const imageHost = /(^https:\/\/)?(i\.redd\.it|preview\.redd\.it|external-preview\.redd\.it|i\.imgur\.com|preview\.redd\.media)/i.test(url);
    const imageExtension = /\.(jpe?g|png|webp)(\?|$)/i.test(url);
    return imageHost || imageExtension;
  }

  const originalSafeCheck = isSafeNewMeme;
  isSafeNewMeme = function patchedSafeNewMeme(meme) {
    if (!meme?.url || meme.nsfw || meme.spoiler) return false;
    const allowedSources = (state.config.meme.sources || ['deutschememes']).map((source) => String(source).toLowerCase());
    if (!allowedSources.includes(String(meme.subreddit || '').toLowerCase())) return false;
    if (state.memeHistory.urls.includes(meme.url)) return false;
    const postId = extractPostId(meme);
    if (postId && state.memeHistory.postIds.includes(postId)) return false;
    if (!isSupportedImageUrl(meme.url)) return false;
    const searchable = `${meme.title || ''} ${meme.postLink || ''}`.toLowerCase();
    return !(state.config.meme.blockedKeywords || []).some((word) => searchable.includes(String(word).toLowerCase()));
  };

  const originalRefill = refillMemePool;
  refillMemePool = async function patchedRefillMemePool(forceRefresh = false) {
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Meme-Pool Zeitüberschreitung nach 15 Sekunden')), 15000);
    });
    const result = await Promise.race([
      window.dashboardAPI.getMemePool(forceRefresh),
      timeout
    ]);
    const candidates = Array.isArray(result?.memes) ? result.memes.filter(isSafeNewMeme) : [];
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
    elements.memeContent.innerHTML = '<div><div class="fallback-emoji">⚠️</div><h2>Meme-Quelle nicht erreichbar</h2><p>Reddit oder die Fallback-API hat keine verwendbaren Bilder geliefert.<br>Neuer Versuch in 20 Sekunden.</p></div>';

    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      state.memeLoading = false;
      loadMeme(true);
    }, 20000);
  };

  setTimeout(() => {
    if (!state.hasVisibleMeme) {
      state.memeLoading = false;
      loadMeme(true);
    }
  }, 1000);

  window.addEventListener('beforeunload', () => {
    if (retryTimer) clearTimeout(retryTimer);
  });
})();
