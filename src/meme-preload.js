(() => {
  const api = window.dashboardAPI;
  if (!api?.getMemePool) return;

  const originalGetMemePool = api.getMemePool.bind(api);
  const preloaded = new Set();
  let queue = [];
  let active = 0;
  const maxConcurrent = 3;

  function isImageUrl(url) {
    return typeof url === 'string' && /^https:\/\//i.test(url);
  }

  function pump() {
    while (active < maxConcurrent && queue.length) {
      const url = queue.shift();
      if (!url || preloaded.has(url)) continue;
      preloaded.add(url);
      active += 1;
      const image = new Image();
      image.decoding = 'async';
      image.referrerPolicy = 'no-referrer';
      const done = () => {
        active -= 1;
        pump();
      };
      image.onload = done;
      image.onerror = done;
      image.src = url;
    }
  }

  function schedulePreload(memes) {
    const urls = (Array.isArray(memes) ? memes : [])
      .map((meme) => meme?.url)
      .filter(isImageUrl)
      .filter((url) => !preloaded.has(url));

    queue.push(...urls.slice(0, 24));
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(pump, { timeout: 1500 });
    } else {
      setTimeout(pump, 100);
    }
  }

  api.getMemePool = async (forceRefresh = false) => {
    const result = await originalGetMemePool(forceRefresh);
    schedulePreload(result?.memes);
    return result;
  };
})();
