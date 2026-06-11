(function () {
  "use strict";

  const CONFIG = {
    BASE_URL: "http://106.55.249.9:8080/api/v1",
    MAX_VIDEO_FILES: 100,
    UPLOAD_CONCURRENCY: 3,
    RAG_POLL_MS: 3000,
    PROGRESS_SAVE_MS: 5000
  };

  const TOKEN_KEY = "svimvp_auth_token";
  const USER_KEY = "svimvp_current_user";
  const PROGRESS_KEY = "svimvp_android_progress";
  const HISTORY_KEY = "svimvp_search_history";
  const OWNED_RAG_BATCHES_KEY = "svimvp_owned_rag_batches";
  const SEEK_PREVIEW_HIDE_MS = 1500;
  const LONG_PRESS_SPEED_MS = 360;
  const SPEED_LOCK_SWIPE_PX = 70;
  const HOME_SWIPE_TRIGGER_PX = 58;
  const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];
  const DANMAKU_QUEUE_DELAY_MS = 420;
  const DANMAKU_LANE_COUNT = 7;
  const NORMAL_DANMAKU_MAX_PER_SECOND = 3;
  const DANMAKU_BAND_TOP_RPX = 220;
  const DANMAKU_LANE_GAP_RPX = 38;
  const DANMAKU_LANE_COOLDOWN_MS = 2300;
  const LOCAL_DANMAKU_CSV_URL = "assets/danmaku/local-danmaku.csv";
  const LOCAL_DANMAKU_URL = "assets/danmaku/local-danmaku.json";
  const BUILTIN_RAG_BATCH_IDS = [54, 55, 56, 57, 58, 59, 60, 61, 62, 63];

  const ICONS = {
    laugh: "assets/icon/xiao.png",
    sweet: "assets/icon/sweet.png",
    cool: "assets/icon/shaung.png",
    scene: "assets/icon/mingchangmian.png",
    bigLaugh: "assets/icon/bigxiao.png",
    bigSweet: "assets/icon/bigsweet.png",
    bigCool: "assets/icon/bigshuang.png",
    bigScene: "assets/icon/bigming.png"
  };

  let localDanmakuDataPromise = null;

  const FALLBACK_COVER = "assets/covers/episode01.png";
  const LOCAL_COVER_BY_TITLE = {
    "北派寻宝笔记": "assets/covers/episode01.png",
    "北往": "assets/covers/episode02.png",
    "荒年全村啃树皮，我有系统满仓肉": "assets/covers/episode03.png",
    "家里家外": "assets/covers/episode04.png",
    "那年冬至": "assets/covers/episode05.png",
    "十八岁太奶奶驾到，重整家族荣耀第三部": "assets/covers/episode06.png",
    "撕夜": "assets/covers/episode07.png",
    "天下第一纨绔": "assets/covers/episode08.png",
    "幸得相遇离婚时": "assets/covers/episode09.png",
    "云渺1：我修仙多年强亿点怎么了": "assets/covers/episode10.png"
  };

  const state = {
    route: "home",
    loading: false,
    dramas: [],
    categories: [],
    selectedCategory: "",
    keyword: "",
    recommendSeed: 0,
    historyEditing: false,
    searchHistory: readJson(HISTORY_KEY, []),
    theaterReturn: { route: "home", dramaId: null, episodeId: null, startAt: 0 },
    user: readJson(USER_KEY, null),
    player: emptyPlayer(),
    videoContext: null,
    videoSessionId: 0,
    preloadToken: 0,
    preload: { homeNext: null, theaterMap: {} },
    currentVideoKind: "main",
    currentMainVideo: null,
    generatedVideoActive: false,
    openDramaSeq: 0,
    dramaSwitching: false,
    cache: { dramaDetails: {}, episodes: {}, highlights: {}, danmaku: {} },
    mine: { liked: [], favorites: [], activeTab: "liked" },
    upload: {
      files: [],
      coverFile: null,
      coverPreviewUrl: "",
      busy: false,
      jobMessage: "",
      lastComplete: null,
      fields: {
        dramaTitle: "",
        dramaDescription: "",
        videoDescription: "",
        judgeApiKey: "",
        judgeEndpointId: "",
        generationApiKey: ""
      }
    },
    rag: { groups: [], selectedBatchId: null, activeTask: null, busy: false, expanded: {}, deletingAssetId: null },
    timers: { rag: null, toast: null, seek: null, speedTip: null },
    gesture: {
      startX: 0,
      startY: 0,
      startAt: 0,
      progressSeeking: false,
      suppressClickUntil: 0,
      longPressTimer: null,
      speedHoldActive: false,
      speedHoldLocked: false,
      speedHoldWasPlaying: false,
      speedHoldPrevRate: 1,
      swipeTriggered: false,
      homeSwipeReady: false
    }
  };

  let nativeKeyboardOffset = 0;

  function emptyPlayer() {
    return {
      mode: "home",
      drama: null,
      episode: null,
      episodes: [],
      highlights: [],
      social: { liked: false, favorited: false, likeCount: 0, favoriteCount: 0, commentCount: 0 },
      comments: [],
      commentsOpen: false,
      descExpanded: false,
      episodePickerOpen: false,
      playbackRate: 1,
      speedMenuOpen: false,
      playing: false,
      playbackToken: 0,
      currentTime: 0,
      duration: 0,
      progressPercent: 0,
      seeking: false,
      seekText: "",
      videoUrl: "",
      originalUrl: "",
      resumeAt: 0,
      generatedPlaying: false,
      generatedSource: "",
      pendingInitialTime: 0,
      shown: {},
      triggered: {},
      activeEmotionId: "",
      activeHighlightSessionKey: "",
      highlightSessionSeq: 0,
      highlightLocalTapCount: 0,
      pendingHighlightStatDanmaku: null,
      statDanmakuMap: {},
      danmakuLaneAvailableAt: [],
      lastEmotionTapKey: "",
      lastEmotionTapAt: 0,
      branchHighlight: null,
      actionHighlight: null,
      currentBranch: null,
      branchStartTime: 0,
      disabledOptions: {},
      selectedOptionCode: "",
      selectedIsCorrect: true,
      selectedFailText: "",
      pendingReopenBranch: false,
      blackout: emptyBlackout(),
      story: emptyStory(),
      actionLockActive: false,
      actionVideoActive: false,
      actionPrompt: emptyActionPrompt(),
      actionPromptConfig: null,
      actionPromptQueue: [],
      actionOriginalRate: 1,
      lastProgressSaveAt: 0,
      danmakuComposerOpen: false,
      danmakuDraft: "",
      localDanmakuShown: {},
      lastDanmakuCheckSecond: -1,
      danmakuBySecond: {},
      optionMeta: {}
    };
  }

  function emptyBlackout() {
    return { show: false, text: "", visible: false };
  }

  function emptyStory() {
    return {
      show: false,
      generationId: null,
      contentType: "",
      title: "",
      content: "",
      contentUrl: ""
    };
  }

  function emptyActionPrompt() {
    return { show: false, offered: false, clicked: false, label: "", optionCode: "", kind: "", rate: 1 };
  }

  const api = {
    listDramas: () => request("/dramas"),
    getDrama: (id) => request(`/dramas/${id}`),
    getEpisode: (id) => request(`/episodes/${id}`),
    getHighlights: (id) => request(`/episodes/${id}/highlights`),
    getInteractionStats: (id) => request(`/episodes/${id}/interaction-stats`),
    createInteraction: (data) => request("/interactions", "POST", data),
    listDanmaku: (episodeId) => request(`/episodes/${episodeId}/danmaku`),
    postDanmaku: (episodeId, data) => request(`/episodes/${episodeId}/danmaku`, "POST", data),
    getStory: (generationId) => request(`/ai/story/${generationId}`),
    generateStory: (data) => request("/ai/story/generate", "POST", data),
    getDramaSocial: (dramaId) => request(`/dramas/${dramaId}/social`),
    likeDrama: (dramaId) => request(`/dramas/${dramaId}/like`, "POST"),
    unlikeDrama: (dramaId) => request(`/dramas/${dramaId}/like`, "DELETE"),
    favoriteDrama: (dramaId) => request(`/dramas/${dramaId}/favorite`, "POST"),
    unfavoriteDrama: (dramaId) => request(`/dramas/${dramaId}/favorite`, "DELETE"),
    getDramaComments: (dramaId) => request(`/dramas/${dramaId}/comments`),
    postDramaComment: (dramaId, content, clientCommentId) => request(`/dramas/${dramaId}/comments`, "POST", { content, clientCommentId }),
    getMySocial: () => request("/users/me/social"),
    login: (username, password) => request("/auth/login", "POST", { username, password }),
    register: (username, password) => request("/auth/register", "POST", { username, password }),
    logout: () => request("/auth/logout", "POST"),
    createUploadBatch: (data) => request("/uploads/batches", "POST", data),
    completeUploadBatch: (batchId, data) => request(`/uploads/batches/${batchId}/complete`, "POST", Array.isArray(data) ? { assetIds: data } : data),
    deleteUploadAsset: (assetId) => request(`/uploads/assets/${assetId}`, "DELETE"),
    getPendingVideos: () => request("/analysis-tasks/pending-videos"),
    getActiveTask: () => request("/analysis-tasks/active"),
    getAnalysisTask: (taskId) => request(`/analysis-tasks/${taskId}`),
    retryAnalysisTask: (taskId) => request(`/analysis-tasks/${taskId}/retry`, "POST"),
    startAnalysisTask: (data) => request("/analysis-tasks/start", "POST", data)
  };

  document.addEventListener("DOMContentLoaded", init);
  document.body.addEventListener("click", onClick);
  document.body.addEventListener("change", onChange);
  document.body.addEventListener("input", onInput);
  document.body.addEventListener("focusin", onFocusIn, true);
  document.body.addEventListener("focusout", onFocusOut, true);
  document.body.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
  document.body.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
  document.body.addEventListener("touchend", onTouchEnd, { passive: false, capture: true });
  window.addEventListener("resize", updateKeyboardOffset);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", updateKeyboardOffset);
    window.visualViewport.addEventListener("scroll", updateKeyboardOffset);
  }

  window.SVISetKeyboardOffset = function (height) {
    const value = Math.max(0, Math.round(Number(height || 0)));
    const max = Math.max(0, window.innerHeight * 0.72);
    nativeKeyboardOffset = Math.min(max, value);
    updateKeyboardOffset();
  };

  window.SVIAndroidBack = function () {
    if (state.player.commentsOpen) {
      state.player.commentsOpen = false;
      renderPlaybackLayer();
      return "handled";
    }
    if (state.player.episodePickerOpen) {
      state.player.episodePickerOpen = false;
      renderPlaybackLayer();
      return "handled";
    }
    if (state.player.danmakuComposerOpen) {
      closeDanmakuComposer();
      return "handled";
    }
    if (state.route === "play" || state.route === "upload" || state.route === "rag") {
      navigate("home");
      return "handled";
    }
    return "native";
  };

  async function init() {
    updateKeyboardOffset();
    render();
    await refreshAuthUser();
    await loadDramas();
    if (!state.player.videoUrl && state.dramas.length) {
      await playRandomDrama("home");
    }
    render();
  }

  function isKeyboardInput(node) {
    return !!(node && node.matches && node.matches("#commentInput,#danmakuComposerInput"));
  }

  function keyboardOffset() {
    const viewport = window.visualViewport;
    if (!viewport) return nativeKeyboardOffset;
    const raw = Math.max(nativeKeyboardOffset, window.innerHeight - viewport.height - viewport.offsetTop);
    const max = Math.max(0, window.innerHeight * 0.65);
    return Math.max(0, Math.min(max, Math.round(raw)));
  }

  function updateKeyboardOffset() {
    const offset = keyboardOffset();
    const focused = isKeyboardInput(document.activeElement);
    document.documentElement.style.setProperty("--keyboard-offset", `${offset}px`);
    document.body.classList.toggle("keyboard-open", focused || offset > 24);
  }

  function syncKeyboardSoon() {
    updateKeyboardOffset();
    setTimeout(updateKeyboardOffset, 80);
    setTimeout(updateKeyboardOffset, 260);
  }

  function ensureFocusedInputVisible() {
    const input = document.activeElement;
    if (!isKeyboardInput(input)) return;
    try {
      input.scrollIntoView({ block: "nearest", inline: "nearest" });
    } catch (err) {}
  }

  function onFocusIn(event) {
    if (!isKeyboardInput(event.target)) return;
    syncKeyboardSoon();
    setTimeout(ensureFocusedInputVisible, 180);
  }

  function onFocusOut(event) {
    if (!isKeyboardInput(event.target)) return;
    setTimeout(updateKeyboardOffset, 80);
  }

  function blurKeyboardInput(id) {
    const active = document.activeElement;
    if (active && active.blur && (!id || active.id === id)) {
      active.blur();
    }
    setTimeout(updateKeyboardOffset, 80);
  }

  async function request(path, method, data) {
    const upper = method || "GET";
    const deviceId = getDeviceId();
    let url = CONFIG.BASE_URL + path;
    const headers = { Accept: "application/json" };
    const options = { method: upper, headers };
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;

    if (upper === "GET") {
      url = addQuery(url, { deviceId });
    } else if (data !== undefined || upper === "POST" || upper === "PUT") {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(Object.assign({}, data || {}, { deviceId }));
    }

    let res;
    try {
      res = await fetch(url, options);
    } catch (err) {
      throw new Error("网络请求失败");
    }
    let body = null;
    try {
      body = await res.json();
    } catch (err) {
      body = null;
    }
    if (!res.ok) {
      throw new Error((body && body.message) || `HTTP ${res.status}`);
    }
    if (body && typeof body === "object" && "code" in body) {
      if (body.code === 0) return body.data;
      throw new Error(body.message || "请求失败");
    }
    return body;
  }

  function render() {
    const app = byId("app");
    prepareVideoForRender();
    app.innerHTML = routeView();
    renderTabs();
    afterRender();
  }

  function renderPreservingScroll(selector) {
    const current = document.querySelector(selector);
    const scrollTop = current ? current.scrollTop : 0;
    render();
    requestAnimationFrame(() => {
      const next = document.querySelector(selector);
      if (next) next.scrollTop = scrollTop;
    });
  }

  function prepareVideoForRender() {
    syncVideoDeckVisibility();
    const keepPlayback = (state.route === "home" || state.route === "play") && !!(state.player && state.player.videoUrl);
    if (!keepPlayback) {
      const video = activeVideo();
      if (video && !video.paused) {
        state.player.pendingInitialTime = Number(video.currentTime || state.player.pendingInitialTime || 0);
        getVideoContext().pause();
      }
    }
  }

  function stopCurrentVideoForRender(keepState) {
    const video = activeVideo();
    if (!video) return;
    const p = state.player;
    const shouldKeepPlayerState = keepState !== false && (state.route === "home" || state.route === "play");
    const wasPlaying = !!(video && !video.paused && !video.ended);
    if (p) {
      if (shouldKeepPlayerState) p.pendingInitialTime = Number(video.currentTime || p.pendingInitialTime || 0);
      p.playing = shouldKeepPlayerState ? (wasPlaying || (!!p.playing && !video.ended)) : false;
      p.playbackToken = (p.playbackToken || 0) + 1;
    }
    state.videoSessionId += 1;
    releaseVideoSource(video, { detachHandlers: true });
  }

  function releaseVideoSource(video, options) {
    if (!video) return;
    const opts = options || {};
    if (opts.detachHandlers) {
      video.onloadedmetadata = null;
      video.onplay = null;
      video.onpause = null;
      video.ontimeupdate = null;
      video.onended = null;
    }
    try { video.pause(); } catch (err) {}
    video.muted = true;
    video.volume = 0;
    try {
      video.removeAttribute("src");
      video.load();
    } catch (err) {}
    if (opts.removeNode && video.parentElement) {
      try { video.remove(); } catch (err) {}
    }
  }

  function clearWarmVideos() {
    state.preloadToken += 1;
    state.preload.homeNext = null;
    Object.values(state.preload.theaterMap || {}).forEach((record) => {
      if (record && record.video) releaseVideoSource(record.video, { detachHandlers: true, removeNode: true });
    });
    state.preload.theaterMap = {};
    document.querySelectorAll("video.warm-video").forEach((node) => {
      releaseVideoSource(node, { detachHandlers: true, removeNode: true });
    });
  }

  function activeVideo() {
    return byId("videoSlot0");
  }

  function setVideoSlotClasses(visible) {
    const node = activeVideo();
    if (!node) return;
    node.classList.add("active");
    node.classList.remove("standby");
    node.muted = !visible;
    node.volume = visible ? 1 : 0;
  }

  function syncVideoDeckVisibility() {
    const deck = byId("videoDeck");
    if (!deck) return;
    const visible = (state.route === "home" || state.route === "play") && !!(state.player && state.player.videoUrl);
    deck.classList.toggle("hidden", !visible);
    setVideoSlotClasses(visible);
  }

  function getVideoContext() {
    if (!state.videoContext) state.videoContext = createVideoContextLike();
    return state.videoContext;
  }

  function createVideoContextLike() {
    return {
      node() {
        return activeVideo();
      },
      play() {
        const video = this.node();
        const p = state.player;
        p.playing = true;
        reflectPlayState(true);
        if (!video) return Promise.resolve();
        video.muted = false;
        video.volume = 1;
        video.playbackRate = Number(p.playbackRate || 1);
        return video.play().catch(() => {
          p.playing = false;
          reflectPlayState(false);
        });
      },
      pause() {
        const video = this.node();
        const p = state.player;
        p.playing = false;
        if (video) {
          try { video.pause(); } catch (err) {}
          syncPlayState(video);
        } else {
          reflectPlayState(false);
        }
      },
      seek(time) {
        const video = this.node();
        const p = state.player;
        const target = Math.max(0, Number(time || 0));
        p.pendingInitialTime = target;
        p.currentTime = target;
        if (video) {
          try { video.currentTime = target; } catch (err) {}
        }
      },
      setRate(rate) {
        const next = Number(rate || 1);
        state.player.playbackRate = next;
        const video = this.node();
        if (video) video.playbackRate = next;
      },
      switchSource(url, startAt, autoplay, kind) {
        const p = state.player;
        const video = this.node();
        const nextUrl = String(url || "");
        const start = Math.max(0, Number(startAt || 0));
        const shouldPlay = !!autoplay;
        const sessionId = ++state.videoSessionId;
        state.currentVideoKind = kind || "main";
        state.generatedVideoActive = state.currentVideoKind !== "main";
        clearWarmVideos();
        syncVideoDeckVisibility();
        p.pendingInitialTime = start;
        p.currentTime = start;
        p.progressPercent = 0;
        p.playing = shouldPlay;
        if (!video) {
          reflectPlayState(shouldPlay);
          return;
        }
        setVideoSlotClasses(true);
        releaseVideoSource(video);
        video.src = nextUrl;
        video.muted = false;
        video.volume = 1;
        video.playbackRate = Number(p.playbackRate || 1);
        const applyStart = () => {
          if (sessionId !== state.videoSessionId || activeVideo() !== video) return;
          try { video.currentTime = start; } catch (err) {}
          updateProgress(start, video.duration || p.duration || 0, false);
          if (shouldPlay) {
            video.play().catch(() => {
              if (sessionId !== state.videoSessionId || activeVideo() !== video) return;
              p.playing = false;
              reflectPlayState(false);
            });
          } else {
            try { video.pause(); } catch (err) {}
            reflectPlayState(false);
          }
        };
        if (video.readyState >= 1) {
          applyStart();
        } else {
          video.addEventListener("loadedmetadata", applyStart, { once: true });
          try { video.load(); } catch (err) {}
        }
        reflectPlayState(shouldPlay);
      },
      stop(keepState) {
        stopCurrentVideoForRender(keepState);
      }
    };
  }

  function clampInitialTime(value, duration) {
    const current = Math.max(0, Number(value || 0));
    const total = Number(duration || 0);
    if (total > 0 && current >= Math.max(0, total - 1)) return 0;
    return current;
  }

  function replaceCurrentVideoSource(url, startTime, shouldPlay) {
    const p = state.player;
    p.pendingInitialTime = Number(startTime || 0);
    p.playing = !!shouldPlay;
    getVideoContext().switchSource(url, p.pendingInitialTime, shouldPlay, p.generatedPlaying ? (p.generatedSource || "generated") : "main");
  }

  function routeView() {
    if (state.route === "home") return renderHome();
    if (state.route === "theater") return renderTheater();
    if (state.route === "mine") return renderMine();
    if (state.route === "upload") return renderUpload();
    if (state.route === "rag") return renderRag();
    if (state.route === "play") return renderPlay();
    return renderHome();
  }

  function renderTabs() {
    const tabs = byId("tabs");
    const tabItems = [
      ["home", "首页", "home"],
      ["theater", "剧场", "theater"],
      ["mine", "我的", "mine"]
    ];
    tabs.innerHTML = tabItems.map(([route, text, icon]) => `
      <button class="tab ${state.route === route ? "active" : ""}" data-action="nav" data-route="${route}">
        <span class="tab-icon tab-icon-${icon}" aria-hidden="true"></span><span>${text}</span>
      </button>
    `).join("");
    tabs.classList.toggle("hidden", state.route === "play");
  }

  function patchSpeedLabels() {
    const value = speedLabelText();
    document.querySelectorAll(".speed-label").forEach((node) => {
      node.textContent = value;
    });
  }

  function speedLabelText() {
    if (state.gesture.speedHoldActive || state.gesture.speedHoldLocked) return "2x";
    const rate = Number(state.player.playbackRate || 1);
    return rate === 1 ? "倍速" : `${formatRate(rate)}x`;
  }

  function formatRate(rate) {
    const n = Number(rate || 1);
    return Number.isInteger(n) ? String(n) : String(n).replace(/0+$/, "").replace(/\.$/, "");
  }

  function renderHome() {
    return `<section class="screen screen--full">${renderPlayback("home")}</section>`;
  }

  function renderPlay() {
    return `<section class="screen screen--full">${renderPlayback("play")}</section>`;
  }

  function renderPlayback(mode) {
    const p = state.player;
    const drama = p.drama || {};
    const episode = p.episode || {};
    if (!p.videoUrl) {
      return `<div class="player"><div class="loading">${state.loading ? "加载中..." : "暂无可播放短剧"}</div></div>`;
    }
    const title = escapeHtml(drama.title || "短剧互动");
    const rawDesc = String(drama.description || "").trim();
    const descLimit = 44;
    const descClipped = rawDesc.length > descLimit;
    const descText = mode === "home"
      ? (p.descExpanded || !descClipped ? rawDesc : shortText(rawDesc, descLimit))
      : "";
    const tags = normalizeTags(drama.tags).map((tag) => `<button class="tag" data-action="tagSearch" data-keyword="${escapeAttr(tag)}">${escapeHtml(tag)}</button>`).join("");
    const fullButton = mode === "home"
      ? `<button class="watch-full" data-action="watchFull"><span class="watch-play">▶</span><span>观看完整短剧 · 全${Number(drama.episodeCount || p.episodes.length || 0)}集</span><span class="watch-arrow">›</span></button>`
      : "";
    const progressLine = `
      <div class="progress-line" data-action="seekBar">
        <div class="progress-bar ${p.seeking ? "progress-bar--active" : ""}">
          <div id="progressFill" class="progress-fill" style="width:${Math.max(0, Math.min(100, p.progressPercent || 0))}%">
            <span class="progress-knob"></span>
          </div>
        </div>
      </div>`;
    const topLeft = mode === "play"
      ? `<div class="play-top-left"><button class="play-back" data-action="nav" data-route="home">‹</button><button class="episode-badge" data-action="toggleEpisodePicker">第${escapeHtml(episode.episodeNo || "")}集</button></div>`
      : `<button class="menu-btn" aria-label="菜单"><span></span><span></span><span></span></button>`;
    const speedButton = `<button class="speed-pill" data-action="toggleSpeed"><span class="speed-icon">◷</span><span class="speed-label">${speedLabelText()}</span></button>`;
    const topRight = mode === "home"
      ? `<div class="top-right">${speedButton}<button class="search-round" data-action="homeSearch" aria-label="搜索">⌕</button></div>`
      : `<div class="top-right">${speedButton}</div>`;
    const descBlock = mode === "home" && rawDesc ? `
      <div class="desc-line ${p.descExpanded ? "expanded" : ""}">
        <span class="desc-text">${escapeHtml(descText)}</span>
        ${descClipped ? `<button class="desc-toggle" data-action="toggleDesc">${p.descExpanded ? "收起" : "展开"}</button>` : ""}
      </div>
    ` : "";

    return `
      <div class="player ${mode === "play" ? "player--full" : ""} ${p.generatedPlaying || p.actionVideoActive ? "is-generated is-interaction" : ""} ${p.branchHighlight || p.actionHighlight || (p.actionPrompt && p.actionPrompt.show) ? "is-interaction" : ""} ${p.playing ? "" : "is-paused"}" data-player-mode="${mode}">
        <div class="player-ui">
          <button class="tap-layer" data-action="togglePlay" aria-label="播放或暂停"></button>
          <div class="player-top">
            ${topLeft}
            ${topRight}
          </div>
          <button class="center-play" data-action="togglePlay" aria-label="播放"><span class="center-play-tri">▶</span></button>
          <div id="emotionLayer" class="overlay-layer"></div>
          <div id="floatLayer" class="float-layer"></div>
          <div id="danmakuLayer" class="danmaku-layer"></div>
          <div id="bigImageLayer" class="big-image-layer"></div>
          <div class="side-actions">
            <button class="side-action ${p.social.favorited ? "active" : ""}" data-action="favorite"><span class="action-icon-shell"><strong class="star-icon">&#9733;</strong></span><small>${formatCount(p.social.favoriteCount)}</small></button>
            <button class="side-action" data-action="comments"><span class="action-icon-shell"><strong class="comment-icon">•••</strong></span><small>${formatCount(p.social.commentCount)}</small></button>
            <button class="side-action side-action-like ${p.social.liked ? "active" : ""}" data-action="like"><span class="action-icon-shell heart-shell"><strong class="heart-icon" aria-hidden="true"></strong></span><small>${formatCount(p.social.likeCount)}</small></button>
          </div>
          <div class="player-info">
            <button class="danmaku-send-btn" data-action="danmakuInput">弹/</button>
            <h2>${title}</h2>
            ${mode === "home" ? `<div class="tagline">${tags}</div>` : ""}
            ${descBlock}
            ${mode === "play" ? `<button class="episode-entry" data-action="toggleEpisodePicker">选集 &gt;</button>` : ""}
            ${fullButton}
          </div>
          <div id="seekTime" class="seek-time ${p.seeking ? "show" : ""}">${escapeHtml(p.seekText || "")}</div>
          <div id="speedHoldTip" class="speed-hold-tip"></div>
          ${progressLine}
          <div id="modalLayer" class="modal-layer"></div>
          <div id="sheetLayer" class="sheet-layer"></div>
        </div>
      </div>
    `;
  }

  function renderTheater() {
    const keyword = state.keyword.trim().toLowerCase();
    const list = state.dramas.filter((item) => {
      const tags = normalizeTags(item.tags);
      const haystack = [item.title, item.description, tags.join(" ")].join(" ").toLowerCase();
      const matchKeyword = !keyword || haystack.includes(keyword);
      const matchCategory = !state.selectedCategory || tags.includes(state.selectedCategory);
      return matchKeyword && matchCategory;
    });
    const chips = [`<button class="chip ${!state.selectedCategory ? "active" : ""}" data-action="category" data-category="">全部</button>`]
      .concat(state.categories.map((cat) => `<button class="chip ${state.selectedCategory === cat ? "active" : ""}" data-action="category" data-category="${escapeAttr(cat)}">${escapeHtml(cat)}</button>`))
      .join("");
    const guess = pickRecommend(list.length ? list : state.dramas);
    const hot = state.dramas.slice(0, 6);
    const history = state.searchHistory.length
      ? `<div class="chip-row history-row">
          ${state.historyEditing ? `<button class="chip history-clear-all" data-action="clearAllHistory">全部清除</button>` : ""}
          ${state.searchHistory.map((item) => `<button class="chip ${state.historyEditing ? "history-chip--editing" : ""}" data-action="${state.historyEditing ? "deleteHistory" : "historySearch"}" data-keyword="${escapeAttr(item)}">${state.historyEditing ? `<span>×</span>` : ""}${escapeHtml(item)}</button>`).join("")}
        </div>`
      : `<p class="theater-muted">暂无搜索历史</p>`;
    return `
      <section class="screen theater-screen">
        <div class="theater-head"><h1>剧场</h1></div>
        <div class="theater-search">
          <button class="theater-back" data-action="theaterBack">‹</button>
          <input id="searchInput" value="${escapeAttr(state.keyword)}" placeholder="搜索短剧标题" />
          <button class="primary" data-action="search">搜索</button>
        </div>
        <div class="quick-row">
          <button>识剧</button><button>榜单</button><button>上新</button><button>演员</button><button>分类</button>
        </div>
        <div class="chip-row">${chips}</div>
        <section class="theater-section">
          <div class="section-title"><h2>搜索历史</h2><button class="mini-btn clear-history-btn" data-action="toggleHistoryEdit" ${state.searchHistory.length ? "" : "disabled"}>${state.historyEditing ? "完成" : "清除"}</button></div>
          ${history}
        </section>
        <section class="theater-section">
          <div class="section-title"><h2>猜你喜欢</h2><button class="mini-btn" data-action="refreshRecommend">↻</button></div>
          ${guess.length ? `<div class="poster-row">${guess.map((item) => renderPosterCard(item)).join("")}</div>` : `<div class="empty">暂无短剧</div>`}
        </section>
        <section class="rank-section">
          <div class="section-title"><h2>短剧热搜榜</h2><strong>热点话题榜</strong></div>
          ${hot.length ? `<div class="poster-row">${hot.map((item, index) => renderPosterCard(item, index + 1)).join("")}</div>` : `<div class="empty">暂无榜单</div>`}
        </section>
        ${keyword && !list.length ? `<div class="empty">抱歉该短剧暂未收录</div>` : ""}
      </section>
    `;
  }

  function renderPosterCard(item, rank) {
    const tags = normalizeTags(item.tags).slice(0, 1).join(" · ");
    return `
      <article class="poster-card" data-action="openDrama" data-drama-id="${item.dramaId}">
        ${rank ? `<span class="rank-badge">${rank}</span>` : ""}
        <img alt="" src="${escapeAttr(coverOf(item))}" />
        <strong>${escapeHtml(item.title || "未命名短剧")}</strong>
        <small>${escapeHtml(tags || "短剧")} · 全${Number(item.episodeCount || 0)}集</small>
      </article>
    `;
  }

  function pickRecommend(source) {
    const list = (source || []).filter(Boolean);
    if (list.length <= 3) return list;
    const start = state.recommendSeed % list.length;
    return [0, 1, 2].map((offset) => list[(start + offset) % list.length]);
  }

  function renderDramaCard(item) {
    const tags = normalizeTags(item.tags).slice(0, 2).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
    return `
      <article class="drama-card">
        <img class="drama-cover" alt="" src="${escapeAttr(coverOf(item))}" />
        <div class="drama-card-body">
          <p class="drama-title">${escapeHtml(item.title || "未命名短剧")}</p>
          <div class="drama-meta">${tags}<span>${Number(item.episodeCount || 0)}集</span></div>
          <button class="soft card-play" data-action="openDrama" data-drama-id="${item.dramaId}">播放</button>
        </div>
      </article>
    `;
  }

  function renderMine() {
    if (!state.user) {
      return `
        <section class="screen">
          <div class="top-title"><div><h1>我的</h1><p>登录后同步点赞、收藏、评论和观看进度</p></div></div>
          <div class="profile-box">
            <div class="field"><label>用户名</label><input id="authUsername" autocomplete="username" /></div>
            <div class="field"><label>密码</label><input id="authPassword" type="password" autocomplete="current-password" /></div>
            <div class="row">
              <button class="primary" data-action="login">登录</button>
              <button class="ghost" data-action="register">注册</button>
            </div>
          </div>
        </section>
      `;
    }
    const progress = readJson(PROGRESS_KEY, {});
    const progressList = Object.keys(progress).map((dramaId) => {
      const drama = state.dramas.find((item) => sameId(item.dramaId, dramaId));
      const item = progress[dramaId];
      return { drama, dramaId, episodeId: item.episodeId, currentTime: item.currentTime };
    }).filter((item) => item.drama);
    return `
      <section class="screen">
        <div class="top-title"><div><h1>我的</h1><p>${escapeHtml(state.user.username || "已登录")}</p></div></div>
        <div class="profile-box">
          <div class="row"><strong>${escapeHtml(state.user.username || "")}</strong><button class="ghost" data-action="logout">退出登录</button></div>
        </div>
        <div class="row" style="margin-bottom:12px">
          <button class="primary" data-action="nav" data-route="upload">上传短剧</button>
          <button class="ghost" data-action="nav" data-route="rag">RAG 任务</button>
        </div>
        <h2>继续观看</h2>
        ${progressList.length ? `<div class="list">${progressList.map((item) => `
          <div class="status-card row">
            <div><strong>${escapeHtml(item.drama.title)}</strong><p class="drama-meta">已看到 ${formatTime(item.currentTime || 0)}</p></div>
            <button class="soft" data-action="resumeDrama" data-drama-id="${item.dramaId}" data-episode-id="${item.episodeId}" data-start-at="${Math.floor(item.currentTime || 0)}">继续</button>
          </div>
        `).join("")}</div>` : `<div class="empty">暂无观看进度</div>`}
        <h2>我的点赞</h2>
        ${state.mine.liked.length ? `<div class="drama-grid">${state.mine.liked.map(renderDramaCard).join("")}</div>` : `<div class="empty">暂无点赞</div>`}
        <h2>我的收藏</h2>
        ${state.mine.favorites.length ? `<div class="drama-grid">${state.mine.favorites.map(renderDramaCard).join("")}</div>` : `<div class="empty">暂无收藏</div>`}
      </section>
    `;
  }

  function renderMine() {
    if (!state.user) {
      return `
        <section class="screen mine-screen">
          <div class="mine-title">我的</div>
          <div class="login-card">
            <h2>测试登录</h2>
            <input id="authUsername" autocomplete="username" placeholder="用户名" />
            <input id="authPassword" type="password" autocomplete="current-password" placeholder="密码" />
            <div class="login-actions">
              <button class="login-submit" data-action="login">登录</button>
              <button class="register-submit" data-action="register">注册</button>
            </div>
            <p>注册成功后会自动登录，可创建多个测试账号。</p>
          </div>
        </section>
      `;
    }
    const activeTab = state.mine.activeTab || "liked";
    const list = activeTab === "favorites" ? state.mine.favorites : state.mine.liked;
    const username = String(state.user && (state.user.username || state.user.nickname || state.user.name) || "e");
    const avatar = username.trim().slice(0, 1) || "e";
    return `
      <section class="screen mine-screen">
        <div class="mine-title">我的</div>
        <div class="mine-account">
          <div class="mine-account-main">
            <div class="mine-avatar">${escapeHtml(avatar)}</div>
            <div class="mine-account-copy">
              <strong>${escapeHtml(username)}</strong>
              <span>当前账号</span>
            </div>
          </div>
          <button class="mine-logout" data-action="logout">退出</button>
        </div>
        <div class="mine-action-grid">
          <button class="mine-action-card mine-action-card--upload" data-action="nav" data-route="upload">
            <strong>上传短剧</strong>
            <span>选择视频并上传到 COS</span>
          </button>
          <button class="mine-action-card mine-action-card--rag" data-action="nav" data-route="rag">
            <strong>RAG 调用</strong>
            <span>模型A为互动点判断模型</span>
          </button>
        </div>
        <div class="mine-tabs">
          <button class="${activeTab === "liked" ? "active" : ""}" data-action="mineTab" data-tab="liked">点赞</button>
          <button class="${activeTab === "favorites" ? "active" : ""}" data-action="mineTab" data-tab="favorites">收藏</button>
        </div>
        ${list.length ? `<div class="mine-list">${list.map(renderMineDramaRow).join("")}</div>` : `<div class="mine-empty">还没有${activeTab === "favorites" ? "收藏" : "点赞"}短剧</div>`}
      </section>
    `;
  }

  function renderMineDramaRow(item) {
    return `
      <article class="mine-drama-row" data-action="openDrama" data-drama-id="${item.dramaId}">
        <img alt="" src="${escapeAttr(coverOf(item))}" />
        <div>
          <strong>${escapeHtml(item.title || "未命名短剧")}</strong>
          <p>${escapeHtml(shortText(item.description || "", 46))}</p>
        </div>
      </article>
    `;
  }

  function renderUpload() {
    const u = state.upload;
    const videoFileText = u.files.length ? `已选择 ${u.files.length} 个 MP4 文件` : "未选择文件";
    return `
      <section class="screen upload-screen">
        <div class="top-title">
          <button class="icon-btn" data-action="nav" data-route="mine">返回</button>
          <div><h1>上传短剧</h1></div>
        </div>
        <div class="upload-card">
          <div class="field"><label>短剧名称</label><input id="uploadDramaTitle" value="${escapeAttr(u.fields.dramaTitle)}" placeholder="例如 北往" /></div>
          <div class="field"><label>短剧简介</label><textarea id="uploadDramaDescription" placeholder="请填写短剧的简介">${escapeHtml(u.fields.dramaDescription)}</textarea></div>
          <div class="field">
            <label>短剧封面</label>
            <div class="cover-upload-row">
              <label class="cover-picker">
                ${u.coverPreviewUrl ? `<img alt="" src="${escapeAttr(u.coverPreviewUrl)}" />` : `<span>选择封面</span>`}
                <input id="coverFile" type="file" accept="image/*" />
              </label>
              <div>
                <strong>${u.coverFile ? escapeHtml(u.coverFile.name) : "未选择封面"}</strong>
                <p>已配置的短剧会直接使用现有封面，选择图片可先预览</p>
              </div>
            </div>
          </div>
          <div class="field">
            <label>MP4 文件</label>
            <div class="file-picker-row">
              <label class="file-picker-btn">选择 MP4 文件<input id="videoFiles" class="file-input" type="file" accept="video/mp4,.mp4" multiple /></label>
              <span>${escapeHtml(videoFileText)}</span>
            </div>
          </div>
          <div class="row">
            <span class="status-pill">${u.files.length}/${CONFIG.MAX_VIDEO_FILES}</span>
            <button class="primary" data-action="startUpload" ${u.busy ? "disabled" : ""}>开始上传</button>
          </div>
        </div>
        ${u.jobMessage ? `<div class="status-card">${escapeHtml(u.jobMessage)}</div>` : ""}
        <div class="upload-card">
          ${u.files.length ? u.files.map(renderUploadFile).join("") : `<div class="empty">请选择 MP4 文件</div>`}
        </div>
      </section>
    `;
  }

  function renderUploadFile(item, index) {
    return `
      <div class="file-row" data-file-id="${item.id}">
        <div>
          <div class="file-name">${escapeHtml(item.name)}</div>
          <small class="drama-meta">${formatBytes(item.size)} · ${escapeHtml(item.statusText || "待上传")}</small>
          <div class="progress-mini"><span style="width:${Math.max(0, Math.min(100, item.progress || 0))}%"></span></div>
        </div>
        <input data-action="episodeInput" data-file-id="${item.id}" type="number" min="1" value="${Number(item.episodeNo || index + 1)}" />
      </div>
    `;
  }

  function renderRag() {
    const r = state.rag;
    const pendingGroups = r.groups.filter((group) => (group.stats && (group.stats.pending + group.stats.processing) > 0));
    const processedGroups = r.groups.filter((group) => (group.stats && (group.stats.pending + group.stats.processing) === 0 && (group.stats.generated + group.stats.noAction) > 0));
    return `
      <section class="screen rag-screen">
        <div class="rag-header">
          <button class="ghost" data-action="nav" data-route="mine">返回</button>
          <strong>RAG 调用</strong>
          <button class="primary rag-refresh" data-action="refreshRag">刷新</button>
        </div>
        <div class="rag-card">
          <h2>模型配置</h2>
          <input id="ragJudgeApiKey" value="${escapeAttr(state.upload.lastComplete && state.upload.lastComplete.judgeApiKey || "")}" placeholder="模型A（互动点判断模型）密钥" />
          <input id="ragJudgeEndpointId" value="${escapeAttr(state.upload.lastComplete && state.upload.lastComplete.judgeEndpointId || "")}" placeholder="模型A（互动点判断模型）端点 ID" />
          <input id="ragGenerationApiKey" value="${escapeAttr(state.upload.lastComplete && state.upload.lastComplete.generationApiKey || "")}" placeholder="模型B 密钥（可选，不填只加高光弹幕）" />
          <button class="rag-start" data-action="startRag" ${r.busy ? "disabled" : ""}>开始处理选中待处理视频</button>
        </div>
        ${renderActiveTask()}
        <div class="rag-card">
          <h2>待处理视频</h2>
          ${pendingGroups.length ? pendingGroups.map((group) => renderRagGroup(group, "pending")).join("") : `<div class="empty rag-empty">暂无待处理视频</div>`}
        </div>
        <div class="rag-card">
          <h2>已处理视频</h2>
          ${processedGroups.length ? processedGroups.map((group) => renderRagGroup(group, "processed")).join("") : `<div class="empty rag-empty">暂无已处理视频</div>`}
        </div>
      </section>
    `;
  }

  function renderActiveTask() {
    const task = state.rag.activeTask;
    if (!task) return "";
    const status = String(task.status || "");
    return `
      <div class="status-card">
        <div class="row">
          <strong>任务 #${escapeHtml(task.taskId)}</strong>
          <span class="status-pill ${taskClass(status)}">${escapeHtml(status || "UNKNOWN")}</span>
        </div>
        <p>${escapeHtml(task.stage || task.message || task.errorMessage || "等待任务更新")}</p>
        <div class="progress-mini"><span style="width:${Number(task.progress || 0)}%"></span></div>
        ${status === "FAILED" ? `<button class="danger" data-action="retryRag" data-task-id="${task.taskId}">重试</button>` : ""}
      </div>
    `;
  }

  function renderRagGroup(group, kind) {
    const active = kind === "pending" && sameId(group.batchId, state.rag.selectedBatchId);
    const expandedKey = `${kind}:${group.batchId}`;
    const expanded = !!state.rag.expanded[expandedKey];
    const videos = kind === "processed" ? group.processedVideos : group.unprocessedVideos;
    const totalText = kind === "processed"
      ? `${group.processedVideos.length} 已处理`
      : `${group.unprocessedVideos.length || group.stats.processing} 待处理`;
    const sourceLabel = isBuiltinRagBatch(group) ? "内置剧库" : "我的上传";
    return `
      <div class="rag-group ${active ? "active" : ""}" ${kind === "pending" ? `data-action="selectRagBatch" data-batch-id="${group.batchId}"` : ""}>
        <div class="rag-group-head">
          <strong>${escapeHtml(group.dramaTitle || `批次 ${group.batchId}`)}</strong>
          <span>${escapeHtml(totalText)}</span>
        </div>
        <div class="rag-badges">
          <span class="rag-badge pending">待处理 ${group.stats.pending}</span>
          <span class="rag-badge processing">处理中 ${group.stats.processing}</span>
          <span class="rag-badge generated">已生成 ${group.stats.generated}</span>
          <span class="rag-badge none">无互动 ${group.stats.noAction}</span>
        </div>
        <button class="rag-expand" data-action="toggleRagGroup" data-batch-id="${group.batchId}" data-kind="${kind}">
          ${expanded ? "收起" : "展开"}${kind === "processed" ? "已处理" : "未处理"}视频
        </button>
        ${expanded ? `
          <div class="rag-video-list">
            <h3>${kind === "processed" ? "已处理视频" : "未处理视频"}</h3>
            ${videos.length ? videos.map(renderRagVideoRow).join("") : `<p class="theater-muted">${sourceLabel} · 暂无视频</p>`}
          </div>
        ` : ""}
      </div>
    `;
  }

  function renderRagVideoRow(video) {
    const status = normalizeRagStatus(video);
    const name = video.originalFileName || video.normalizedFileName || video.assetId;
    const deleting = Number(state.rag.deletingAssetId || 0) === Number(video.assetId || 0);
    return `
      <div class="rag-video-row">
        <span>第 ${Number(video.episodeNo || 0) || ""} 集 · ${escapeHtml(name)}</span>
        <div class="rag-video-actions">
          <b class="${ragStatusClass(status)}">${escapeHtml(ragStatusLabel(status))}</b>
          ${video.canDelete ? `<button class="rag-delete" data-action="deleteRagVideo" data-asset-id="${escapeAttr(video.assetId)}" data-name="${escapeAttr(name)}" ${deleting ? "disabled" : ""}>${deleting ? "删除中" : "删除"}</button>` : ""}
        </div>
      </div>
    `;
  }

  function onClick(event) {
    if (Date.now() < state.gesture.suppressClickUntil) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    const route = target.dataset.route;
    if (action === "closeAuthPrompt") closeLoginPrompt(target.dataset.route || "");
    else if (action === "authGoLogin") goLoginFromPrompt();
    else if (action === "nav") navigate(route);
    else if (action === "playRandom" && state.route === "home") playRandomDrama("home");
    else if (action === "homeSearch") { openTheaterSearch(""); }
    else if (action === "tagSearch") { openTheaterSearch(target.dataset.keyword || ""); }
    else if (action === "theaterBack") returnFromTheater();
    else if (action === "watchFull") openCurrentFull();
    else if (action === "toggleDesc") toggleDescription();
    else if (action === "toggleEpisodePicker") {
      if (state.player.actionLockActive || isPlaybackBlockedByOverlay()) return;
      state.player.episodePickerOpen = !state.player.episodePickerOpen;
      renderPlaybackLayer();
    }
    else if (action === "closeEpisodePicker") { state.player.episodePickerOpen = false; renderPlaybackLayer(); }
    else if (action === "seekBar") {
      seekFromClientX(event.clientX, false);
      scheduleSeekHide();
      state.gesture.suppressClickUntil = Date.now() + 250;
    }
    else if (action === "togglePlay") togglePlay();
    else if (action === "toggleSpeed") toggleSpeed();
    else if (action === "setSpeed") setPlaybackRate(Number(target.dataset.rate || 1));
    else if (action === "openDrama") {
      if (!requireLogin("请先登录后进入播放页")) return;
      openDrama(target.dataset.dramaId);
    }
    else if (action === "resumeDrama") {
      if (!requireLogin("请先登录后继续观看")) return;
      openDrama(target.dataset.dramaId, target.dataset.episodeId, target.dataset.startAt);
    }
    else if (action === "switchEpisode") switchEpisode(target.dataset.episodeId);
    else if (action === "category") { state.selectedCategory = target.dataset.category || ""; render(); }
    else if (action === "historySearch") { state.keyword = target.dataset.keyword || ""; saveSearch(state.keyword); render(); }
    else if (action === "refreshRecommend") { state.recommendSeed += 1; renderPreservingScroll(".theater-screen"); }
    else if (action === "toggleHistoryEdit") {
      if (!state.searchHistory.length) return;
      state.historyEditing = !state.historyEditing;
      renderPreservingScroll(".theater-screen");
    }
    else if (action === "deleteHistory") {
      const keyword = target.dataset.keyword || "";
      state.searchHistory = state.searchHistory.filter((item) => item !== keyword);
      writeJson(HISTORY_KEY, state.searchHistory);
      if (!state.searchHistory.length) state.historyEditing = false;
      renderPreservingScroll(".theater-screen");
    }
    else if (action === "clearAllHistory") {
      state.searchHistory = [];
      state.historyEditing = false;
      writeJson(HISTORY_KEY, state.searchHistory);
      renderPreservingScroll(".theater-screen");
    }
    else if (action === "mineTab") { state.mine.activeTab = target.dataset.tab || "liked"; render(); }
    else if (action === "search") doSearch();
    else if (action === "login") login(false);
    else if (action === "register") login(true);
    else if (action === "logout") logout();
    else if (action === "like") toggleLike();
    else if (action === "favorite") toggleFavorite();
    else if (action === "comments") {
      if (state.player.actionLockActive || isPlaybackBlockedByOverlay()) return;
      openComments();
    }
    else if (action === "closeComments") closeComments();
    else if (action === "sendComment") sendComment();
    else if (action === "danmakuInput") openDanmakuComposer();
    else if (action === "closeDanmakuComposer") closeDanmakuComposer();
    else if (action === "submitDanmaku") submitDanmaku();
    else if (action === "emotion") tapEmotion(target.dataset.optionCode);
    else if (action === "branch") chooseBranch(Number(target.dataset.index || 0));
    else if (action === "actionButton") tapAction();
    else if (action === "actionPromptButton") tapActionPrompt();
    else if (action === "retryBranch") retryBranch();
    else if (action === "startUpload") startUpload();
    else if (action === "refreshRag") refreshRag();
    else if (action === "toggleRagGroup") {
      const key = `${target.dataset.kind || "pending"}:${target.dataset.batchId}`;
      state.rag.expanded[key] = !state.rag.expanded[key];
      renderPreservingScroll(".rag-screen");
    }
    else if (action === "selectRagBatch") {
      const group = state.rag.groups.find((item) => sameId(item.batchId, target.dataset.batchId));
      if (!group || !canUseRagGroup(group)) {
        toast("只能判断自己上传的短剧或内置剧库");
        return;
      }
      state.rag.selectedBatchId = Number(target.dataset.batchId);
      renderPreservingScroll(".rag-screen");
    }
    else if (action === "startRag") startRag();
    else if (action === "retryRag") retryRag(target.dataset.taskId);
    else if (action === "deleteRagVideo") deleteRagVideo(target.dataset.assetId, target.dataset.name);
  }

  function onInput(event) {
    if (event.target.id === "searchInput") {
      state.keyword = event.target.value;
    }
    if (event.target.id === "danmakuComposerInput") {
      state.player.danmakuDraft = event.target.value;
    }
    const uploadFieldMap = {
      uploadDramaTitle: "dramaTitle",
      uploadDramaDescription: "dramaDescription"
    };
    if (uploadFieldMap[event.target.id]) {
      state.upload.fields[uploadFieldMap[event.target.id]] = event.target.value;
    }
    if (event.target.dataset.action === "episodeInput") {
      const file = state.upload.files.find((item) => item.id === event.target.dataset.fileId);
      if (file) file.episodeNo = Math.max(1, Number(event.target.value || 1));
    }
  }

  function onChange(event) {
    if (event.target.id === "videoFiles") {
      addUploadFiles(Array.from(event.target.files || []));
    }
    if (event.target.id === "coverFile") {
      setCoverFile((event.target.files || [])[0]);
    }
  }

  function onTouchStart(event) {
    const touch = event.touches && event.touches[0];
    if (!touch) return;
    clearLongPressTimer();
    state.gesture.startX = touch.clientX;
    state.gesture.startY = touch.clientY;
    state.gesture.startAt = Date.now();
    state.gesture.swipeTriggered = false;
    state.gesture.homeSwipeReady = false;
    state.gesture.progressSeeking = !!event.target.closest(".progress-line");
    if (state.gesture.progressSeeking) {
      clearSeekHideTimer();
      seekFromTouch(touch, true);
      return;
    }
    if (canHandlePlayerGesture(event) && !state.gesture.speedHoldLocked) {
      state.gesture.longPressTimer = setTimeout(beginSpeedHold, LONG_PRESS_SPEED_MS);
    }
  }

  function onTouchMove(event) {
    const touch = event.touches && event.touches[0];
    if (!touch) return;
    if (state.gesture.progressSeeking) {
      event.preventDefault();
      seekFromTouch(touch, true);
      return;
    }
    if (handleSpeedHoldSwipe(event, touch)) return;
    if (handleHomeSwipeMove(event, touch)) return;
    const dx = touch.clientX - state.gesture.startX;
    const dy = touch.clientY - state.gesture.startY;
    if (Math.abs(dx) > 18 || Math.abs(dy) > 18) clearLongPressTimer();
  }

  function onTouchEnd(event) {
    const touch = event.changedTouches && event.changedTouches[0];
    if (!touch) return;
    clearLongPressTimer();
    if (state.gesture.progressSeeking) {
      event.preventDefault();
      state.gesture.progressSeeking = false;
      seekFromTouch(touch, false);
      scheduleSeekHide();
      state.gesture.suppressClickUntil = Date.now() + 350;
      return;
    }
    if (state.gesture.speedHoldActive && !state.gesture.speedHoldLocked) {
      event.preventDefault();
      restoreSpeedHold();
      state.gesture.suppressClickUntil = Date.now() + 450;
      return;
    }
    if (state.gesture.speedHoldActive && state.gesture.speedHoldLocked) {
      event.preventDefault();
      state.gesture.speedHoldActive = false;
      state.gesture.suppressClickUntil = Date.now() + 450;
      showSpeedHoldTip("已锁定 2x，上滑解锁", true);
      return;
    }
    if (state.gesture.swipeTriggered) {
      event.preventDefault();
      state.gesture.suppressClickUntil = Date.now() + 450;
      return;
    }
    if (state.gesture.speedHoldLocked) {
      const dx = touch.clientX - state.gesture.startX;
      const dy = touch.clientY - state.gesture.startY;
      if (isSwipeUp(dx, dy, SPEED_LOCK_SWIPE_PX)) {
        event.preventDefault();
        restoreSpeedHold("已解锁 2x");
        state.gesture.suppressClickUntil = Date.now() + 450;
        return;
      }
    }
    if (state.route !== "home") return;
    if (!event.target.closest(".player")) return;
    if (isPlaybackBlockedByOverlay() || state.player.commentsOpen || state.player.episodePickerOpen) return;
    const blocker = event.target.closest("button,input,textarea,.progress-line,.comment-panel,.branch-mask,.action-mask,.blackout,.episode-picker-mask");
    if (blocker && !blocker.classList.contains("tap-layer")) return;
    const dx = touch.clientX - state.gesture.startX;
    const dy = touch.clientY - state.gesture.startY;
    if (!state.gesture.homeSwipeReady && !isVerticalSwipe(dx, dy, 72)) return;
    event.preventDefault();
    state.gesture.swipeTriggered = true;
    state.gesture.suppressClickUntil = Date.now() + 500;
    playRandomDrama("home");
  }

  function clearLongPressTimer() {
    if (state.gesture.longPressTimer) clearTimeout(state.gesture.longPressTimer);
    state.gesture.longPressTimer = null;
  }

  function canHandlePlayerGesture(event) {
    if (!event.target.closest(".player")) return false;
    if (isPlaybackBlockedByOverlay() || state.player.commentsOpen || state.player.episodePickerOpen) return false;
    const blocker = event.target.closest("button,input,textarea,.progress-line,.comment-panel,.branch-mask,.action-mask,.blackout,.episode-picker-mask,.speed-menu");
    return !blocker || blocker.classList.contains("tap-layer");
  }

  function isVerticalSwipe(dx, dy, threshold) {
    return Math.abs(dy) >= threshold && Math.abs(dy) >= Math.abs(dx) * 1.25;
  }

  function isSwipeDown(dx, dy, threshold) {
    return dy >= threshold && Math.abs(dy) >= Math.abs(dx) * 1.25;
  }

  function isSwipeUp(dx, dy, threshold) {
    return dy <= -threshold && Math.abs(dy) >= Math.abs(dx) * 1.25;
  }

  function handleHomeSwipeMove(event, touch) {
    if (state.route !== "home" || state.gesture.swipeTriggered || state.gesture.speedHoldActive || state.gesture.speedHoldLocked) return false;
    if (!canHandlePlayerGesture(event)) return false;
    const dx = touch.clientX - state.gesture.startX;
    const dy = touch.clientY - state.gesture.startY;
    if (!isVerticalSwipe(dx, dy, HOME_SWIPE_TRIGGER_PX)) return false;
    clearLongPressTimer();
    state.gesture.homeSwipeReady = true;
    event.preventDefault();
    return true;
  }

  function handleSpeedHoldSwipe(event, touch) {
    const dx = touch.clientX - state.gesture.startX;
    const dy = touch.clientY - state.gesture.startY;
    if (state.gesture.speedHoldActive && !state.gesture.speedHoldLocked && isSwipeDown(dx, dy, SPEED_LOCK_SWIPE_PX)) {
      state.gesture.speedHoldLocked = true;
      state.gesture.suppressClickUntil = Date.now() + 500;
      event.preventDefault();
      showSpeedHoldTip("已锁定 2x，上滑解锁", true);
      return true;
    }
    if (state.gesture.speedHoldLocked && isSwipeUp(dx, dy, SPEED_LOCK_SWIPE_PX)) {
      state.gesture.suppressClickUntil = Date.now() + 500;
      state.gesture.swipeTriggered = true;
      event.preventDefault();
      restoreSpeedHold("已解锁 2x");
      return true;
    }
    return false;
  }

  function seekFromTouch(touch, preview) {
    seekFromClientX(touch.clientX, preview);
  }

  function seekFromClientX(clientX, preview) {
    const bar = byId("progressFill");
    const line = bar && bar.parentElement;
    const video = activeVideo();
    if (!line || !video || !video.duration) return;
    const rect = line.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const target = video.duration * ratio;
    updateProgress(target, video.duration, preview !== false);
    if (preview !== false) return;
    getVideoContext().seek(target);
    resetHighlightForSeek(target);
  }

  function navigate(route) {
    if (!route) return;
    if (!state.user && route !== "home" && route !== "mine") {
      showLoginPrompt("登录后可以进入剧场搜索和按分类找短剧");
      return;
    }
    state.route = route;
    let task = null;
    if (route === "theater" && !state.dramas.length) task = loadDramas();
    if (route === "mine") task = refreshMine();
    if (route === "rag") {
      refreshRag().catch(showError);
      return;
    }
    render();
    if (task) {
      task.then(() => {
        if (state.route === route) render();
      }).catch(showError);
    }
  }

  function openTheaterSearch(keyword) {
    if (!requireLogin("请先登录后进入剧场")) return;
    const p = state.player;
    state.theaterReturn = {
      route: state.route === "play" ? "play" : "home",
      dramaId: p.drama && p.drama.dramaId,
      episodeId: p.episode && p.episode.episodeId,
      startAt: currentVideoTime()
    };
    state.keyword = String(keyword || "");
    state.selectedCategory = "";
    if (state.keyword) saveSearch(state.keyword);
    pauseVideo();
    navigate("theater");
  }

  async function returnFromTheater() {
    const back = state.theaterReturn || { route: "home" };
    if (back.route === "play" && back.dramaId && back.episodeId) {
      await openDrama(back.dramaId, back.episodeId, back.startAt || 0, "play");
      return;
    }
    navigate("home");
  }

  async function loadDramas() {
    if (state.dramas.length) return state.dramas;
    setLoading(true);
    try {
      const list = await api.listDramas();
      state.dramas = (list || []).map(normalizeDrama);
      state.categories = buildCategories(state.dramas);
      return state.dramas;
    } finally {
      setLoading(false);
    }
  }

  async function getDramaDetailCached(dramaId) {
    const key = String(dramaId);
    if (!state.cache.dramaDetails[key]) {
      state.cache.dramaDetails[key] = await api.getDrama(dramaId);
    }
    return state.cache.dramaDetails[key];
  }

  async function getEpisodeCached(episodeId) {
    const key = String(episodeId);
    if (!state.cache.episodes[key]) {
      state.cache.episodes[key] = await api.getEpisode(episodeId);
    }
    return state.cache.episodes[key];
  }

  async function getHighlightsCached(episodeId) {
    const key = String(episodeId);
    if (!state.cache.highlights[key]) {
      state.cache.highlights[key] = await api.getHighlights(episodeId);
    }
    return state.cache.highlights[key];
  }

  async function getDanmakuCached(episodeId) {
    const key = String(episodeId);
    if (!state.cache.danmaku[key]) {
      state.cache.danmaku[key] = await api.listDanmaku(episodeId);
    }
    return state.cache.danmaku[key];
  }

  async function buildPlaybackEntry(dramaId, episodeId, startAt, mode) {
    const nextMode = mode || "play";
    const detail = await getDramaDetailCached(dramaId);
    const base = state.dramas.find((item) => sameId(item.dramaId, dramaId)) || {};
    const drama = normalizeDrama(Object.assign({}, base, detail, { dramaId: detail.dramaId || detail.id || dramaId }));
    const episodes = (detail.episodes || []).map(normalizeEpisode).sort((a, b) => Number(a.episodeNo || 0) - Number(b.episodeNo || 0));
    if (!episodes.length) throw new Error("暂无剧集");
    const localDanmakuData = nextMode === "home" ? await getLocalDanmakuData().catch(() => ({})) : {};
    const localTitleKey = nextMode === "home" ? findLocalDanmakuTitle(localDanmakuData, drama.title) : "";
    const localEpisodeNos = localTitleKey && localDanmakuData[localTitleKey] ? Object.keys(localDanmakuData[localTitleKey]) : [];
    const progress = getProgress(drama.dramaId);
    const homeTarget = nextMode === "home" && localEpisodeNos.length
      ? episodes.find((item) => localEpisodeNos.includes(String(Number(item.episodeNo) || 1)))
      : null;
    const target = episodeId
      ? episodes.find((item) => sameId(item.episodeId, episodeId))
      : homeTarget || episodes.find((item) => progress && sameId(item.episodeId, progress.episodeId)) || episodes[0];
    const [episodeRaw, highlights, social, remoteDanmaku] = await Promise.all([
      getEpisodeCached(target.episodeId),
      getHighlightsCached(target.episodeId).catch(() => []),
      state.user
        ? api.getDramaSocial(drama.dramaId).catch(() => ({ liked: false, favorited: false, likeCount: 0, favoriteCount: 0, commentCount: 0 }))
        : Promise.resolve({ liked: false, favorited: false, likeCount: 0, favoriteCount: 0, commentCount: 0 }),
      getDanmakuCached(target.episodeId).catch(() => [])
    ]);
    const episode = normalizeEpisode(episodeRaw);
    const localDanmaku = await loadLocalDanmaku(drama, episode).catch(() => []);
    const normalizedComments = [];
    const normalizedDanmaku = buildDanmakuList(localDanmaku, remoteDanmaku, normalizedComments, drama, episode);
    const danmakuBySecond = buildDanmakuSecondIndex(normalizedDanmaku);
    const initialDuration = Number(episode.duration || 0);
    const explicitStart = startAt !== undefined && startAt !== null && startAt !== "";
    const progressTime = progress && sameId(progress.episodeId, episode.episodeId) ? progress.currentTime : 0;
    const initialTime = clampInitialTime(explicitStart ? startAt : progressTime, initialDuration);
    return {
      key: `${drama.dramaId}:${episode.episodeId}:${nextMode}`,
      mode: nextMode,
      route: nextMode === "play" ? "play" : "home",
      videoUrl: episode.videoUrl,
      initialTime,
      dramaId: drama.dramaId,
      episodeId: episode.episodeId,
      createdAt: Date.now(),
      player: Object.assign(emptyPlayer(), {
        mode: nextMode,
        drama,
        episode,
        episodes,
        highlights: (highlights || []).map(normalizeHighlight),
        social: normalizeSocial(social),
        comments: normalizedComments,
        videoUrl: episode.videoUrl,
        playing: true,
        currentTime: initialTime,
        duration: initialDuration,
        progressPercent: initialDuration > 0 ? initialTime / initialDuration * 100 : 0,
        pendingInitialTime: initialTime,
        optionMeta: buildOptionMeta(highlights || []),
        remoteDanmaku: normalizedDanmaku,
        danmakuBySecond,
        lastDanmakuCheckSecond: Math.max(-1, Math.floor(initialTime) - 1)
      })
    };
  }

  function applyPlaybackEntry(entry) {
    if (!entry || !entry.player) return;
    state.player = entry.player;
    state.currentMainVideo = {
      dramaId: entry.dramaId,
      episodeId: entry.episodeId,
      videoUrl: entry.videoUrl
    };
    state.currentVideoKind = "main";
    state.generatedVideoActive = false;
    state.route = entry.route;
    syncVideoDeckVisibility();
    render();
    getVideoContext().switchSource(entry.videoUrl, entry.initialTime || 0, true, "main");
  }

  async function playRandomDrama(mode) {
    if (state.dramaSwitching) return;
    state.dramaSwitching = true;
    try {
      await loadDramas();
      if (!state.dramas.length) {
        toast("暂无短剧");
        return;
      }
      const currentId = state.player.drama && state.player.drama.dramaId;
      const pool = state.dramas.length > 1 ? state.dramas.filter((item) => !sameId(item.dramaId, currentId)) : state.dramas;
      const csvPool = await filterDramasWithLocalDanmaku(pool).catch(() => []);
      const choices = csvPool.length ? csvPool : pool;
      const drama = choices[Math.floor(Math.random() * choices.length)];
      await openDrama(drama.dramaId, null, 0, mode || "home");
    } finally {
      state.dramaSwitching = false;
    }
  }

  async function openCurrentFull() {
    if (!requireLogin("请先登录后观看完整短剧")) return;
    const p = state.player;
    if (!p.drama || !p.episode) return;
    p.mode = "play";
    p.pendingInitialTime = p.pendingInitialTime || currentVideoTime();
    p.commentsOpen = false;
    p.episodePickerOpen = false;
    p.danmakuComposerOpen = false;
    state.route = "play";
    clearWarmVideos();
    render();
  }

  async function openDrama(dramaId, episodeId, startAt, mode) {
    const nextMode = mode || "play";
    const seq = ++state.openDramaSeq;
    setLoading(true);
    try {
      const entry = await buildPlaybackEntry(dramaId, episodeId, startAt, nextMode);
      if (seq !== state.openDramaSeq) return;
      applyPlaybackEntry(entry);
    } catch (err) {
      showError(err);
    } finally {
      setLoading(false);
    }
  }

  async function switchEpisode(episodeId) {
    const p = state.player;
    if (!p.drama || !episodeId) return;
    await openDrama(p.drama.dramaId, episodeId, 0, "play");
  }

  function afterRender() {
    syncVideoDeckVisibility();
    bindVideo();
    renderPlaybackLayer();
    renderModalLayer();
    if (state.player.activeEmotionId) {
      const active = state.player.highlights.find((item) => sameId(item.highlightId, state.player.activeEmotionId));
      if (active) renderEmotion(active, { keepSession: true });
    }
  }

  function bindVideo() {
    const video = activeVideo();
    const p = state.player;
    if (!video || !p.videoUrl) return;
    const token = (p.playbackToken || 0) + 1;
    p.playbackToken = token;
    video.dataset.playbackToken = String(token);
    const isCurrent = () => state.player === p && p.playbackToken === token && activeVideo() === video;
    video.onloadedmetadata = function () {
      if (!isCurrent()) return;
      if (p.pendingInitialTime > 0 && Math.abs(video.currentTime - p.pendingInitialTime) > 1) {
        try { video.currentTime = p.pendingInitialTime; } catch (err) {}
      }
      p.duration = Number(video.duration || (p.generatedPlaying ? 0 : p.episode.duration) || p.duration || 0);
      p.currentTime = Number(video.currentTime || p.pendingInitialTime || 0);
      updateProgress(p.currentTime, p.duration, false);
      video.playbackRate = Number(p.playbackRate || 1);
      if (p.playing) {
        reflectPlayState(true);
        video.play().catch(() => {
          if (!isCurrent()) return;
          p.playing = false;
          reflectPlayState(false);
        });
      } else {
        video.pause();
        reflectPlayState(false);
      }
    };
    video.onplay = function () {
      if (!isCurrent()) return;
      p.playing = true;
      syncPlayState(video);
    };
    video.onpause = function () {
      if (!isCurrent()) return;
      p.playing = false;
      syncPlayState(video);
    };
    video.ontimeupdate = function () {
      if (!isCurrent()) return;
      const now = Date.now();
      const current = video.currentTime || 0;
      p.pendingInitialTime = current;
      const duration = p.generatedPlaying ? (video.duration || 0) : (video.duration || p.episode.duration || 0);
      updateProgress(current, duration);
      if (p.generatedPlaying) {
        checkActionPrompt(current);
        return;
      }
      checkHighlights(current);
      checkActionPrompt(current);
      checkDanmaku(current);
      if (p.drama && p.episode && state.user && now - p.lastProgressSaveAt > CONFIG.PROGRESS_SAVE_MS) {
        saveProgress(p.drama.dramaId, p.episode.episodeId, current);
        p.lastProgressSaveAt = now;
      }
    };
    video.onended = function () {
      if (!isCurrent()) return;
      if (p.generatedPlaying) {
        restoreMainVideo();
        return;
      }
      playNextEpisode();
    };
  }

  function updateProgress(current, duration, seeking) {
    const p = state.player;
    const safeDuration = Number(duration || p.duration || 0);
    const safeCurrent = Math.max(0, Number(current || 0));
    p.currentTime = safeCurrent;
    if (safeDuration) p.duration = safeDuration;
    p.progressPercent = safeDuration ? Math.max(0, Math.min(100, safeCurrent / safeDuration * 100)) : 0;
    if (seeking) {
      p.seeking = true;
      p.seekText = `${formatTime(safeCurrent)} / ${formatTime(safeDuration)}`;
    }
    const fill = byId("progressFill");
    if (fill) fill.style.width = `${p.progressPercent}%`;
    const bar = fill && fill.parentElement;
    if (bar) bar.classList.toggle("progress-bar--active", !!p.seeking);
    const seek = byId("seekTime");
    if (seek) {
      seek.textContent = p.seekText || "";
      seek.classList.toggle("show", !!p.seeking);
    }
  }

  function clearSeekHideTimer() {
    if (state.timers.seek) clearTimeout(state.timers.seek);
    state.timers.seek = null;
  }

  function scheduleSeekHide() {
    clearSeekHideTimer();
    state.timers.seek = setTimeout(() => {
      state.player.seeking = false;
      const seek = byId("seekTime");
      if (seek) seek.classList.remove("show");
      const bar = byId("progressFill") && byId("progressFill").parentElement;
      if (bar) bar.classList.remove("progress-bar--active");
    }, SEEK_PREVIEW_HIDE_MS);
  }

  function resetHighlightForSeek(current) {
    const p = state.player;
    flushHighlightStatDanmaku();
    p.shown = {};
    p.activeEmotionId = "";
    p.activeHighlightSessionKey = "";
    p.pendingHighlightStatDanmaku = null;
    p.lastDanmakuCheckSecond = Math.max(-1, Math.floor(Number(current || 0)) - 1);
    p.branchHighlight = null;
    p.actionHighlight = null;
    p.blackout = emptyBlackout();
    if (!p.generatedPlaying) {
      p.actionLockActive = false;
      p.actionVideoActive = false;
      p.actionPrompt = emptyActionPrompt();
      p.actionPromptConfig = null;
    }
    const emotionLayer = byId("emotionLayer");
    if (emotionLayer) emotionLayer.innerHTML = "";
    renderModalLayer();
    checkHighlights(Number(current || 0));
  }

  function checkHighlights(current) {
    const p = state.player;
    if (p.generatedPlaying || p.blackout.show || p.branchHighlight || p.actionHighlight || p.actionPrompt.show) return;
    const highlights = p.highlights || [];
    const activeEmotion = p.highlights.find((item) => {
      return componentTypeOf(item) === "emotion_button" && isActiveHighlight(item, current);
    });
    if (activeEmotion) {
      const id = String(activeEmotion.highlightId);
      if (String(p.activeEmotionId) !== id) {
        p.activeEmotionId = id;
        renderEmotion(activeEmotion);
      }
      p.shown[id] = true;
    } else if (p.activeEmotionId) {
      hideEmotion();
    }

    highlights.forEach((item) => {
      const type = componentTypeOf(item);
      const id = String(item.highlightId || item.id || "");
      const inWindow = isActiveHighlight(item, current);
      if (!id) return;
      if (type === "emotion_button") {
        if (!inWindow) delete p.shown[id];
        return;
      }
      const triggerOnce = !!item.triggerOnce;
      if (type === "branch_choice") {
        if (inWindow && !p.shown[id]) {
          p.shown[id] = true;
          renderBranch(item);
        }
        if (!inWindow && p.shown[id]) delete p.shown[id];
      } else if (type === "action_button") {
        if (inWindow && !p.shown[id] && !(triggerOnce && p.triggered[id])) {
          p.shown[id] = true;
          if (triggerOnce) p.triggered[id] = true;
          renderAction(item);
        }
        if (!inWindow && p.shown[id]) {
          delete p.shown[id];
          if (p.actionHighlight && sameId(p.actionHighlight.highlightId, id)) {
            p.actionHighlight = null;
            renderModalLayer();
          }
        }
      }
    });
  }

  function renderPlaybackLayer() {
    const layer = byId("sheetLayer");
    syncPlayerChromeState();
    if (!layer) return;
    if (state.player.commentsOpen) {
      layer.innerHTML = renderComments();
    } else if (state.player.episodePickerOpen) {
      layer.innerHTML = renderEpisodePicker();
    } else {
      layer.innerHTML = "";
    }
  }

  function renderModalLayer() {
    const layer = byId("modalLayer");
    if (!layer) return;
    const p = state.player;
    syncPlayerChromeState();
    if (p.danmakuComposerOpen) {
      layer.innerHTML = renderDanmakuComposer();
    } else if (p.blackout && p.blackout.show) {
      layer.innerHTML = renderBlackoutHtml();
    } else if (p.branchHighlight) {
      layer.innerHTML = renderBranchHtml(p.branchHighlight);
    } else if (p.actionPrompt && p.actionPrompt.show) {
      layer.innerHTML = renderActionPromptHtml();
    } else if (p.actionHighlight) {
      layer.innerHTML = renderActionHtml(p.actionHighlight);
    } else if (p.speedMenuOpen) {
      layer.innerHTML = renderSpeedMenuHtml();
    } else {
      layer.innerHTML = "";
    }
  }

  function syncPlayerChromeState() {
    const p = state.player;
    const commentsOpen = !!(p.commentsOpen && (state.route === "home" || state.route === "play"));
    document.body.classList.toggle("comments-open", commentsOpen);
    const playerNode = document.querySelector(".player");
    if (!playerNode) return;
    const generated = !!(p.generatedPlaying || p.actionVideoActive);
    const interaction = generated || !!(p.branchHighlight || p.actionHighlight || (p.actionPrompt && p.actionPrompt.show));
    playerNode.classList.toggle("is-interaction", interaction);
    playerNode.classList.toggle("is-generated", generated);
    playerNode.classList.toggle("comments-open", commentsOpen);
  }

  function renderSpeedMenuHtml() {
    const current = Number(state.player.playbackRate || 1);
    return `
      <div class="speed-menu" data-action="noop">
        ${SPEED_OPTIONS.map((rate) => `
          <button class="${Math.abs(current - rate) < 0.001 ? "active" : ""}" data-action="setSpeed" data-rate="${rate}">
            ${formatRate(rate)}x
          </button>
        `).join("")}
      </div>
    `;
  }

  function renderEpisodePicker() {
    const p = state.player;
    const currentId = p.episode && p.episode.episodeId;
    const drama = p.drama || {};
    const tags = normalizeTags(drama.tags).slice(0, 2);
    return `
      <div class="episode-picker-mask" data-action="closeEpisodePicker">
        <div class="episode-picker-panel" data-action="noop">
          <div class="sheet-handle"></div>
          <div class="episode-sheet-head">
            <img alt="" src="${escapeAttr(coverOf(drama))}" />
            <div>
              <div class="row"><strong>${escapeHtml(drama.title || "短剧")}</strong><button class="ghost" data-action="closeEpisodePicker">›</button></div>
              <p>已完结 · 共${Number(drama.episodeCount || p.episodes.length || 0)}集</p>
              <div class="tagline">${tags.map((tag) => `<button class="tag" data-action="tagSearch" data-keyword="${escapeAttr(tag)}">${escapeHtml(tag)} ›</button>`).join("")}</div>
            </div>
          </div>
          <h3>1-${Math.max(1, p.episodes.length)}</h3>
          <div class="episode-grid">
            ${p.episodes.map((item) => `
              <button class="episode-btn ${sameId(item.episodeId, currentId) ? "active" : ""}" data-action="switchEpisode" data-episode-id="${item.episodeId}">
                ${Number(item.episodeNo) || ""}
              </button>
            `).join("")}
          </div>
          <button class="episode-fav-btn ${p.social.favorited ? "active" : ""}" data-action="favorite">☆ 收藏</button>
        </div>
      </div>
    `;
  }

  function renderEmotion(highlight, options) {
    const layer = byId("emotionLayer");
    if (!layer) return;
    const cfg = highlight.interactionConfig || {};
    const keepSession = options && options.keepSession;
    if (!keepSession || !state.player.activeHighlightSessionKey) {
      const sessionKey = `${highlight.highlightId}_${Date.now()}_${++state.player.highlightSessionSeq}`;
      state.player.activeHighlightSessionKey = sessionKey;
      state.player.highlightLocalTapCount = 0;
      queueHighlightStatDanmaku({
        sessionKey,
        highlightId: highlight.highlightId
      }, null);
    }
    const buttons = (cfg.buttons || []).map((button) => {
      const code = button.optionCode || "";
      const icon = getEmotionIcon(code, button.icon);
      return `<button class="emotion-btn" title="${escapeAttr(button.label || code)}" data-action="emotion" data-option-code="${escapeAttr(code)}"><img alt="" src="${escapeAttr(icon)}" /><b id="emotionCount-${escapeAttr(code)}">×0</b></button>`;
    }).join("");
    layer.innerHTML = `<div class="emotion-panel">${buttons}</div>`;
  }

  function hideEmotion() {
    flushHighlightStatDanmaku();
    state.player.activeEmotionId = "";
    state.player.activeHighlightSessionKey = "";
    const layer = byId("emotionLayer");
    if (layer) layer.innerHTML = "";
  }

  function renderBranch(highlight) {
    pauseVideo();
    hideEmotion();
    const cfg = highlight.interactionConfig || {};
    const current = currentVideoTime();
    const start = Number(highlight.startTime || current || 0);
    const span = Math.max(0, Number(highlight.endTime || 0) - Number(highlight.startTime || 0));
    const base = current || start;
    state.player.resumeAt = Number(cfg.resumeTime != null ? cfg.resumeTime : base + span) || Number(highlight.endTime || base || 0);
    state.player.branchStartTime = start;
    state.player.currentBranch = highlight;
    state.player.branchHighlight = highlight;
    state.player.actionHighlight = null;
    renderModalLayer();
  }

  function renderBranchHtml(highlight) {
    const cfg = highlight.interactionConfig || {};
    const disabled = state.player.disabledOptions[String(highlight.highlightId)] || {};
    const options = (cfg.options || []).map((option, index) => `
      <button class="branch-opt ${disabled[option.optionCode] ? "branch-opt--disabled" : ""}" data-action="branch" data-index="${index}">${escapeHtml(option.label || option.optionCode || `选项 ${index + 1}`)}</button>
    `).join("");
    return `<div class="branch-mask"><div class="branch-box"><h3 class="branch-title">${escapeHtml(highlight.title || "选择剧情走向")}</h3><div class="option-list">${options}</div></div></div>`;
  }

  function renderAction(highlight) {
    pauseVideo();
    hideEmotion();
    const cfg = highlight.interactionConfig || {};
    const label = cfg.label || cfg.actionLabel || cfg.userAction || "助力";
    state.player.resumeAt = Number(cfg.resumeTime != null ? cfg.resumeTime : highlight.endTime || currentVideoTime()) || 0;
    state.player.actionLockActive = true;
    state.player.actionPromptConfig = normalizeActionPromptConfig(cfg.actionPrompt, { label, optionCode: cfg.optionCode || "action_boost" });
    state.player.actionPromptQueue = buildActionPromptQueue(cfg, { label, optionCode: cfg.optionCode || "action_boost" });
    state.player.actionHighlight = highlight;
    state.player.branchHighlight = null;
    if (shouldAutoStartAction(cfg)) {
      startActionVideo();
      return;
    }
    renderModalLayer();
  }

  function renderActionHtml(highlight) {
    const cfg = highlight.interactionConfig || {};
    return `<div class="action-mask"><div class="action-box"><button class="action-btn" data-action="actionButton">${escapeHtml(cfg.label || cfg.actionLabel || cfg.userAction || "助力")}</button></div></div>`;
  }

  function renderActionPromptHtml() {
    const prompt = state.player.actionPrompt || {};
    return `<div class="action-mask"><div class="action-box"><button class="action-btn" data-action="actionPromptButton">${escapeHtml(prompt.label || "点击继续")}</button></div></div>`;
  }

  function renderBlackoutHtml() {
    const blackout = state.player.blackout || emptyBlackout();
    return `
      <div class="blackout ${blackout.visible ? "blackout--visible" : ""}">
        ${blackout.text ? `<div class="blackout-text">${escapeHtml(blackout.text)}</div>` : ""}
        <button class="blackout-retry" data-action="retryBranch">重新选择</button>
      </div>
    `;
  }

  function renderDanmakuComposer() {
    const draft = state.player.danmakuDraft || "";
    return `
      <div class="danmaku-composer-mask" data-action="closeDanmakuComposer">
        <div class="danmaku-composer" data-action="noop">
          <div class="danmaku-composer-row">
            <button class="danmaku-trigger" data-action="noop" type="button">弹</button>
            <input id="danmakuComposerInput" maxlength="60" value="${escapeAttr(draft)}" placeholder="发一条友好的弹幕吧" />
            <button class="danmaku-submit" data-action="submitDanmaku">发送</button>
          </div>
        </div>
      </div>
    `;
  }

  async function tapEmotion(optionCode) {
    if (!requireLogin("登录后可以点击高光弹幕")) return;
    const p = state.player;
    const highlightId = p.activeEmotionId;
    if (!highlightId || !optionCode) return;
    const tapKey = `${highlightId}:${optionCode}`;
    const now = Date.now();
    if (p.lastEmotionTapKey === tapKey && now - (p.lastEmotionTapAt || 0) < 280) return;
    p.lastEmotionTapKey = tapKey;
    p.lastEmotionTapAt = now;
    const countNode = byId(`emotionCount-${optionCode}`);
    const current = Number(String(countNode && countNode.textContent || "0").replace(/\D/g, "")) + 1;
    if (countNode) countNode.textContent = `×${current}`;
    p.highlightLocalTapCount = Number(p.highlightLocalTapCount || 0) + 1;
    spawnFloat(optionCode);
    showBigImage(optionCode);
    const overlaySnapshot = {
      sessionKey: p.activeHighlightSessionKey,
      highlightId
    };
    try {
      const remote = await api.createInteraction({
        dramaId: p.drama && p.drama.dramaId,
        episodeId: p.episode && p.episode.episodeId,
        highlightId,
        interactionType: "click",
        optionCode
      });
      queueHighlightStatDanmaku(overlaySnapshot, remote);
    } catch (err) {
      queueHighlightStatDanmaku(overlaySnapshot, null);
    }
  }

  function queueHighlightStatDanmaku(overlay, remote) {
    const p = state.player;
    const sessionKey = overlay && overlay.sessionKey || p.activeHighlightSessionKey || String(overlay && overlay.highlightId || "");
    if (!sessionKey) return;
    if (p.activeHighlightSessionKey && p.activeHighlightSessionKey !== sessionKey) return;
    const statKey = `stat:${sessionKey}:${overlay && overlay.highlightId || ""}`;
    if (p.statDanmakuMap[statKey]) return;
    const localCount = Math.max(0, Number(p.highlightLocalTapCount || 0));
    const hasRemote = !!(remote && remote.participantCount != null);
    const participantCount = hasRemote ? Number(remote.participantCount || 0) : localCount;
    const totalCount = hasRemote ? Number(remote.totalCount || 0) : localCount;
    const text = participantCount > 0 || totalCount > 0
      ? `已有 ${participantCount} 人参与高光弹幕，累计 ${totalCount} 次`
      : "高光弹幕已触发，快来参与";
    p.pendingHighlightStatDanmaku = {
      sessionKey,
      highlightId: overlay && overlay.highlightId,
      text
    };
  }

  function flushHighlightStatDanmaku() {
    const p = state.player;
    const pending = p.pendingHighlightStatDanmaku;
    if (!pending) return;
    const sessionKey = pending.sessionKey || p.activeHighlightSessionKey || String(pending.highlightId || "");
    const key = `stat:${sessionKey}:${pending.highlightId || ""}`;
    if (!p.statDanmakuMap[key]) {
      p.statDanmakuMap[key] = true;
      spawnDanmaku(pending.text, "stat", { lane: 0, force: true });
    }
    p.pendingHighlightStatDanmaku = null;
  }

  async function chooseBranch(index) {
    const p = state.player;
    const highlight = p.branchHighlight;
    const cfg = highlight && highlight.interactionConfig || {};
    const option = (cfg.options || [])[index];
    p.branchHighlight = null;
    renderModalLayer();
    if (!option) {
      playVideo();
      return;
    }
    p.resumeAt = Number(option.resumeTime != null ? option.resumeTime : cfg.resumeTime || highlight.endTime || currentVideoTime()) || 0;
    const isMainline = option.branchOutcome === "MAINLINE" || option.generationMode === "MAINLINE" || option.isCorrect === true;
    if (isMainline) {
      playVideo();
      return;
    }
    await playGeneratedStory(option.generationId, {
      episodeId: p.episode && p.episode.episodeId,
      highlightId: highlight.highlightId,
      optionCode: option.optionCode
    });
  }

  async function tapAction() {
    const p = state.player;
    const highlight = p.actionHighlight;
    const cfg = highlight && highlight.interactionConfig || {};
    p.actionHighlight = null;
    renderModalLayer();
    p.resumeAt = Number(cfg.resumeTime != null ? cfg.resumeTime : highlight.endTime || currentVideoTime()) || 0;
    await playGeneratedStory(cfg.generationId, {
      episodeId: p.episode && p.episode.episodeId,
      highlightId: highlight.highlightId,
      optionCode: cfg.optionCode || "action_boost"
    });
  }

  async function playGeneratedStory(generationId, payload) {
    try {
      const story = generationId ? await api.getStory(Number(generationId)) : await api.generateStory(payload);
      const contentUrl = String(story && story.contentUrl || "");
      if (story && story.contentType === "VIDEO" && contentUrl) {
        state.player.originalUrl = state.player.videoUrl;
        state.player.videoUrl = contentUrl;
        state.player.generatedPlaying = true;
        replaceCurrentVideoSource(contentUrl, 0, true);
        return;
      }
      spawnDanmaku(story && (story.title || story.content) || "互动内容已生成", "user");
      playVideo();
    } catch (err) {
      showError(err);
      playVideo();
    }
  }

  function restoreMainVideo() {
    const p = state.player;
    p.videoUrl = p.originalUrl || p.videoUrl;
    p.originalUrl = "";
    p.generatedPlaying = false;
    replaceCurrentVideoSource(p.videoUrl, Number(p.resumeAt || 0), true);
  }

  async function chooseBranch(index) {
    const p = state.player;
    const highlight = p.branchHighlight;
    const cfg = highlight && highlight.interactionConfig || {};
    const option = (cfg.options || [])[index];
    const disabled = highlight ? p.disabledOptions[String(highlight.highlightId)] || {} : {};
    if (option && disabled[option.optionCode]) return;
    p.branchHighlight = null;
    renderModalLayer();
    if (!option) {
      playVideo();
      return;
    }
    if (option.resumeTime != null) p.resumeAt = Number(option.resumeTime) || p.resumeAt;
    p.selectedOptionCode = option.optionCode || "";
    p.selectedIsCorrect = option.branchOutcome ? option.branchOutcome === "MAINLINE" : option.isCorrect !== false;
    p.selectedFailText = option.failText || "";
    const isMainline = option.branchOutcome === "MAINLINE" || option.generationMode === "MAINLINE" || p.selectedIsCorrect;
    if (isMainline) {
      playVideo();
      return;
    }
    await playGeneratedStory(option.generationId, {
      episodeId: p.episode && p.episode.episodeId,
      highlightId: highlight && highlight.highlightId,
      optionCode: option.optionCode
    }, "branch");
  }

  async function tapAction() {
    return startActionVideo();
  }

  async function startActionVideo() {
    const p = state.player;
    const highlight = p.actionHighlight;
    const cfg = highlight && highlight.interactionConfig || {};
    p.actionHighlight = null;
    renderModalLayer();
    p.resumeAt = Number(cfg.resumeTime != null ? cfg.resumeTime : highlight && highlight.endTime || currentVideoTime()) || 0;
    p.actionLockActive = true;
    p.actionVideoActive = true;
    p.actionPrompt = emptyActionPrompt();
    p.actionOriginalRate = Number(p.playbackRate || 1);
    p.actionPromptConfig = normalizeActionPromptConfig(cfg.actionPrompt, {
      label: cfg.label || cfg.actionLabel || cfg.userAction || "助力",
      optionCode: cfg.optionCode || "action_boost"
    });
    p.actionPromptQueue = buildActionPromptQueue(cfg, {
      label: cfg.label || cfg.actionLabel || cfg.userAction || "助力",
      optionCode: cfg.optionCode || "action_boost"
    });
    if (!cfg.generationId) {
      resetActionState();
      playVideo();
      return;
    }
    await playGeneratedStory(cfg.generationId, {
      episodeId: p.episode && p.episode.episodeId,
      highlightId: highlight && highlight.highlightId,
      optionCode: cfg.optionCode || "action_boost"
    }, "action");
  }

  async function playGeneratedStory(generationId, payload, source) {
    try {
      const story = generationId ? await api.getStory(Number(generationId)) : await api.generateStory(payload);
      const contentType = String(story && (story.contentType || story.type) || "").toUpperCase();
      const contentUrl = resolveCoverUrl(story && (story.contentUrl || story.videoUrl || story.url) || "");
      if (story && contentType === "VIDEO" && contentUrl) {
        const p = state.player;
        if (!p.originalUrl) p.originalUrl = p.videoUrl;
        p.videoUrl = contentUrl;
        p.generatedPlaying = true;
        p.generatedSource = source || "";
        state.currentVideoKind = source || "generated";
        state.generatedVideoActive = true;
        p.duration = 0;
        p.currentTime = 0;
        p.progressPercent = 0;
        p.story = {
          show: true,
          generationId: story.generationId || generationId || null,
          contentType: story.contentType || "",
          title: story.title || "",
          content: story.content || "",
          contentUrl
        };
        const playerNode = document.querySelector(".player");
        if (playerNode) playerNode.classList.add("is-generated", "is-interaction");
        replaceCurrentVideoSource(contentUrl, 0, true);
        return;
      }
      spawnDanmaku(story && (story.title || story.content) || "互动内容已生成", "highlight", { lane: 1 });
      if (source === "action") resetActionState();
      playVideo();
    } catch (err) {
      showError(err);
      if (source === "action") resetActionState();
      playVideo();
    }
  }

  function restoreMainVideo() {
    const p = state.player;
    if (p.generatedSource === "branch" && p.selectedIsCorrect === false) {
      p.generatedPlaying = false;
      p.generatedSource = "";
      markOptionDisabled();
      const playerNode = document.querySelector(".player");
      if (playerNode) playerNode.classList.remove("is-generated", "is-interaction");
      showBlackout(p.selectedFailText);
      return;
    }
    p.videoUrl = p.originalUrl || p.videoUrl;
    p.originalUrl = "";
    p.generatedPlaying = false;
    p.generatedSource = "";
    state.currentVideoKind = "main";
    state.generatedVideoActive = false;
    p.story = emptyStory();
    if (p.actionVideoActive || p.actionLockActive) resetActionState();
    const playerNode = document.querySelector(".player");
    if (playerNode) playerNode.classList.remove("is-generated", "is-interaction");
    replaceCurrentVideoSource(p.videoUrl, Number(p.resumeAt || 0), true);
  }

  function markOptionDisabled() {
    const p = state.player;
    const highlightId = p.currentBranch && p.currentBranch.highlightId;
    if (highlightId == null || !p.selectedOptionCode) return;
    const key = String(highlightId);
    p.disabledOptions[key] = p.disabledOptions[key] || {};
    p.disabledOptions[key][p.selectedOptionCode] = true;
  }

  function showBlackout(text) {
    const p = state.player;
    p.blackout = { show: true, text: text || "", visible: false };
    p.story = emptyStory();
    p.playing = false;
    reflectPlayState(false);
    renderModalLayer();
    setTimeout(() => {
      if (!state.player.blackout.show) return;
      state.player.blackout.visible = true;
      renderModalLayer();
    }, 60);
  }

  function retryBranch() {
    const p = state.player;
    const branch = p.currentBranch;
    if (!branch || !p.originalUrl) return;
    p.blackout = emptyBlackout();
    p.pendingReopenBranch = true;
    p.videoUrl = p.originalUrl;
    p.generatedPlaying = false;
    p.generatedSource = "";
    state.currentVideoKind = "main";
    state.generatedVideoActive = false;
    p.story = emptyStory();
    const playerNode = document.querySelector(".player");
    if (playerNode) playerNode.classList.remove("is-generated", "is-interaction");
    replaceCurrentVideoSource(p.originalUrl, Number(p.branchStartTime || 0), false);
    p.pendingReopenBranch = false;
    renderBranch(branch);
  }

  function resetActionState() {
    const p = state.player;
    const video = activeVideo();
    if (video) video.playbackRate = Number(p.actionOriginalRate || p.playbackRate || 1);
    p.actionLockActive = false;
    p.actionVideoActive = false;
    p.actionPrompt = emptyActionPrompt();
    p.actionPromptConfig = null;
    p.actionPromptQueue = [];
    p.actionOriginalRate = Number(p.playbackRate || 1);
    p.actionHighlight = null;
    renderModalLayer();
  }

  function checkActionPrompt(current) {
    const p = state.player;
    if (!p.generatedPlaying || p.generatedSource !== "action" || !p.actionVideoActive) return;
    if (p.actionPrompt.show) return;
    const queue = p.actionPromptQueue && p.actionPromptQueue.length
      ? p.actionPromptQueue
      : (p.actionPromptConfig ? [p.actionPromptConfig] : []);
    const prompt = queue.find((item) => !item.offered && Number(current || 0) >= Number(item.showAt || 0));
    if (!prompt) return;
    if (Number(current || 0) < prompt.showAt) return;
    pauseVideo();
    prompt.offered = true;
    p.actionPrompt = {
      show: true,
      offered: true,
      clicked: false,
      label: prompt.label,
      optionCode: prompt.optionCode,
      kind: prompt.kind || "prompt",
      rate: Number(prompt.rate || 1)
    };
    renderModalLayer();
  }

  function tapActionPrompt() {
    const p = state.player;
    if (!p.actionPrompt.show) return;
    const prompt = p.actionPrompt;
    const queueItem = (p.actionPromptQueue || []).find((item) => item.optionCode === prompt.optionCode && item.kind === prompt.kind);
    if (queueItem) queueItem.clicked = true;
    if (prompt.kind === "speed") {
      const video = activeVideo();
      const rate = Math.max(0.25, Number(prompt.rate || 2));
      if (video) video.playbackRate = rate;
    }
    p.actionPrompt = Object.assign({}, prompt, { show: false, clicked: true });
    renderModalLayer();
    playVideo();
  }

  function queueHighlightStatDanmaku(overlay, remote) {
    const p = state.player;
    const sessionKey = overlay && overlay.sessionKey || p.activeHighlightSessionKey || String(overlay && overlay.highlightId || "");
    if (!sessionKey) return;
    if (p.activeHighlightSessionKey && p.activeHighlightSessionKey !== sessionKey) return;
    const statKey = `stat:${sessionKey}:${overlay && overlay.highlightId || ""}`;
    if (p.statDanmakuMap[statKey]) return;
    const localCount = Math.max(0, Number(p.highlightLocalTapCount || 0));
    const hasRemote = !!(remote && remote.participantCount != null);
    const participantCount = hasRemote ? Number(remote.participantCount || 0) : localCount;
    const totalCount = hasRemote ? Number(remote.totalCount || 0) : localCount;
    const text = participantCount > 0 || totalCount > 0
      ? `已有 ${participantCount} 人参与高光弹幕，累计 ${totalCount} 次`
      : "高光弹幕已触发，快来参与";
    p.pendingHighlightStatDanmaku = {
      sessionKey,
      highlightId: overlay && overlay.highlightId,
      text
    };
  }

  async function playNextEpisode() {
    const p = state.player;
    if (!p.episode || !p.episodes.length) return;
    if (p.drama && p.episode && state.user) saveProgress(p.drama.dramaId, p.episode.episodeId, 0);
    const index = p.episodes.findIndex((item) => sameId(item.episodeId, p.episode.episodeId));
    const next = p.episodes[index + 1];
    if (next) {
      await switchEpisode(next.episodeId);
    } else if (p.mode === "home") {
      await playRandomDrama("home");
    }
  }

  async function toggleLike() {
    if (!requireLogin("登录后可以点赞")) return;
    const p = state.player;
    if (!p.drama) return;
    try {
      const wasLiked = !!p.social.liked;
      const nextLiked = !wasLiked;
      const previousCount = Number(p.social.likeCount || 0);
      p.pendingInitialTime = currentVideoTime();
      const remote = normalizeSocial(wasLiked ? await api.unlikeDrama(p.drama.dramaId) : await api.likeDrama(p.drama.dramaId));
      p.social = Object.assign({}, remote, {
        liked: nextLiked,
        likeCount: Math.max(0, Number(remote.likeCount || (nextLiked ? previousCount + 1 : previousCount - 1)))
      });
      patchSocialButtons();
    } catch (err) {
      showError(err);
    }
  }

  async function toggleFavorite() {
    if (!requireLogin("登录后可以收藏")) return;
    const p = state.player;
    if (!p.drama) return;
    try {
      const wasFavorited = !!p.social.favorited;
      const nextFavorited = !wasFavorited;
      const previousCount = Number(p.social.favoriteCount || 0);
      p.pendingInitialTime = currentVideoTime();
      const remote = normalizeSocial(wasFavorited ? await api.unfavoriteDrama(p.drama.dramaId) : await api.favoriteDrama(p.drama.dramaId));
      p.social = Object.assign({}, remote, {
        favorited: nextFavorited,
        favoriteCount: Math.max(0, Number(remote.favoriteCount || (nextFavorited ? previousCount + 1 : previousCount - 1)))
      });
      patchSocialButtons();
    } catch (err) {
      showError(err);
    }
  }

  function patchSocialButtons() {
    const p = state.player;
    const favorite = document.querySelector('.side-action[data-action="favorite"]');
    if (favorite) {
      favorite.classList.toggle("active", !!p.social.favorited);
      const small = favorite.querySelector("small");
      if (small) small.textContent = formatCount(p.social.favoriteCount);
    }
    const like = document.querySelector(".side-action-like");
    if (like) {
      like.classList.toggle("active", !!p.social.liked);
      const small = like.querySelector("small");
      if (small) small.textContent = formatCount(p.social.likeCount);
    }
    const pickerFavorite = document.querySelector(".episode-fav-btn");
    if (pickerFavorite) pickerFavorite.classList.toggle("active", !!p.social.favorited);
  }

  async function openComments() {
    if (!requireLogin("登录后可以查看评论")) return;
    const p = state.player;
    if (!p.drama) return;
    try {
      p.comments = normalizeComments(await api.getDramaComments(p.drama.dramaId));
      p.commentsOpen = true;
      renderPlaybackLayer();
    } catch (err) {
      showError(err);
    }
  }

  function closeComments() {
    blurKeyboardInput("commentInput");
    state.player.commentsOpen = false;
    renderPlaybackLayer();
  }

  function renderComments() {
    const p = state.player;
    return `
      <div class="comment-mask" data-action="closeComments">
        <div class="comment-panel" data-action="noop">
          <div class="comment-head">
            <span></span>
            <strong>${Number(p.social.commentCount || p.comments.length || 0)} 条评论</strong>
            <button class="comment-close" data-action="closeComments" aria-label="关闭评论">×</button>
          </div>
          <div class="comment-list">
            ${p.comments.length ? p.comments.map((item) => `
              <div class="comment-item"><div class="avatar">${escapeHtml(String(item.nickname || "我").slice(0, 1))}</div><div><small>${escapeHtml(item.nickname || "用户")} · ${formatDate(item.createTime || item.createdAt)}</small><p>${escapeHtml(item.content || "")}</p></div></div>
            `).join("") : `<div class="empty">还没有评论，抢个沙发</div>`}
          </div>
          <div class="comment-input"><input id="commentInput" placeholder="善语结善缘，恶语伤人心" /><button class="primary" data-action="sendComment">发送</button></div>
        </div>
      </div>
    `;
  }

  async function sendComment() {
    if (!requireLogin("登录后可以评论")) return;
    const input = byId("commentInput");
    const content = String(input && input.value || "").trim();
    if (!content) return;
    const p = state.player;
    try {
      await api.postDramaComment(p.drama.dramaId, content, `${Date.now()}_${Math.random().toString(16).slice(2)}`);
      p.comments = normalizeComments(await api.getDramaComments(p.drama.dramaId));
      p.social.commentCount = Number(p.social.commentCount || 0) + 1;
      blurKeyboardInput("commentInput");
      renderPlaybackLayer();
    } catch (err) {
      showError(err);
    }
  }

  function openDanmakuComposer() {
    if (!requireLogin("登录后可以发送弹幕")) return;
    if (!state.player.episode) return;
    state.player.danmakuComposerOpen = true;
    renderModalLayer();
    setTimeout(() => {
      const input = byId("danmakuComposerInput");
      if (input) {
        input.focus();
        syncKeyboardSoon();
      }
    }, 60);
  }

  function closeDanmakuComposer() {
    blurKeyboardInput("danmakuComposerInput");
    state.player.danmakuComposerOpen = false;
    state.player.danmakuDraft = "";
    renderModalLayer();
  }

  async function submitDanmaku() {
    if (!requireLogin("登录后可以发送弹幕")) return;
    const input = byId("danmakuComposerInput");
    const content = String(input && input.value || state.player.danmakuDraft || "").trim();
    if (!content || !state.player.episode) return;
    try {
      const currentTime = currentVideoTime();
      await api.postDanmaku(state.player.episode.episodeId, { content, currentTime });
      const item = { content, currentTime };
      state.player.remoteDanmaku = (state.player.remoteDanmaku || []).concat([item]);
      appendDanmakuIndexItem(item);
      state.player.danmakuComposerOpen = false;
      state.player.danmakuDraft = "";
      blurKeyboardInput("danmakuComposerInput");
      renderModalLayer();
      spawnDanmaku(content, "user");
    } catch (err) {
      showError(err);
    }
  }

  async function sendDanmaku() {
    openDanmakuComposer();
  }

  function checkDanmaku(current) {
    const p = state.player;
    const second = Math.floor(current || 0);
    let from = Math.max(0, Number.isFinite(p.lastDanmakuCheckSecond) ? p.lastDanmakuCheckSecond + 1 : second);
    const to = second;
    if (to < from) {
      p.lastDanmakuCheckSecond = second;
      return;
    }
    if (to - from > 2) from = to;
    if (!p.danmakuBySecond || !Object.keys(p.danmakuBySecond).length) p.danmakuBySecond = buildDanmakuSecondIndex(p.remoteDanmaku || []);
    const list = [];
    for (let sec = from; sec <= to; sec += 1) {
      if (p.localDanmakuShown[sec]) continue;
      const bucket = (p.danmakuBySecond && p.danmakuBySecond[sec]) || [];
      bucket.slice(0, NORMAL_DANMAKU_MAX_PER_SECOND).forEach((item) => list.push(Object.assign({ __sec: sec }, item)));
      p.localDanmakuShown[sec] = true;
    }
    p.lastDanmakuCheckSecond = second;
    list.forEach((item, index) => {
      const normalLaneCount = Math.max(1, DANMAKU_LANE_COUNT - 1);
      const lane = 1 + ((Number(item.__sec || second) + index) % normalLaneCount);
      setTimeout(() => spawnDanmaku(item.content, "normal", { lane }), index * DANMAKU_QUEUE_DELAY_MS);
    });
  }

  function spawnDanmaku(text, kind, options) {
    const layer = byId("danmakuLayer");
    if (!layer) return;
    const opts = options || {};
    const content = String(text || "").trim().slice(0, 80);
    if (!content) return;
    const type = kind || "normal";
    const useLane = type === "normal" || type === "user" || type === "stat" || type === "highlight";
    let top = opts.top;
    if (top == null && useLane) {
      const requested = Number.isFinite(Number(opts.lane)) ? Number(opts.lane) : Math.floor(Math.random() * DANMAKU_LANE_COUNT);
      const lane = reserveDanmakuLane(requested, !!opts.force);
      if (lane < 0) {
        if (type === "normal") return;
        const retryCount = Number(opts.retryCount || 0);
        if (retryCount < 2) {
          setTimeout(() => spawnDanmaku(content, type, Object.assign({}, opts, { retryCount: retryCount + 1 })), 500);
        }
        return;
      }
      top = `${rpx(DANMAKU_BAND_TOP_RPX + lane * DANMAKU_LANE_GAP_RPX)}px`;
    }
    const item = document.createElement("div");
    item.className = `danmaku ${type}`;
    item.textContent = content;
    item.style.top = top != null ? String(top) : `${rpx(DANMAKU_BAND_TOP_RPX)}px`;
    layer.appendChild(item);
    setTimeout(() => item.remove(), 6500);
  }

  function reserveDanmakuLane(preferredLane, force) {
    const p = state.player;
    const now = Date.now();
    const preferred = Math.max(0, Number(preferredLane) || 0);
    for (let i = 0; i < DANMAKU_LANE_COUNT; i += 1) {
      const lane = (preferred + i) % DANMAKU_LANE_COUNT;
      if (force || !p.danmakuLaneAvailableAt[lane] || p.danmakuLaneAvailableAt[lane] <= now) {
        p.danmakuLaneAvailableAt[lane] = now + DANMAKU_LANE_COOLDOWN_MS;
        return lane;
      }
    }
    return -1;
  }

  function spawnFloat(optionCode) {
    const layer = byId("floatLayer");
    if (!layer) return;
    const width = Math.max(320, layer.clientWidth || window.innerWidth || 360);
    const height = Math.max(560, layer.clientHeight || window.innerHeight || 640);
    const points = [
      [0.16, 0.24], [0.34, 0.18], [0.56, 0.25], [0.72, 0.34],
      [0.22, 0.48], [0.44, 0.56], [0.64, 0.50], [0.80, 0.62],
      [0.30, 0.74], [0.58, 0.78]
    ];
    for (let i = 0; i < 10; i += 1) {
      const point = points[i % points.length];
      const img = document.createElement("img");
      img.className = "float-icon";
      img.src = getEmotionIcon(optionCode);
      img.style.left = `${Math.max(18, Math.min(width - 54, width * point[0] + (Math.random() * 32 - 16)))}px`;
      img.style.top = `${Math.max(96, Math.min(height - 180, height * point[1] + (Math.random() * 42 - 21)))}px`;
      img.style.setProperty("--float-dx", `${Math.round((Math.random() * 140) - 70)}px`);
      img.style.setProperty("--float-dy", `${Math.round(-90 - Math.random() * 130)}px`);
      img.style.setProperty("--float-scale", `${(0.78 + Math.random() * 0.45).toFixed(2)}`);
      layer.appendChild(img);
      setTimeout(() => img.remove(), 2200);
    }
  }

  function showBigImage(optionCode) {
    const layer = byId("bigImageLayer");
    if (!layer) return;
    const previous = layer.querySelector(".big-emotion-image");
    if (previous) previous.remove();
    const img = document.createElement("img");
    img.className = "big-emotion-image";
    img.src = getBigImage(optionCode);
    layer.appendChild(img);
    setTimeout(() => img.remove(), 1800);
  }

  async function login(register) {
    const username = String(byId("authUsername") && byId("authUsername").value || "").trim();
    const password = String(byId("authPassword") && byId("authPassword").value || "");
    if (!username || !password) {
      toast("请输入用户名和密码");
      return;
    }
    try {
      const res = register ? await api.register(username, password) : await api.login(username, password);
      localStorage.setItem(TOKEN_KEY, res.token || "");
      state.user = res.user || { username };
      localStorage.setItem(USER_KEY, JSON.stringify(state.user));
      await refreshMine();
      render();
    } catch (err) {
      showError(err);
    }
  }

  async function logout() {
    try {
      await api.logout().catch(() => {});
    } finally {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      state.user = null;
      state.mine = { liked: [], favorites: [], activeTab: state.mine.activeTab || "liked" };
      state.route = "home";
      render();
    }
  }

  async function refreshAuthUser() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    try {
      const user = await request("/auth/me");
      state.user = user;
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (err) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      state.user = null;
    }
  }

  async function refreshMine() {
    if (!state.user) return;
    await loadDramas();
    try {
      const social = await api.getMySocial();
      state.mine.liked = (social.liked || []).map(normalizeDrama);
      state.mine.favorites = (social.favorites || []).map(normalizeDrama);
    } catch (err) {
      state.mine = { liked: [], favorites: [], activeTab: state.mine.activeTab || "liked" };
    }
  }

  function doSearch() {
    state.keyword = String(byId("searchInput") && byId("searchInput").value || state.keyword || "").trim();
    if (state.keyword) saveSearch(state.keyword);
    render();
  }

  function saveSearch(keyword) {
    const text = String(keyword || "").trim();
    if (!text) return;
    state.searchHistory = [text].concat(state.searchHistory.filter((item) => item !== text)).slice(0, 6);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(state.searchHistory));
  }

  function addUploadFiles(files) {
    const mp4Files = files.filter(isMp4File);
    if (mp4Files.length !== files.length) {
      toast("只支持上传 MP4 文件");
    }
    const room = CONFIG.MAX_VIDEO_FILES - state.upload.files.length;
    const selected = mp4Files.slice(0, Math.max(0, room)).map((file, index) => {
      const episodeNo = inferEpisodeNo(file.name, state.upload.files.length + index + 1);
      return {
        id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
        file,
        name: displayNameForEpisode(episodeNo, file.name),
        originalName: file.name,
        size: file.size,
        contentType: file.type || "video/mp4",
        episodeNo,
        progress: 0,
        statusText: "待上传"
      };
    });
    state.upload.files = dedupeByEpisode(state.upload.files.concat(selected));
    render();
  }

  function isMp4File(file) {
    const type = String(file && file.type || "").toLowerCase();
    const name = String(file && file.name || "").toLowerCase();
    return type === "video/mp4" || /\.mp4$/.test(name);
  }

  function setCoverFile(file) {
    if (!file) return;
    if (!isImageFile(file)) {
      toast("请选择图片作为封面");
      return;
    }
    if (state.upload.coverPreviewUrl && state.upload.coverPreviewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(state.upload.coverPreviewUrl);
    }
    state.upload.coverFile = file;
    state.upload.coverPreviewUrl = URL.createObjectURL(file);
    render();
  }

  function isImageFile(file) {
    const type = String(file && file.type || "").toLowerCase();
    const name = String(file && file.name || "").toLowerCase();
    return type.startsWith("image/") || /\.(jpg|jpeg|png|webp)$/.test(name);
  }

  async function startUpload() {
    if (state.upload.busy) return;
    state.upload.fields.dramaTitle = valueOf("uploadDramaTitle");
    state.upload.fields.dramaDescription = valueOf("uploadDramaDescription");
    const { dramaTitle, dramaDescription } = state.upload.fields;
    if (!dramaTitle || !dramaDescription || !state.upload.files.length) {
      toast("请补全短剧名称、简介和 MP4 文件");
      return;
    }
    state.upload.busy = true;
    state.upload.jobMessage = "正在创建上传批次...";
    render();
    try {
      const files = state.upload.files.map((item) => ({
        fileName: item.name,
        fileSize: item.size,
        contentType: item.contentType,
        episodeNo: item.episodeNo
      }));
      const coverFile = state.upload.coverFile;
      const batchPayload = {
        dramaTitle,
        dramaDescription,
        files
      };
      if (coverFile) {
        batchPayload.coverFile = {
          fileName: coverFile.name,
          fileSize: coverFile.size,
          contentType: coverFile.type || "image/jpeg"
        };
      }
      const batch = await api.createUploadBatch(batchPayload);
      rememberOwnedRagBatch(batch.batchId);
      const uploads = batch.uploads || [];
      await uploadWithPool(uploads, (uploadInfo, index) => {
        const file = findUploadFile(uploadInfo, index);
        return uploadBackendFile(uploadInfo.assetId, file.file, (progress) => {
          file.progress = progress;
          file.statusText = `上传中 ${progress}%`;
          patchUploadProgress(file);
        }).then(() => {
          file.progress = 100;
          file.statusText = "已上传";
          patchUploadProgress(file);
          return uploadInfo.assetId;
        });
      });
      const assetIds = uploads.map((item) => item.assetId).filter(Boolean);
      const coverComplete = coverFile ? await uploadCoverAsset(batch.coverUpload, coverFile) : {};
      const complete = await api.completeUploadBatch(batch.batchId, Object.assign({ assetIds }, coverComplete));
      state.upload.lastComplete = { batchId: batch.batchId, assetIds, complete };
      state.upload.jobMessage = "上传完成，可进入 RAG 分析";
      toast("上传完成");
      state.route = "rag";
      await refreshRag();
    } catch (err) {
      showError(err);
      state.upload.jobMessage = `上传失败：${err.message || err}`;
    } finally {
      state.upload.busy = false;
      render();
    }
  }

  function uploadBackendFile(assetId, file, onProgress) {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append("file", file, file.name);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${CONFIG.BASE_URL}/uploads/assets/${assetId}/file`);
      const token = localStorage.getItem(TOKEN_KEY);
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.upload.onprogress = function (event) {
        if (!event.lengthComputable) return;
        onProgress(Math.round(event.loaded / event.total * 100));
      };
      xhr.onload = function () {
        let body = null;
        try { body = JSON.parse(xhr.responseText || "{}"); } catch (err) {}
        if (xhr.status >= 200 && xhr.status < 300 && (!body || body.code === 0)) {
          resolve(body ? body.data : null);
        } else {
          reject(new Error(body && body.message || `HTTP ${xhr.status}`));
        }
      };
      xhr.onerror = function () { reject(new Error("视频上传失败")); };
      xhr.send(form);
    });
  }

  function uploadCoverAsset(uploadInfo, file) {
    if (!uploadInfo || !file) return Promise.resolve({});
    const uploadUrl = uploadInfo.uploadUrl || uploadInfo.url || "";
    if (!uploadUrl) return Promise.resolve({});
    return new Promise((resolve, reject) => {
      const form = new FormData();
      const extra = uploadInfo.formData || uploadInfo.fields || {};
      Object.keys(extra).forEach((key) => form.append(key, extra[key]));
      form.append("file", file, file.name);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", uploadUrl);
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({
            coverKey: uploadInfo.objectKey || uploadInfo.key || "",
            coverUrl: uploadInfo.cosUrl || uploadInfo.coverUrl || uploadInfo.publicUrl || ""
          });
        } else {
          reject(new Error(`封面上传失败 HTTP ${xhr.status}`));
        }
      };
      xhr.onerror = function () { reject(new Error("封面上传网络异常")); };
      xhr.send(form);
    });
  }

  async function uploadWithPool(items, worker) {
    let cursor = 0;
    const results = [];
    async function run() {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        const item = items[index];
        if (String(item.uploadMethod || "").toUpperCase() === "SKIP") {
          results[index] = item.assetId;
        } else {
          results[index] = await worker(item, index);
        }
      }
    }
    const workers = Array.from({ length: Math.min(CONFIG.UPLOAD_CONCURRENCY, items.length || 1) }, run);
    await Promise.all(workers);
    return results;
  }

  function patchUploadProgress(file) {
    const row = document.querySelector(`[data-file-id="${cssEscape(file.id)}"]`);
    if (!row) return;
    const bar = row.querySelector(".progress-mini span");
    const meta = row.querySelector("small");
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, file.progress || 0))}%`;
    if (meta) meta.textContent = `${formatBytes(file.size)} · ${file.statusText || ""}`;
  }

  async function refreshRag() {
    clearRagTimer();
    if (state.upload.lastComplete && state.upload.lastComplete.batchId) {
      rememberOwnedRagBatch(state.upload.lastComplete.batchId);
    }
    state.rag.busy = true;
    render();
    try {
      const groups = await api.getPendingVideos().catch(() => []);
      state.rag.groups = normalizeGroups(groups || []);
      if (state.rag.selectedBatchId && !state.rag.groups.some((item) => sameId(item.batchId, state.rag.selectedBatchId))) {
        state.rag.selectedBatchId = null;
      }
      if (!state.rag.selectedBatchId && state.rag.groups.length) {
        state.rag.selectedBatchId = state.rag.groups[0].batchId;
      }
      state.rag.activeTask = await api.getActiveTask().catch(() => null);
      if (state.rag.activeTask && !isFinalStatus(state.rag.activeTask.status)) startRagTimer();
    } finally {
      state.rag.busy = false;
      render();
    }
  }

  async function startRag() {
    const group = state.rag.groups.find((item) => sameId(item.batchId, state.rag.selectedBatchId));
    const judgeApiKey = valueOf("ragJudgeApiKey");
    const judgeEndpointId = valueOf("ragJudgeEndpointId");
    const generationApiKey = valueOf("ragGenerationApiKey");
    if (!group || !group.pendingAssetIds || !group.pendingAssetIds.length) {
      toast("请选择待处理批次");
      return;
    }
    if (!canUseRagGroup(group)) {
      toast("只能判断自己上传的短剧或内置剧库");
      return;
    }
    if (!judgeApiKey || !judgeEndpointId) {
      toast("请填写判定模型配置");
      return;
    }
    try {
      state.rag.activeTask = await api.startAnalysisTask({
        assetIds: group.pendingAssetIds,
        judgeApiKey,
        judgeEndpointId,
        generationApiKey
      });
      startRagTimer();
      render();
    } catch (err) {
      showError(err);
    }
  }

  async function retryRag(taskId) {
    try {
      state.rag.activeTask = await api.retryAnalysisTask(taskId);
      startRagTimer();
      render();
    } catch (err) {
      showError(err);
    }
  }

  async function deleteRagVideo(assetId, name) {
    const id = Number(assetId || 0);
    if (!id || state.rag.deletingAssetId) return;
    if (!window.confirm(`确定删除「${name || "该视频"}」吗？删除后需要重新上传才能再次处理。`)) return;
    state.rag.deletingAssetId = id;
    renderPreservingScroll(".rag-screen");
    try {
      await api.deleteUploadAsset(id);
      toast("已删除");
      await refreshRag();
    } catch (err) {
      showError(err);
    } finally {
      state.rag.deletingAssetId = null;
      if (state.route === "rag") renderPreservingScroll(".rag-screen");
    }
  }

  function startRagTimer() {
    clearRagTimer();
    state.timers.rag = setInterval(async () => {
      const task = state.rag.activeTask;
      if (!task || !task.taskId) return;
      try {
        state.rag.activeTask = await api.getAnalysisTask(task.taskId);
        if (isFinalStatus(state.rag.activeTask.status)) clearRagTimer();
        if (state.route === "rag") render();
      } catch (err) {
        clearRagTimer();
      }
    }, CONFIG.RAG_POLL_MS);
  }

  function clearRagTimer() {
    if (state.timers.rag) clearInterval(state.timers.rag);
    state.timers.rag = null;
  }

  function normalizeGroups(groups) {
    return (groups || []).filter(canUseRagGroup).map((group) => {
      const videos = (group.videos || []).map((video) => {
        const ragStatus = normalizeRagStatus(video);
        return Object.assign({}, video, {
          ragStatus,
          canDelete: canDeleteUploadedVideo(video, ragStatus)
        });
      });
      const stats = buildRagStats(videos);
      const unprocessedVideos = videos.filter((video) => isStartableRagStatus(video.ragStatus));
      const processedVideos = videos.filter((video) => isProcessed(video.ragStatus));
      return Object.assign({}, group, {
        videos,
        stats,
        unprocessedVideos,
        processedVideos,
        pendingAssetIds: unprocessedVideos.map((video) => Number(video.assetId)).filter(Boolean)
      });
    }).sort((a, b) => (b.pendingAssetIds.length || 0) - (a.pendingAssetIds.length || 0) || Number(a.batchId || 0) - Number(b.batchId || 0));
  }

  function normalizeDrama(item) {
    const dramaId = item.dramaId || item.id;
    return Object.assign({}, item, {
      dramaId,
      title: item.title || item.dramaTitle || "",
      episodeCount: item.episodeCount || (item.episodes && item.episodes.length) || 0,
      tags: normalizeTags(item.tags)
    });
  }

  function normalizeEpisode(item) {
    return Object.assign({}, item, {
      episodeId: item.episodeId || item.id,
      episodeNo: item.episodeNo || item.no,
      videoUrl: item.videoUrl || item.url || "",
      duration: Number(item.duration || 0)
    });
  }

  function normalizeHighlight(item) {
    return Object.assign({}, item, {
      highlightId: item.highlightId || item.id,
      startTime: Number(item.startTime || 0),
      endTime: Number(item.endTime || 0),
      interactionConfig: normalizeConfig(item.interactionConfig)
    });
  }

  function normalizeConfig(value) {
    if (!value) return {};
    if (typeof value === "string") {
      try { return JSON.parse(value); } catch (err) { return {}; }
    }
    return value;
  }

  function normalizeSocial(value) {
    const source = value || {};
    const likeCount = Number(source.likeCount || 0);
    return {
      liked: parseBool(source.liked) && likeCount > 0,
      favorited: parseBool(source.favorited),
      likeCount,
      favoriteCount: Number(source.favoriteCount || 0),
      commentCount: Number(source.commentCount || 0)
    };
  }

  function parseBool(value) {
    if (value === true || value === 1) return true;
    if (value === false || value === 0 || value == null) return false;
    const text = String(value).trim().toLowerCase();
    return text === "true" || text === "1" || text === "yes";
  }

  function normalizeComments(value) {
    const list = Array.isArray(value) ? value : (value && value.list) || [];
    return list.map((item) => Object.assign({}, item, {
      commentId: item.commentId || item.id || `${Date.now()}_${Math.random()}`,
      nickname: item.nickname || item.username || "用户"
    }));
  }

  function normalizeDanmaku(value) {
    return (value || []).map((item) => ({
      content: item.content || item.text || item.comment || "",
      currentTime: Number(item.currentTime || item.time || item.second || item.videoTime || item.position || 0),
      likeCount: Number(item.likeCount || item.likes || 0)
    })).filter((item) => item.content);
  }

  async function getLocalDanmakuData() {
    const builtin = window.DANMAKU_DATA;
    if (builtin && typeof builtin === "object" && Object.keys(builtin).length) {
      return builtin;
    }
    if (!localDanmakuDataPromise) {
      localDanmakuDataPromise = loadLocalDanmakuCsv()
        .then((data) => Object.keys(data || {}).length ? data : fetch(LOCAL_DANMAKU_URL).then((res) => res.ok ? res.json() : {}))
        .catch(() => fetch(LOCAL_DANMAKU_URL).then((res) => res.ok ? res.json() : {}).catch(() => ({})));
    }
    return localDanmakuDataPromise;
  }

  async function loadLocalDanmakuCsv() {
    const res = await fetch(LOCAL_DANMAKU_CSV_URL);
    if (!res.ok) return {};
    const buffer = await res.arrayBuffer();
    const text = decodeCsvBuffer(buffer);
    return parseDanmakuCsv(text);
  }

  function decodeCsvBuffer(buffer) {
    const encodings = ["utf-8", "gb18030"];
    for (const name of encodings) {
      try {
        const text = new TextDecoder(name).decode(buffer);
        if (looksLikeDanmakuCsv(text)) return text;
      } catch (err) {}
    }
    return "";
  }

  function looksLikeDanmakuCsv(text) {
    const sample = String(text || "").slice(0, 2400);
    if (!sample.includes(",")) return false;
    if ((sample.match(/\uFFFD/g) || []).length > 3) return false;
    return /剧名称|弹幕内容|group_title|第\d+集/.test(sample);
  }

  function parseDanmakuCsv(text) {
    const rows = parseCsvRows(text);
    const data = {};
    rows.slice(1).forEach((row) => {
      const title = String(row[0] || "").trim();
      const episodeNo = Number(String(row[1] || "").match(/\d+/)?.[0] || 0);
      const timeMs = Number(row[2] || 0);
      const likeCount = Number(row[3] || 0);
      const content = String(row.slice(4).join(",") || "").trim();
      if (!title || !episodeNo || !content) return;
      data[title] = data[title] || {};
      data[title][episodeNo] = data[title][episodeNo] || {};
      const currentTime = Math.max(0, Math.round(timeMs / 1000));
      data[title][episodeNo][currentTime] = data[title][episodeNo][currentTime] || [];
      data[title][episodeNo][currentTime].push({
        content,
        currentTime,
        likeCount
      });
    });
    Object.keys(data).forEach((title) => {
      Object.keys(data[title]).forEach((episodeNo) => {
        Object.keys(data[title][episodeNo]).forEach((second) => {
          data[title][episodeNo][second].sort((a, b) => Number(b.likeCount || 0) - Number(a.likeCount || 0));
        });
      });
    });
    return data;
  }

  function parseCsvRows(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    const input = String(text || "").replace(/^\uFEFF/, "");
    for (let i = 0; i < input.length; i += 1) {
      const ch = input[i];
      const next = input[i + 1];
      if (quoted) {
        if (ch === "\"" && next === "\"") {
          cell += "\"";
          i += 1;
        } else if (ch === "\"") {
          quoted = false;
        } else {
          cell += ch;
        }
      } else if (ch === "\"") {
        quoted = true;
      } else if (ch === ",") {
        row.push(cell);
        cell = "";
      } else if (ch === "\n") {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else if (ch !== "\r") {
        cell += ch;
      }
    }
    if (cell || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows;
  }

  async function loadLocalDanmaku(drama, episode) {
    const data = await getLocalDanmakuData();
    const dramaTitle = String(drama && drama.title || "").trim();
    const titleKey = findLocalDanmakuTitle(data, dramaTitle);
    const episodeNo = String(Number(episode && episode.episodeNo) || 1);
    const matched = titleKey && data[titleKey] ? data[titleKey][episodeNo] : [];
    return normalizeDanmaku(flattenLocalDanmakuEpisode(matched || []));
  }

  function flattenLocalDanmakuEpisode(value) {
    if (Array.isArray(value)) return value;
    const list = [];
    Object.keys(value || {}).forEach((second) => {
      const items = Array.isArray(value[second]) ? value[second] : [value[second]];
      items.forEach((item) => {
        if (typeof item === "string") {
          list.push({ content: item, currentTime: Number(second || 0), likeCount: 0 });
        } else if (item && typeof item === "object") {
          list.push(Object.assign({ currentTime: Number(second || 0) }, item));
        }
      });
    });
    return list.sort((a, b) => Number(a.currentTime || 0) - Number(b.currentTime || 0));
  }

  function findLocalDanmakuTitle(data, title) {
    const keys = Object.keys(data || {});
    if (!title || !keys.length) return "";
    if (data[title]) return title;
    const compact = compactText(title);
    return keys.find((key) => compactText(key) === compact) || "";
  }

  function compactText(value) {
    return String(value || "").replace(/[\s,，、:：;；·\-—_《》【】（）()]/g, "").toLowerCase();
  }

  async function filterDramasWithLocalDanmaku(dramas) {
    const data = await getLocalDanmakuData();
    return (dramas || []).filter((item) => !!findLocalDanmakuTitle(data, item && item.title));
  }

  function buildDanmakuList(localDanmaku, remoteDanmaku, comments, drama, episode) {
    const local = normalizeDanmaku(localDanmaku || []);
    if (local.length) return local;
    const remote = normalizeDanmaku(remoteDanmaku || []);
    if (remote.length) return remote;
    return [];
  }

  function buildDanmakuSecondIndex(list) {
    const index = {};
    normalizeDanmaku(list || []).forEach((item) => {
      const second = Math.max(0, Math.floor(Number(item.currentTime || 0)));
      index[second] = index[second] || [];
      index[second].push(item);
    });
    Object.keys(index).forEach((second) => {
      index[second].sort((a, b) => Number(b.likeCount || 0) - Number(a.likeCount || 0));
    });
    return index;
  }

  function appendDanmakuIndexItem(item) {
    const p = state.player;
    const second = Math.max(0, Math.floor(Number(item && item.currentTime || 0)));
    p.danmakuBySecond = p.danmakuBySecond || {};
    p.danmakuBySecond[second] = (p.danmakuBySecond[second] || []).concat([item]);
    delete p.localDanmakuShown[second];
  }

  function buildCategories(dramas) {
    const set = {};
    dramas.forEach((item) => normalizeTags(item.tags).forEach((tag) => { set[tag] = true; }));
    return Object.keys(set).slice(0, 12);
  }

  function buildOptionMeta(highlights) {
    const meta = {};
    (highlights || []).forEach((highlight) => {
      const cfg = normalizeConfig(highlight.interactionConfig);
      (cfg.buttons || []).forEach((button) => {
        meta[button.optionCode] = { label: button.label, icon: getEmotionIcon(button.optionCode, button.icon) };
      });
    });
    return meta;
  }

  function normalizeTags(tags) {
    if (!tags) return [];
    const input = Array.isArray(tags) ? tags : [tags];
    const source = [];
    input.forEach((item) => {
      String(item || "").split(/[,\s/|，、;；·]+/).forEach((part) => source.push(part));
    });
    const seen = {};
    return source.map((tag) => String(tag || "").trim()).filter((tag) => {
      if (!tag || seen[tag]) return false;
      seen[tag] = true;
      return true;
    }).slice(0, 8);
  }

  function isActiveHighlight(item, current) {
    return current >= Number(item.startTime) && current <= Number(item.endTime);
  }

  function isFinalStatus(status) {
    return ["SUCCESS", "FAILED", "CANCELED"].includes(String(status || "").toUpperCase());
  }

  function normalizeRagStatus(videoOrStatus) {
    if (typeof videoOrStatus === "string") return videoOrStatus || "PENDING";
    return String(videoOrStatus && videoOrStatus.ragStatus || "PENDING").toUpperCase();
  }

  function isStartableRagStatus(status) {
    return ["PENDING", "FAILED"].includes(normalizeRagStatus(status));
  }

  function canDeleteUploadedVideo(video, status) {
    if (!video || String(video.status || "").toUpperCase() === "DELETED") return false;
    return ["WAITING_UPLOAD", "PENDING", "FAILED"].includes(normalizeRagStatus(status || video));
  }

  function isProcessed(status) {
    return ["SUCCESS", "ANALYZED", "SKIPPED", "REPLACED", "NO_INTERACTION"].includes(normalizeRagStatus(status));
  }

  function buildRagStats(videos) {
    return (videos || []).reduce((stats, video) => {
      const status = normalizeRagStatus(video);
      if (isStartableRagStatus(status)) stats.pending += 1;
      else if (status === "PROCESSING" || status === "QUEUED" || status === "RUNNING") stats.processing += 1;
      else if (status === "NO_INTERACTION") stats.noAction += 1;
      else if (isProcessed(status)) stats.generated += 1;
      else stats.pending += 1;
      return stats;
    }, { pending: 0, processing: 0, generated: 0, noAction: 0 });
  }

  function ragStatusLabel(status) {
    const text = normalizeRagStatus(status);
    if (text === "ANALYZED" || text === "SUCCESS") return "已生成互动";
    if (text === "NO_INTERACTION") return "已判断无互动点";
    if (text === "PROCESSING" || text === "QUEUED" || text === "RUNNING") return "处理中";
    if (text === "FAILED") return "失败待重试";
    return "待处理";
  }

  function ragStatusClass(status) {
    const text = normalizeRagStatus(status);
    if (text === "ANALYZED" || text === "SUCCESS") return "rag-status-generated";
    if (text === "NO_INTERACTION") return "rag-status-none";
    if (text === "FAILED") return "rag-status-failed";
    if (text === "PROCESSING" || text === "QUEUED" || text === "RUNNING") return "rag-status-processing";
    return "rag-status-pending";
  }

  function setLoading(loading) {
    state.loading = loading;
  }

  function requireLogin(message) {
    if (state.user) return true;
    showLoginPrompt(message || "登录后可以进入剧场搜索和按分类找短剧");
    return false;
  }

  function showLoginPrompt(message) {
    let mask = byId("authPrompt");
    if (!mask) {
      mask = document.createElement("div");
      mask.id = "authPrompt";
      mask.className = "auth-prompt-mask";
      document.body.appendChild(mask);
    }
    mask.innerHTML = `
      <div class="auth-prompt-card" data-action="noop">
        <strong>需要登录</strong>
        <p>${escapeHtml(message || "登录后可以进入剧场搜索和按分类找短剧")}</p>
        <div class="auth-prompt-actions">
          <button data-action="closeAuthPrompt" data-route="home">返回首页</button>
          <button data-action="authGoLogin">去登录</button>
        </div>
      </div>
    `;
    mask.classList.add("show");
  }

  function closeLoginPrompt(route) {
    const mask = byId("authPrompt");
    if (mask) mask.remove();
    if (route === "home" && state.route !== "home") navigate("home");
  }

  function goLoginFromPrompt() {
    closeLoginPrompt("");
    state.route = "mine";
    render();
  }

  function pauseVideo() {
    getVideoContext().pause();
  }

  function playVideo() {
    getVideoContext().play();
  }

  function togglePlay() {
    if (state.player.speedMenuOpen) {
      state.player.speedMenuOpen = false;
      renderModalLayer();
      return;
    }
    if (state.player.commentsOpen) {
      closeComments();
      return;
    }
    if (state.player.episodePickerOpen) {
      state.player.episodePickerOpen = false;
      renderPlaybackLayer();
      return;
    }
    if (state.player.danmakuComposerOpen) {
      closeDanmakuComposer();
      return;
    }
    if (isPlaybackBlockedByOverlay()) return;
    const video = activeVideo();
    if (!video) return;
    if (video.paused) {
      playVideo();
    } else {
      pauseVideo();
    }
  }

  function isPlaybackBlockedByOverlay() {
    const p = state.player;
    return !!(p.actionLockActive || p.blackout.show || p.branchHighlight || p.actionHighlight || p.actionPrompt.show || p.danmakuComposerOpen);
  }

  function syncPlayState(video) {
    const target = video || activeVideo();
    const playing = !!(target && !target.paused && !target.ended);
    state.player.playing = playing;
    reflectPlayState(playing);
  }

  function reflectPlayState(playing) {
    const player = document.querySelector(".player");
    if (player) player.classList.toggle("is-paused", !playing);
  }

  function toggleSpeed() {
    if (state.player.actionLockActive || isPlaybackBlockedByOverlay()) return;
    state.player.speedMenuOpen = !state.player.speedMenuOpen;
    renderModalLayer();
  }

  function setPlaybackRate(rate) {
    if (state.player.actionLockActive || isPlaybackBlockedByOverlay()) return;
    const next = SPEED_OPTIONS.includes(Number(rate)) ? Number(rate) : 1;
    state.player.pendingInitialTime = currentVideoTime();
    state.player.playbackRate = next;
    state.player.speedMenuOpen = false;
    getVideoContext().setRate(next);
    toast(next === 1 ? "已恢复正常速度" : `已切换 ${next}x`);
    patchSpeedLabels();
    renderModalLayer();
  }

  function toggleDescription() {
    const p = state.player;
    const rawDesc = String(p.drama && p.drama.description || "").trim();
    const descLimit = 44;
    p.descExpanded = !p.descExpanded;
    const line = document.querySelector(".desc-line");
    const text = line && line.querySelector(".desc-text");
    const button = line && line.querySelector(".desc-toggle");
    if (!line || !text) return;
    const nextText = p.descExpanded || rawDesc.length <= descLimit ? rawDesc : shortText(rawDesc, descLimit);
    line.classList.toggle("expanded", p.descExpanded);
    text.textContent = nextText;
    if (button) button.textContent = p.descExpanded ? "收起" : "展开";
  }

  function beginSpeedHold() {
    const target = document.elementFromPoint(state.gesture.startX, state.gesture.startY) || document.body;
    if (!canHandlePlayerGesture({ target })) return;
    const video = activeVideo();
    if (!video || state.gesture.speedHoldLocked) return;
    state.player.speedMenuOpen = false;
    renderModalLayer();
    state.gesture.speedHoldActive = true;
    state.gesture.speedHoldWasPlaying = !video.paused && !video.ended;
    state.gesture.speedHoldPrevRate = Number(state.player.playbackRate || video.playbackRate || 1);
    video.playbackRate = 2;
    state.player.playing = true;
    reflectPlayState(true);
    video.play().catch(() => {});
    patchSpeedLabels();
    showSpeedHoldTip("2x 快进中，下滑锁定", false);
  }

  function restoreSpeedHold(message) {
    const video = activeVideo();
    const restoreRate = Number(state.gesture.speedHoldPrevRate || state.player.playbackRate || 1);
    state.gesture.speedHoldActive = false;
    state.gesture.speedHoldLocked = false;
    if (video) {
      video.playbackRate = restoreRate;
      if (!state.gesture.speedHoldWasPlaying) {
        video.pause();
        state.player.playing = false;
        reflectPlayState(false);
      }
    }
    patchSpeedLabels();
    showSpeedHoldTip(message || "已恢复原速", false);
  }

  function showSpeedHoldTip(message, locked) {
    const node = byId("speedHoldTip");
    if (!node) return;
    if (state.timers.speedTip) clearTimeout(state.timers.speedTip);
    node.textContent = message || "";
    node.classList.toggle("locked", !!locked);
    node.classList.add("show");
    if (!locked) {
      state.timers.speedTip = setTimeout(() => {
        node.classList.remove("show", "locked");
      }, 900);
    }
  }

  function currentVideoTime() {
    const video = getVideoContext().node();
    return video ? video.currentTime || 0 : state.player.pendingInitialTime || 0;
  }

  function componentTypeOf(item) {
    const cfg = item && item.interactionConfig || {};
    const raw = String(cfg.componentType || item.componentType || item.highlightType || "").toLowerCase();
    if (raw === "branch") return "branch_choice";
    if (raw === "action" || raw === "action_interaction") return "action_button";
    if (raw === "cool" || raw === "funny" || raw === "famous") return "emotion_button";
    return raw;
  }

  function shouldAutoStartAction(cfg) {
    const source = cfg || {};
    return source.autoStart === true || String(source.startMode || "").toUpperCase() === "AUTO";
  }

  function normalizeActionPromptConfig(value, fallback) {
    if (!value) return null;
    const source = typeof value === "string" ? normalizeConfig(value) : value;
    if (!source || source.enabled === false) return null;
    const showAt = Number(source.showAt != null ? source.showAt : source.time != null ? source.time : source.currentTime != null ? source.currentTime : 0);
    return {
      showAt: Math.max(0, Number.isFinite(showAt) ? showAt : 0),
      label: source.label || source.buttonText || fallback && fallback.label || "点击继续",
      optionCode: source.optionCode || fallback && fallback.optionCode || "action_boost",
      kind: fallback && fallback.kind || source.kind || "prompt",
      rate: Number(source.rate || fallback && fallback.rate || 1),
      offered: false,
      clicked: false
    };
  }

  function buildActionPromptQueue(cfg, fallback) {
    const source = cfg || {};
    const queue = [];
    const first = normalizeActionPromptConfig(source.actionPrompt, Object.assign({ kind: "prompt" }, fallback || {}));
    if (first) queue.push(first);
    const boost = normalizeActionPromptConfig(source.speedBoost, {
      kind: "speed",
      label: source.speedBoost && (source.speedBoost.label || source.speedBoost.buttonText) || "加速追捕",
      optionCode: source.speedBoost && source.speedBoost.optionCode || "speed_boost",
      rate: source.speedBoost && source.speedBoost.rate || 2
    });
    if (boost) queue.push(boost);
    return queue.sort((a, b) => Number(a.showAt || 0) - Number(b.showAt || 0));
  }

  function saveProgress(dramaId, episodeId, currentTime) {
    const all = readJson(PROGRESS_KEY, {});
    all[String(dramaId)] = { episodeId, currentTime, updateTime: Date.now() };
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
  }

  function getProgress(dramaId) {
    const all = readJson(PROGRESS_KEY, {});
    return all[String(dramaId)] || null;
  }

  function currentAccountKey() {
    const user = state.user || {};
    return String(user.userId || user.id || user.username || user.nickname || "guest");
  }

  function readOwnedRagBatchIds() {
    const all = readJson(OWNED_RAG_BATCHES_KEY, {});
    const list = all[currentAccountKey()] || [];
    return list.map(Number).filter(Boolean);
  }

  function rememberOwnedRagBatch(batchId) {
    const id = Number(batchId);
    if (!id) return;
    const key = currentAccountKey();
    const all = readJson(OWNED_RAG_BATCHES_KEY, {});
    const list = (all[key] || []).map(Number).filter(Boolean);
    if (!list.includes(id)) list.push(id);
    all[key] = list;
    localStorage.setItem(OWNED_RAG_BATCHES_KEY, JSON.stringify(all));
  }

  function isBuiltinRagBatch(group) {
    return BUILTIN_RAG_BATCH_IDS.includes(Number(group && group.batchId));
  }

  function canUseRagGroup(group) {
    return !!group;
  }

  function showError(err) {
    console.error(err);
    toast(err && err.message ? err.message : "操作失败");
  }

  function toast(message) {
    const text = String(message || "");
    if (window.AndroidBridge && window.AndroidBridge.toast) {
      try { window.AndroidBridge.toast(text); } catch (err) {}
    }
    const node = byId("toast");
    if (!node) return;
    node.textContent = text;
    node.classList.add("show");
    clearTimeout(state.timers.toast);
    state.timers.toast = setTimeout(() => node.classList.remove("show"), 1900);
  }

  function readJson(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (err) {
      return fallback;
    }
  }

  function getDeviceId() {
    if (window.AndroidBridge && window.AndroidBridge.getDeviceId) {
      try { return window.AndroidBridge.getDeviceId(); } catch (err) {}
    }
    let id = localStorage.getItem("svimvp_device_id");
    if (!id) {
      id = `web_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      localStorage.setItem("svimvp_device_id", id);
    }
    return id;
  }

  function addQuery(url, params) {
    const next = new URL(url);
    Object.keys(params || {}).forEach((key) => {
      if (params[key] != null && params[key] !== "") next.searchParams.set(key, params[key]);
    });
    return next.toString();
  }

  function valueOf(id) {
    const node = byId(id);
    return String(node && node.value || "").trim();
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function cssEscape(value) {
    if (window.CSS && CSS.escape) return CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function coverOf(item) {
    return resolveCoverUrl(item && (item.coverUrl || item.cover || item.poster))
      || localCoverOf(item)
      || FALLBACK_COVER;
  }

  function resolveCoverUrl(value) {
    const url = String(value || "").trim();
    if (!url) return "";
    if (/^(https?:|blob:|data:|file:|content:)/i.test(url)) return url;
    if (url.startsWith("/assets/")) return url.slice(1);
    if (url.startsWith("assets/")) return url;
    if (url.startsWith("/")) {
      const origin = apiOrigin();
      return origin ? origin + url : url.replace(/^\/+/, "");
    }
    return url;
  }

  function localCoverOf(item) {
    if (!item) return "";
    const title = String(item.title || item.dramaTitle || "").trim();
    if (LOCAL_COVER_BY_TITLE[title]) return LOCAL_COVER_BY_TITLE[title];
    const code = String(item.dramaCode || item.code || "").trim();
    if (/^episode\d+$/i.test(code)) return `assets/covers/${code}.png`;
    const no = Number(item.dramaNo || 0);
    if (no > 0) return `assets/covers/episode${String(no).padStart(2, "0")}.png`;
    return "";
  }

  function apiOrigin() {
    try {
      return new URL(CONFIG.BASE_URL).origin;
    } catch (err) {
      return "";
    }
  }

  function shortText(text, limit) {
    const value = String(text || "");
    return value.length > limit ? `${value.slice(0, limit)}...` : value;
  }

  function sameId(a, b) {
    return String(a) === String(b);
  }

  function formatCount(value) {
    const n = Number(value || 0);
    return n >= 10000 ? `${(n / 10000).toFixed(1)}万` : String(n);
  }

  function formatTime(value) {
    const seconds = Math.max(0, Number(value || 0));
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function rpx(value) {
    const width = Math.max(320, Math.min(520, window.innerWidth || 375));
    return Math.round(Number(value || 0) * width / 750);
  }

  function formatDate(value) {
    if (!value) return "刚刚";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "刚刚";
    return `${date.getMonth() + 1}-${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  function formatBytes(value) {
    const bytes = Number(value || 0);
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  }

  function taskClass(status) {
    const text = String(status || "").toUpperCase();
    if (text === "SUCCESS") return "success";
    if (text === "FAILED") return "failed";
    return "running";
  }

  function getEmotionIcon(optionCode, fallback) {
    const code = String(optionCode || "").toLowerCase();
    if (fallback) return fallback;
    if (code.includes("sweet")) return ICONS.sweet;
    if (code.includes("shuang") || code.includes("cool")) return ICONS.cool;
    if (code.includes("scene") || code.includes("ming")) return ICONS.scene;
    return ICONS.laugh;
  }

  function getBigImage(optionCode) {
    const code = String(optionCode || "").toLowerCase();
    if (code.includes("sweet")) return ICONS.bigSweet;
    if (code.includes("shuang") || code.includes("cool")) return ICONS.bigCool;
    if (code.includes("scene") || code.includes("ming")) return ICONS.bigScene;
    return ICONS.bigLaugh;
  }

  function labelForOption(optionCode) {
    const meta = state.player.optionMeta[optionCode];
    return meta && meta.label || optionCode || "互动";
  }

  function inferEpisodeNo(name, fallback) {
    const text = String(name || "");
    const patterns = [/第\s*(\d+)\s*集/, /EP?\s*(\d+)/i, /episode\s*(\d+)/i, /(\d+)(?=\.[a-z0-9]+$)/i];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return Math.max(1, Number(match[1]) || fallback);
    }
    return fallback;
  }

  function displayNameForEpisode(episodeNo, realName) {
    const dot = String(realName || "").lastIndexOf(".");
    const ext = dot >= 0 ? String(realName).slice(dot).toLowerCase() : ".mp4";
    return `第${String(episodeNo).padStart(2, "0")}集${ext}`;
  }

  function dedupeByEpisode(files) {
    const map = new Map();
    files.forEach((file) => map.set(Number(file.episodeNo || 0), file));
    return Array.from(map.values()).sort((a, b) => Number(a.episodeNo || 0) - Number(b.episodeNo || 0));
  }

  function findUploadFile(uploadInfo, index) {
    const episodeNo = Number(uploadInfo.episodeNo || 0);
    return state.upload.files.find((item) => Number(item.episodeNo) === episodeNo)
      || state.upload.files.find((item) => item.name === uploadInfo.originalFileName)
      || state.upload.files[index];
  }
})();
