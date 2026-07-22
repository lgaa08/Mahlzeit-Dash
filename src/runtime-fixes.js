(() => {
  let retryTimer = null;
  let manualRefreshRunning = false;
  const MAX_HISTORY = 120;
  const RECENT_GUARD = 24;

  function normalizeUrl(value) {
    try {
      const url = new URL(String(value || ''));
      url.hash = '';
      url.searchParams.delete('width');
      url.searchParams.delete('format');
      url.searchParams.delete('auto');
      return url.toString();
    } catch (_error) {
      return String(value || '');
    }
  }

  function isSupportedImageUrl(value) {
    const url = String(value || '');
    const imageHost = /(^https:\/\/)?(i\.redd\.it|preview\.redd\.it|external-preview\.redd\.it|i\.imgur\.com|preview\.redd\.media|meme-api\.com)/i.test(url);
    const imageExtension = /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url);
    return /^https:\/\//i.test(url) && (imageHost || imageExtension);
  }

  function trimHistory() {
    state.memeHistory.urls = uniqueStrings(state.memeHistory.urls.map(normalizeUrl)).slice(-MAX_HISTORY);
    state.memeHistory.postIds = uniqueStrings(state.memeHistory.postIds).filter(Boolean).slice(-MAX_HISTORY);
    saveMemeHistory();
  }

  function containsBlockedKeyword(text, keyword) {
    const escaped = String(keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!escaped) return false;
    if (/^[a-zäöüß0-9]+$/i.test(keyword)) {
      return new RegExp(`(^|[^a-zäöüß0-9])${escaped}([^a-zäöüß0-9]|$)`, 'i').test(text);
    }
    return text.includes(String(keyword).toLowerCase());
  }

  function getMemeKey(meme) {
    return extractPostId(meme) || normalizeUrl(meme?.url);
  }

  function isRecentlyShown(meme) {
    const recentUrls = state.memeHistory.urls.slice(-RECENT_GUARD);
    const recentIds = state.memeHistory.postIds.slice(-RECENT_GUARD);
    const url = normalizeUrl(meme?.url);
    const postId = extractPostId(meme);
    return recentUrls.includes(url) || Boolean(postId && recentIds.includes(postId));
  }

  trimHistory();

  isSafeNewMeme = function patchedSafeNewMeme(meme) {
    if (!meme?.url || meme.nsfw || meme.spoiler || !isSupportedImageUrl(meme.url)) return false;

    const allowedSources = (state.config.meme.sources || ['deutschememes', 'ich_iel', 'GermanMemes'])
      .map((source) => String(source).toLowerCase());
    if (!allowedSources.includes(String(meme.subreddit || '').toLowerCase())) return false;
    if (isRecentlyShown(meme)) return false;

    const searchable = `${meme.title || ''} ${meme.postLink || ''}`.toLowerCase();
    return !(state.config.meme.blockedKeywords || []).some((word) => containsBlockedKeyword(searchable, String(word).toLowerCase()));
  };

  function rememberMeme(meme) {
    const url = normalizeUrl(meme.url);
    const postId = extractPostId(meme);
    state.memeHistory.urls = uniqueStrings([...state.memeHistory.urls, url]);
    state.memeHistory.postIds = uniqueStrings([...state.memeHistory.postIds, postId]).filter(Boolean);
    trimHistory();
  }

  function preloadImage(meme, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const timer = setTimeout(() => reject(new Error('Bild-Timeout')), timeoutMs);
      image.decoding = 'async';
      image.referrerPolicy = 'no-referrer';
      image.onload = () => {
        clearTimeout(timer);
        resolve(meme);
      };
      image.onerror = () => {
        clearTimeout(timer);
        reject(new Error('Bild nicht ladbar'));
      };
      image.src = meme.url;
    });
  }

  async function showFirstWorkingMeme(candidates) {
    const attempted = new Set();
    while (candidates.length) {
      const meme = candidates.shift();
      const key = getMemeKey(meme);
      if (!key || attempted.has(key) || isRecentlyShown(meme)) continue;
      attempted.add(key);
      try {
        await preloadImage(meme);
        const title = escapeHtml(meme.title || 'Deutsches Meme');
        elements.memeContent.className = 'meme-content meme-switching';
        elements.memeContent.innerHTML = `<img class="meme-image-enter" src="${escapeHtml(meme.url)}" alt="${title}" referrerpolicy="no-referrer"><div class="meme-caption meme-caption-enter">${title}</div>`;
        rememberMeme(meme);
        state.hasVisibleMeme = true;
        return true;
      } catch (error) {
        console.warn(`Meme übersprungen: ${error.message} – ${meme?.url || 'ohne URL'}`);
      }
    }
    return false;
  }

  refillMemePool = async function patchedRefillMemePool(forceRefresh = false) {
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Meme-Pool Zeitüberschreitung nach 20 Sekunden')), 20000);
    });
    const result = await Promise.race([
      window.dashboardAPI.getMemePool(forceRefresh),
      timeout
    ]);

    const seen = new Set();
    const candidates = (Array.isArray(result?.memes) ? result.memes : [])
      .filter(isSafeNewMeme)
      .filter((meme) => {
        const key = getMemeKey(meme);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    state.memePool = shuffle(candidates);
    state.memePoolDate = getPoolDateKey();
    return state.memePool.length;
  };

  async function loadImmediateMeme(forceNetworkRefresh = false) {
    if (manualRefreshRunning || state.sleepMode) return;
    manualRefreshRunning = true;
    state.memeLoading = true;

    const button = document.getElementById('meme-refresh');
    const oldLabel = button?.textContent;
    if (button) {
      button.disabled = true;
      button.textContent = '↻ Lade neues Meme …';
    }

    try {
      state.memePool = state.memePool.filter(isSafeNewMeme);

      if (!state.memePool.length || forceNetworkRefresh) {
        await refillMemePool(forceNetworkRefresh);
      }

      let shown = await showFirstWorkingMeme(state.memePool);
      if (!shown) {
        await refillMemePool(true);
        shown = await showFirstWorkingMeme(state.memePool);
      }

      if (!shown) {
        throw new Error('Keine weiteren unterschiedlichen Memes verfügbar');
      }
    } catch (error) {
      console.warn(`Neues Meme konnte nicht geladen werden: ${error.message}`);
      if (!state.hasVisibleMeme) {
        elements.memeContent.className = 'meme-content fallback-meme';
        elements.memeContent.innerHTML = '<div><div class="fallback-emoji">🔄</div><h2>Neue Memes werden gesucht</h2><p>Automatischer Neuversuch in 15 Sekunden.</p></div>';
      }
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => loadImmediateMeme(true), 15000);
    } finally {
      state.memeLoading = false;
      manualRefreshRunning = false;
      if (button) {
        button.disabled = false;
        button.textContent = oldLabel || '↻ Neues Meme';
      }
    }
  }

  const refreshButton = document.getElementById('meme-refresh');
  refreshButton?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    loadImmediateMeme(false);
  }, true);

  const originalLoad = loadMeme;
  loadMeme = async function patchedLoadMeme(forceRefresh = false) {
    if (state.hasVisibleMeme) {
      await loadImmediateMeme(forceRefresh);
      return;
    }
    await originalLoad(forceRefresh);
    if (!state.hasVisibleMeme && !manualRefreshRunning) await loadImmediateMeme(true);
  };

  setTimeout(() => {
    state.memeLoading = false;
    loadImmediateMeme(true);
  }, 800);

  window.addEventListener('beforeunload', () => {
    if (retryTimer) clearTimeout(retryTimer);
  });
})();