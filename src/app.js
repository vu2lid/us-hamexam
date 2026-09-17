(function() {
  "use strict";

  var APP_VERSION = window.HAM_EXAM_VERSION || "unknown";
  // Stage 5B1: the release-status label (plain for a stable version, or
  // suffixed for a prerelease -- see scripts/version-label.js) is derived
  // exactly once at build time from package.json's version, the single
  // authority. Both the Help/About text and the runtime-generated footer
  // below read this one precomputed value; neither re-implements the
  // prerelease-classification decision itself.
  var APP_VERSION_DISPLAY = window.HAM_EXAM_VERSION_DISPLAY || APP_VERSION;
  var BANKS = window.HAM_EXAM_BANKS;
  // Build-embedded figure registry, keyed by normalized figure ID (e.g. "T-1").
  // Each entry: { src: data URL, alt: string, w: number, h: number }.
  // A valid build embeds every referenced figure exactly once per document.
  var FIGURES = window.HAM_EXAM_FIGURES && typeof window.HAM_EXAM_FIGURES === "object"
    ? window.HAM_EXAM_FIGURES
    : {};
  // Stage 5A: the canonical pool/exam registry (data/pools.json, embedded by
  // scripts/build.js#buildPublicPoolsRegistry). The single source of truth
  // for pool identity, Help metadata, and mock-exam configuration -- there is
  // no POOL_META or EXAM_CONFIG duplicate of any of this anywhere else.
  var POOLS = window.HAM_EXAM_POOLS;
  window.HAM_EXAM_DIAGNOSTICS.version = APP_VERSION;

  if (!BANKS || typeof BANKS !== "object") {
    window.hamExamFail("The embedded question banks are missing or invalid.");
    return;
  }
  if (!POOLS || typeof POOLS !== "object") {
    window.hamExamFail("The embedded pool registry is missing or invalid.");
    return;
  }

  var POOL_KEYS = ["technician", "general", "extra"];
  var DEFAULT_POOL = "technician";
  var THEMES = ["light", "dark", "night"];
  var DEFAULT_THEME = "light";

  var MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  // "YYYY-MM-DD" -> "Month D, YYYY" (no leading zero on the day), matching
  // NCVEC's own date style. Pure/derived from the registry's effectiveStart/
  // effectiveEnd -- not a stored field, so there is only ever one copy of
  // each pool's actual effective dates.
  function formatPoolDate(iso) {
    var year = Number(iso.slice(0, 4));
    var month = Number(iso.slice(5, 7));
    var day = Number(iso.slice(8, 10));
    return MONTH_NAMES[month - 1] + " " + day + ", " + year;
  }

  function poolEffectiveRange(pool) {
    return formatPoolDate(pool.effectiveStart) + " – " + formatPoolDate(pool.effectiveEnd);
  }

  var currentPool = DEFAULT_POOL;
  var BANK = null;
  var index = 0;

  // Scoped study: in-memory only, never persisted. `index` addresses
  // `studyList` (the full bank when scope is "all").
  var SCOPE_API = window.HAM_EXAM_STUDY_SCOPE || null;
  var studyScope = { level: "all", id: null };
  var studyList = null;
  var waitSeconds = 10;
  var paused = false;
  var revealed = false;
  var remaining = 10;
  var timerHandle = null;
  var timerSnapshot = null;
  var helpOpen = false;
  var helpPausedTimer = false;

  // "study" | "exam-setup" | "exam" | "results"
  var mode = "study";
  // Active mock-exam session; null when no exam is running.
  var examSession = null;
  var examTimerHandle = null;
  var examTimerState = "normal"; // "normal" | "warning" | "urgent"

  // ---- Shared figure viewer (Stage 3C) ----
  // One modal viewer for study, active exam, and results review. Fit-to-window
  // and actual-size views only -- adjustable zoom, custom pinch, and drag-to-pan
  // are deferred by user decision (see docs/ROADMAP.md). Reuses
  // window.HAM_EXAM_FIGURES; no second registry, no image fetching.
  var figureViewerActive = false;
  var figureViewerOpener = null;   // the exact button that opened it
  var figureViewerMode = "fit";    // "fit" | "actual"
  var figureViewerScrollY = 0;     // background scroll position to restore
  var figureViewerStudyScrollTop = 0; // study-scroll position to restore

  // ---- Settings drawer (L1 responsive shell) ----
  // Slide-in overlay reusing the existing pool/theme/wait/reset/Mock
  // Exam/Help controls by ID -- no duplicate selectors, no parallel state.
  var settingsDrawerActive = false;
  var settingsDrawerOpener = null;
  var settingsDrawerCloseTimer = null;

  function byId(id) { return document.getElementById(id); }

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  // ---- Stage 4A2: canonical versioned storage ----
  // One canonical "ham-exam-state" document owns theme, active pool,
  // per-pool current question (stable IDs, not indexes), and bookmarks.
  // Legacy keys (ham-exam-pool/-theme/-index-<pool>/-bookmarks-<pool>) are
  // migration input only: they are never read after a successful canonical
  // load and are never written or deleted. All access goes through the
  // src/storage.js adapter; when load() reports a non-writable result
  // (future schema, unsupported schema, storage unavailable, read error),
  // the app runs entirely from the in-memory state and never saves.
  var STORAGE_API = window.HAM_EXAM_STORAGE || null;
  var POOL_REGISTRY = window.HAM_EXAM_POOLS || null;
  var storageAdapter = null;
  var appState = null;
  var storageWritable = false;

  // Stage 4A3: the two reserved preference fields. Reuse the schema's own
  // allowed-value lists (falling back to a literal copy only if the storage
  // module is missing, matching loadAppState's other STORAGE_API guards) so
  // this file never re-declares the contract. examTimerSeconds: null means
  // "use the selected pool's default"; a nonnumeric select value ("default")
  // represents that choice in the DOM without ever passing through Number(),
  // which would silently turn it into 0.
  var RECALL_SECONDS_VALUES = (STORAGE_API && STORAGE_API.RECALL_SECONDS_VALUES) || [0, 5, 10, 15, 20, 30, 60];
  var EXAM_TIMER_SECONDS_VALUES = (STORAGE_API && STORAGE_API.EXAM_TIMER_SECONDS_VALUES) || [0, 900, 1800, 2100, 3000, 3600];
  var EXAM_TIMER_DEFAULT_OPTION = "default";

  // Only used if the inlined storage module or pool registry is missing
  // (never in a valid build); keeps the app fully functional in memory.
  function fallbackDefaultState() {
    var pools = {};
    POOL_KEYS.forEach(function(key) {
      var firstId = BANKS[key].questions[0].id;
      pools[key] = {
        editionId: "",
        revisionId: "",
        currentQuestionId: firstId,
        bookmarks: [],
        scope: { level: "all", id: null },
        positions: { all: firstId }
      };
    });
    return {
      schemaVersion: 1,
      preferences: { theme: DEFAULT_THEME, recallSeconds: waitSeconds, examTimerSeconds: null },
      study: { activePool: DEFAULT_POOL, pools: pools }
    };
  }

  function poolState(pool) { return appState.study.pools[pool]; }

  function indexOfQuestionId(bank, id) {
    for (var i = 0; i < bank.length; i++) {
      if (bank[i].id === id) return i;
    }
    return -1;
  }

  // Save the complete canonical state after a user mutation. No-op when the
  // session is read-only; a failed write never throws and never disturbs the
  // in-memory state (legacy keys stay as the recovery path).
  function persistState() {
    if (!storageWritable || !storageAdapter) return;
    try { storageAdapter.save(appState); } catch (e) {}
  }

  function loadAppState() {
    if (!STORAGE_API || !POOL_REGISTRY) {
      appState = fallbackDefaultState();
      storageWritable = false;
      window.HAM_EXAM_DIAGNOSTICS.storage = { status: "missing-module", writable: false };
      return;
    }
    // The build embeds the bare pools map as window.HAM_EXAM_POOLS; the
    // storage module's canonical registry shape is { pools: <map> }, so wrap
    // if needed (idempotent when a future build embeds the wrapped shape).
    var registryArg = POOL_REGISTRY;
    if (!registryArg.pools) registryArg = { pools: registryArg };
    try {
      storageAdapter = STORAGE_API.createStorageAdapter(window.localStorage, registryArg, BANKS);
    } catch (e) {
      storageAdapter = null;
      appState = fallbackDefaultState();
      storageWritable = false;
      window.HAM_EXAM_DIAGNOSTICS.storage = { status: "adapter-error", writable: false };
      return;
    }
    var result;
    try {
      result = storageAdapter.load();
    } catch (e) {
      result = null;
    }
    if (!result || !result.state) {
      appState = fallbackDefaultState();
      storageWritable = false;
      window.HAM_EXAM_DIAGNOSTICS.storage = { status: "load-error", writable: false };
      return;
    }
    appState = result.state;
    storageWritable = !!result.writable;
    window.HAM_EXAM_DIAGNOSTICS.storage = { status: result.status, writable: storageWritable };
    if (storageWritable &&
        (result.status === STORAGE_API.STATUS.MIGRATED || result.status === STORAGE_API.STATUS.RECONCILED)) {
      // One migration/reconciliation commit attempt. If it fails (quota,
      // read-back mismatch, ...), legacy keys stay untouched and the next
      // load simply migrates again; the app keeps running either way.
      try { storageAdapter.save(appState); } catch (e) {}
    }
  }

  function applyTheme(theme) {
    if (THEMES.indexOf(theme) === -1) theme = DEFAULT_THEME;
    document.documentElement.setAttribute("data-theme", theme);
    var themeMeta = document.getElementById("theme-color");
    if (themeMeta) {
      var color = getComputedStyle(document.documentElement).getPropertyValue("--theme-color").trim();
      if (color) themeMeta.setAttribute("content", color);
    }
  }

  function setTheme(theme) {
    applyTheme(theme);
    var select = byId("theme");
    if (select) select.value = theme;
    // Persist only on an actual change -- never on startup with a state that
    // already carries this theme (avoids an unnecessary canonical rewrite).
    if (appState.preferences.theme !== theme) {
      appState.preferences.theme = theme;
      persistState();
    }
  }

  // Sets the runtime reveal delay and #wait selector from `seconds`, and
  // persists it as a change to appState.preferences.recallSeconds -- but
  // only if it actually differs from the value already there, exactly like
  // setTheme(), so calling this at startup with the just-loaded preference
  // never causes an unnecessary canonical rewrite.
  function setRecallSeconds(seconds) {
    if (RECALL_SECONDS_VALUES.indexOf(seconds) === -1) seconds = 10;
    waitSeconds = seconds;
    var select = byId("wait");
    if (select) select.value = String(seconds);
    if (appState.preferences.recallSeconds !== seconds) {
      appState.preferences.recallSeconds = seconds;
      persistState();
    }
  }

  function clearTimer() {
    if (timerHandle !== null) {
      window.clearInterval(timerHandle);
      timerHandle = null;
    }
    window.HAM_EXAM_DIAGNOSTICS.timerActive = false;
  }

  function suspendStudyTimer() {
    if (timerSnapshot) return; // preserve the original snapshot across repeated transitions
    var t = byId("timer");
    timerSnapshot = {
      waitSeconds: waitSeconds,
      remaining: remaining,
      paused: paused,
      revealed: revealed,
      active: timerHandle !== null,
      timerText: t ? t.textContent : "",
      timerClassName: t ? t.className : "timer"
    };
    clearTimer();
  }

  function resumeStudyTimer() {
    if (!timerSnapshot) return;
    var snap = timerSnapshot;
    timerSnapshot = null;

    waitSeconds = snap.waitSeconds;
    remaining = snap.remaining;
    paused = snap.paused;
    revealed = snap.revealed;
    updatePauseButton();

    if (revealed) {
      var x = studyList[index];
      var nodes = byId("choices").children;
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].getAttribute("data-letter") === x.correct)
          nodes[i].className = "choice correct";
      }
      var tr = byId("timer");
      if (tr) {
        tr.textContent = "✓ Correct answer: " + x.correct;
        tr.className = "timer ready";
      }
      window.HAM_EXAM_DIAGNOSTICS.timerActive = false;
    } else if (waitSeconds === 0) {
      var t0 = byId("timer");
      if (t0) {
        t0.className = "timer";
        t0.textContent = "Answer hidden — use Reveal Now when ready";
      }
      window.HAM_EXAM_DIAGNOSTICS.timerActive = false;
    } else if (snap.active) {
      startTimer();
    } else {
      var t1 = byId("timer");
      if (t1) {
        t1.className = snap.timerClassName;
        t1.textContent = snap.timerText;
      }
      window.HAM_EXAM_DIAGNOSTICS.timerActive = false;
    }
  }

  function populatePoolSelector() {
    var select = byId("pool");
    if (!select) return;
    // Preserve existing options if already present.
    if (select.options.length) return;
    POOL_KEYS.forEach(function(key) {
      var opt = document.createElement("option");
      opt.value = key;
      opt.textContent = BANKS[key].title;
      select.appendChild(opt);
    });
  }

  function updateCurrentPoolLabel() {
    var label = byId("current-pool-label");
    if (!label) return;
    var bank = BANKS[currentPool];
    label.textContent = bank ? bank.title : "";
  }

  // #scope-select <option value> tokens: "all", "subelement:T1", "group:T1A",
  // "question:T1A01" (question IDs never contain ":", so this round-trips).
  function scopeToToken(scope) {
    if (!scope || scope.level === "all") return "all";
    return scope.level + ":" + scope.id;
  }

  function tokenToScope(token) {
    if (token === "all") return { level: "all", id: null };
    var i = token.indexOf(":");
    if (i === -1) return { level: "all", id: null };
    return { level: token.slice(0, i), id: token.slice(i + 1) };
  }

  // Appends an <optgroup label> of <option value="prefix+code">code</option>
  // to `select`, one per entry in `codes`; no-op when `codes` is empty.
  function addScopeGroup(select, label, codes, prefix) {
    if (!codes.length) return;
    var group = document.createElement("optgroup");
    group.label = label;
    codes.forEach(function(code) {
      var opt = document.createElement("option");
      opt.value = prefix + code;
      opt.textContent = code;
      group.appendChild(opt);
    });
    select.appendChild(group);
  }

  // Rebuilds #scope-select for the current pool (always, since options
  // differ per pool). Subelement/group options come only from the
  // registry's groupBlueprint. A per-question option is deferred (would not
  // stay compact on the smallest viewport); "question" scope is otherwise
  // fully implemented and tested.
  function populateScopeSelector() {
    var select = byId("scope-select");
    if (!select) return;
    while (select.firstChild) select.removeChild(select.firstChild);

    var allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent = "All questions";
    select.appendChild(allOpt);

    if (!SCOPE_API) return;
    var enumerated = SCOPE_API.enumerateScopes(POOLS[currentPool]);
    addScopeGroup(select, "Subelement", enumerated.subelements, "subelement:");
    addScopeGroup(select, "Group", enumerated.groups, "group:");

    select.value = scopeToToken(studyScope);
  }

  // Compact top-bar indicator, e.g. "T1A"; hidden while scope is "all" (its
  // own "All questions" option text already covers that case).
  function updateScopeSummary() {
    var el = byId("scope-summary");
    if (!el) return;
    if (!studyScope || studyScope.level === "all") {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = SCOPE_API ? SCOPE_API.describeScope(studyScope) : "";
  }

  // Recomputes `studyList` from `BANK`/`studyScope`, normalizing the scope
  // (e.g. after a pool change) via SCOPE_API.resolveScope()'s "all" fallback.
  function recomputeStudyList() {
    if (SCOPE_API) {
      var resolved = SCOPE_API.resolveScope(studyScope, POOLS[currentPool], BANK);
      studyScope = resolved.scope;
      studyList = resolved.list;
    } else {
      studyScope = { level: "all", id: null };
      studyList = BANK.slice();
    }
  }

  // #scope-select's change handler; always resets position to list start.
  function setStudyScope(nextScope) {
    studyScope = nextScope;
    recomputeStudyList();
    index = 0;
    var select = byId("scope-select");
    if (select) select.value = scopeToToken(studyScope);
    updateScopeSummary();
    showQuestion();
  }

  function setPool(pool) {
    if (POOL_KEYS.indexOf(pool) === -1) pool = DEFAULT_POOL;
    currentPool = pool;
    BANK = BANKS[pool].questions;
    appState.study.activePool = pool;
    // A scope from one pool isn't meaningful for another -- always reset.
    studyScope = { level: "all", id: null };
    recomputeStudyList();
    // Resolve the stored stable question ID to a bank index; an ID that is no
    // longer in the bank (guarded above by validation/reconciliation) falls
    // back to the first question.
    var ps = poolState(pool);
    var found = indexOfQuestionId(studyList, ps.currentQuestionId);
    if (found === -1) {
      index = 0;
      ps.currentQuestionId = studyList[0].id;
      ps.positions.all = studyList[0].id;
    } else {
      index = found;
    }
    populatePoolSelector();
    var select = byId("pool");
    if (select) select.value = pool;
    updateCurrentPoolLabel();
    populateScopeSelector();
    updateScopeSummary();
  }

  // Shown only while relevant: a running or paused timed reveal. Hidden (not
  // merely disabled) once the answer is revealed or the timer is set to
  // "Never", so a paused countdown always keeps its Resume control and no
  // irrelevant Pause action lingers. Call after any change to `revealed`,
  // `waitSeconds`, or `paused`.
  function updatePauseButton() {
    var btn = byId("pause");
    if (!btn) return;
    if (revealed || waitSeconds === 0) {
      btn.hidden = true;
    } else {
      btn.hidden = false;
      btn.textContent = paused ? "Resume" : "Pause";
    }
  }

  function showQuestion() {
    // The originating study question is changing -- dismiss any open viewer.
    closeFigureViewer({ transition: true });
    clearTimer();
    paused = false;
    revealed = false;
    remaining = waitSeconds;

    var x = studyList[index];
    byId("meta").textContent = x.id + " · " + x.sub;
    byId("question").textContent = x.q;
    renderStudyFigure(x);
    byId("ref").textContent = x.ref ? "FCC reference: " + x.ref : "";
    // "/" unscoped (unchanged), "of" while a scope is active.
    byId("progress").textContent = studyScope.level === "all"
      ? "Question " + (index + 1) + " / " + studyList.length
      : "Question " + (index + 1) + " of " + studyList.length;

    var choices = byId("choices");
    while (choices.firstChild) choices.removeChild(choices.firstChild);
    "ABCD".split("").forEach(function(L) {
      var d = document.createElement("div");
      d.className = "choice";
      var span = document.createElement("span");
      span.className = "letter";
      span.textContent = L + ".";
      d.appendChild(span);
      d.appendChild(document.createTextNode(x.choices[L]));
      d.setAttribute("data-letter", L);
      choices.appendChild(d);
    });

    byId("prev").disabled = index === 0;
    byId("next").disabled = index === studyList.length - 1;

    updateBookmarkButton();
    updatePauseButton();
    // Persist the position only when it actually moved -- on startup with an
    // unchanged valid state this is a no-op and never rewrites the canonical
    // document unnecessarily.
    var ps = poolState(currentPool);
    if (ps.currentQuestionId !== x.id || ps.positions.all !== x.id) {
      ps.currentQuestionId = x.id;
      ps.positions.all = x.id;
      persistState();
    }
    startTimer();

    // Question navigation resets the middle study scroller (not the whole
    // page, which the viewport-height shell keeps from scrolling anyway).
    var scroller = byId("study-scroll");
    if (scroller) { scroller.scrollTop = 0; scroller.scrollLeft = 0; }
    window.scrollTo(0, 0);
  }

  // Shared figure renderer. `els` supplies the container and its parts by
  // reference, so the same logic drives the study card, the active mock-exam
  // question, and each results-review item. The study and exam containers use
  // fixed IDs; review items pass freshly built, class-scoped nodes so repeated
  // entries never create duplicate IDs. Keeps no state of its own.
  //
  // Metadata is written with textContent only -- manifest alt text and the
  // figure identifier are never inserted as HTML. A missing registry entry
  // never falls back to a previously shown image: it clears the image and
  // shows a concise unavailable indication. Valid builds embed every
  // referenced figure, so that branch should not occur in production.
  function clearFigureImage(img) {
    img.removeAttribute("src");
    img.removeAttribute("width");
    img.removeAttribute("height");
    img.alt = "";
  }

  // Reset an "Enlarge Figure <ID>" trigger to its hidden, inert state. Called
  // for non-figure questions and for a figure whose registry entry is missing,
  // so a stale trigger can never open the viewer on the wrong (or no) image.
  function clearEnlargeButton(btn) {
    if (!btn) return;
    btn.hidden = true;
    btn.onclick = null;
    btn.removeAttribute("data-figure-id");
    btn.textContent = "Enlarge figure";
  }

  function renderFigureInto(question, els) {
    var container = els.container;
    var caption = els.caption;
    var frame = els.frame;
    var img = els.img;
    var unavailable = els.unavailable;
    var enlarge = els.enlarge || null;
    if (!container || !caption || !frame || !img || !unavailable) return;

    var figureId = question && typeof question.figure === "string" ? question.figure : "";

    if (!figureId) {
      // Non-figure question: hide the whole container, drop any stale content.
      container.hidden = true;
      caption.textContent = "";
      unavailable.hidden = true;
      frame.hidden = true;
      clearFigureImage(img);
      clearEnlargeButton(enlarge);
      return;
    }

    caption.textContent = "Figure " + figureId;
    container.hidden = false;

    var entry = Object.prototype.hasOwnProperty.call(FIGURES, figureId) ? FIGURES[figureId] : null;
    if (!entry || typeof entry.src !== "string") {
      // Should not happen in a valid build. Never show the previous image.
      clearFigureImage(img);
      clearEnlargeButton(enlarge);
      frame.hidden = true;
      unavailable.hidden = false;
      return;
    }

    unavailable.hidden = true;
    frame.hidden = false;
    if (typeof entry.w === "number" && entry.w > 0) img.width = entry.w;
    else img.removeAttribute("width");
    if (typeof entry.h === "number" && entry.h > 0) img.height = entry.h;
    else img.removeAttribute("height");
    img.alt = typeof entry.alt === "string" ? entry.alt : "";
    img.src = entry.src;

    // A usable entry exists -> offer enlargement. `.onclick` is reassigned each
    // render (never addEventListener), so repeated renders do not stack
    // handlers. The opener passed to the viewer is this exact button, so
    // ordinary dismissal restores focus precisely -- including for two results
    // entries that share one figure.
    if (enlarge) {
      enlarge.hidden = false;
      enlarge.textContent = "Enlarge Figure " + figureId;
      enlarge.setAttribute("data-figure-id", figureId);
      enlarge.onclick = (function(fid, opener) {
        return function() { openFigureViewer(fid, opener); };
      })(figureId, enlarge);
    }
  }

  function figureElsById(prefix) {
    return {
      container: byId(prefix),
      caption: byId(prefix + "-caption"),
      frame: byId(prefix + "-frame"),
      img: byId(prefix + "-image"),
      unavailable: byId(prefix + "-unavailable"),
      enlarge: byId(prefix + "-enlarge")
    };
  }

  function renderStudyFigure(question) {
    renderFigureInto(question, figureElsById("study-figure"));
  }

  function renderExamFigure(question) {
    renderFigureInto(question, figureElsById("exam-figure"));
  }

  // Build a class-scoped figure block (no IDs) for one results-review item and
  // render `question` into it. Returns the <figure> element, or null when the
  // question has no figure so callers can skip appending anything.
  function buildReviewFigure(question) {
    if (!question || typeof question.figure !== "string" || !question.figure) return null;

    var fig = document.createElement("figure");
    fig.className = "study-figure exam-review-figure";

    var caption = document.createElement("figcaption");
    caption.className = "study-figure-caption";
    fig.appendChild(caption);

    var frame = document.createElement("div");
    frame.className = "study-figure-frame";
    var img = document.createElement("img");
    img.className = "study-figure-image";
    img.setAttribute("alt", "");
    img.setAttribute("decoding", "async");
    frame.appendChild(img);
    fig.appendChild(frame);

    // Class-scoped trigger, no id -- repeated review entries stay ID-free.
    var enlarge = document.createElement("button");
    enlarge.type = "button";
    enlarge.className = "figure-enlarge-btn exam-review-figure-enlarge";
    enlarge.hidden = true;
    enlarge.textContent = "Enlarge figure";
    fig.appendChild(enlarge);

    var unavailable = document.createElement("p");
    unavailable.className = "study-figure-unavailable";
    unavailable.textContent = "Figure unavailable in this build.";
    fig.appendChild(unavailable);

    renderFigureInto(question, {
      container: fig, caption: caption, frame: frame, img: img,
      unavailable: unavailable, enlarge: enlarge
    });
    return fig;
  }

  // ---- Shared figure viewer ----

  function updateFigureViewerDiagnostics() {
    window.HAM_EXAM_DIAGNOSTICS.figureViewer = {
      open: figureViewerActive,
      mode: figureViewerMode,
      figureId: figureViewerActive && figureViewerOpener
        ? (figureViewerOpener.getAttribute("data-figure-id") || "")
        : ""
    };
  }

  function viewerFocusables() {
    var viewer = byId("figure-viewer");
    if (!viewer) return [];
    var nodes = viewer.querySelectorAll(
      'button:not([disabled]):not([hidden]), [tabindex="0"]'
    );
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      // Skip anything inside a hidden subtree.
      if (nodes[i].offsetParent !== null || nodes[i] === document.activeElement) {
        out.push(nodes[i]);
      }
    }
    return out;
  }

  function onFigureViewerKeydown(e) {
    if (!figureViewerActive) return;
    var key = e.key || e.which;
    if (key === "Escape" || key === "Esc" || key === 27) {
      e.preventDefault();
      closeFigureViewer();
      return;
    }
    if (key !== "Tab" && key !== 9) return;
    var nodes = viewerFocusables();
    if (!nodes.length) return;
    var first = nodes[0];
    var last = nodes[nodes.length - 1];
    var viewer = byId("figure-viewer");
    var inside = viewer && viewer.contains(document.activeElement);
    if (e.shiftKey) {
      if (!inside || document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else if (!inside || document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // Belt-and-suspenders keyboard containment: if focus lands outside the open
  // viewer by any route (Tab to browser chrome and back, programmatic focus,
  // a screen-reader control), pull it back. Combined with the full-viewport
  // backdrop this blocks background interaction without relying on `inert`
  // (patchy on older WebKit) or on `aria-modal` alone.
  function onFigureViewerFocusIn(e) {
    if (!figureViewerActive) return;
    var viewer = byId("figure-viewer");
    if (viewer && !viewer.contains(e.target)) {
      var close = byId("figure-viewer-close");
      if (close) close.focus();
    }
  }

  function setFigureViewerMode(next) {
    var m = next === "actual" ? "actual" : "fit";
    figureViewerMode = m;
    var stage = byId("figure-viewer-stage");
    var fitBtn = byId("figure-viewer-fit");
    var actualBtn = byId("figure-viewer-actual");
    if (stage) {
      stage.classList.toggle("is-actual", m === "actual");
      stage.classList.toggle("is-fit", m === "fit");
      // Fit shows the whole image; actual size scrolls -- reset the scroll
      // offset so every switch (and every fresh open) starts at the top-left.
      stage.scrollTop = 0;
      stage.scrollLeft = 0;
    }
    if (fitBtn) fitBtn.setAttribute("aria-pressed", String(m === "fit"));
    if (actualBtn) actualBtn.setAttribute("aria-pressed", String(m === "actual"));
    updateFigureViewerDiagnostics();
  }

  function openFigureViewer(figureId, opener) {
    if (typeof figureId !== "string" || !figureId) return;
    var entry = Object.prototype.hasOwnProperty.call(FIGURES, figureId) ? FIGURES[figureId] : null;
    if (!entry || typeof entry.src !== "string") return; // no usable registry entry
    if (figureViewerActive) closeFigureViewer({ silent: true });
    // Drawer and viewer must not be open simultaneously, even mid-transition.
    if (settingsDrawerActive) closeSettingsDrawer({ transition: true, immediate: true });

    var viewer = byId("figure-viewer");
    var title = byId("figure-viewer-title");
    var img = byId("figure-viewer-image");
    var stage = byId("figure-viewer-stage");
    if (!viewer || !title || !img || !stage) return;

    figureViewerOpener = opener || null;
    figureViewerScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
    // In study mode the middle scroller -- not the page -- carries the
    // scroll position; capture it too so the originating scroll context
    // (study, or the page-scrolling exam/results views) is preserved.
    var studyScroller = byId("study-scroll");
    figureViewerStudyScrollTop = studyScroller ? studyScroller.scrollTop : 0;

    title.textContent = "Figure " + figureId;
    img.alt = typeof entry.alt === "string" ? entry.alt : "";
    // Intrinsic pixel size drives "actual size"; CSS (auto width/height,
    // max-* none) renders the image at its natural dimensions and the stage
    // scrolls. Fit mode constrains with max-width/height: 100%.
    img.removeAttribute("width");
    img.removeAttribute("height");
    img.src = entry.src;

    setFigureViewerMode("fit"); // always open in fit
    viewer.hidden = false;
    document.body.classList.add("figure-viewer-open");
    figureViewerActive = true;

    document.addEventListener("keydown", onFigureViewerKeydown, true);
    document.addEventListener("focusin", onFigureViewerFocusIn, true);

    var closeBtn = byId("figure-viewer-close");
    if (closeBtn) closeBtn.focus();
    updateFigureViewerDiagnostics();
  }

  // opts.transition: closed by an application transition (question/mode change,
  //   results replaced, retake). Do not restore focus to the -- now hidden or
  //   removed -- opener; let the destination's own focus handling win.
  // opts.silent: internal re-entrancy guard for reopening; skip focus/scroll.
  function closeFigureViewer(opts) {
    if (!figureViewerActive) return;
    var transition = !!(opts && opts.transition);
    var silent = !!(opts && opts.silent);
    figureViewerActive = false;

    document.removeEventListener("keydown", onFigureViewerKeydown, true);
    document.removeEventListener("focusin", onFigureViewerFocusIn, true);

    var viewer = byId("figure-viewer");
    if (viewer) {
      // Drop focus out of the dialog before hiding it, so it never lingers on
      // a now-hidden control (some WebKit builds keep activeElement there).
      // A real focus target is set below for ordinary dismissal; for a
      // transition close, focus falls to <body> and the destination view's
      // own focus handling takes over.
      if (viewer.contains(document.activeElement) &&
          document.activeElement && typeof document.activeElement.blur === "function") {
        document.activeElement.blur();
      }
      viewer.hidden = true;
    }
    document.body.classList.remove("figure-viewer-open");

    var img = byId("figure-viewer-image");
    if (img) { img.removeAttribute("src"); img.alt = ""; }
    var title = byId("figure-viewer-title");
    if (title) title.textContent = "";

    var opener = figureViewerOpener;
    figureViewerOpener = null;
    figureViewerMode = "fit";
    var stage = byId("figure-viewer-stage");
    if (stage) {
      stage.classList.remove("is-actual");
      stage.classList.add("is-fit");
      stage.scrollTop = 0;
      stage.scrollLeft = 0;
    }
    var fitBtn = byId("figure-viewer-fit");
    if (fitBtn) fitBtn.setAttribute("aria-pressed", "true");
    var actualBtn = byId("figure-viewer-actual");
    if (actualBtn) actualBtn.setAttribute("aria-pressed", "false");

    if (!silent) {
      // Preserve the background scroll position on ordinary open/close --
      // the page scroll (exam/results contexts) and the study middle
      // scroller (study context) are independent and both restored.
      if (typeof figureViewerScrollY === "number") {
        window.scrollTo(0, figureViewerScrollY);
      }
      var studyScroller = byId("study-scroll");
      if (studyScroller) studyScroller.scrollTop = figureViewerStudyScrollTop;
      if (!transition && opener && document.contains(opener) && opener.offsetParent !== null) {
        opener.focus();
      }
    }
    updateFigureViewerDiagnostics();
  }

  // ---- Settings drawer ----
  // Reuses the existing #pool/#wait/#theme/#mockExamButton/#helpButton/#reset
  // controls by ID -- no duplicate selectors, no parallel control state. Its
  // isolation approach mirrors the figure viewer: a full-viewport backdrop
  // absorbs background pointer events (present for the whole open state,
  // including both slide transitions), plus a capture-phase keydown trap and
  // a focusin guard -- not aria-modal alone.

  function updateSettingsDrawerDiagnostics() {
    window.HAM_EXAM_DIAGNOSTICS.settingsDrawer = { open: settingsDrawerActive };
  }

  function drawerFocusables() {
    var drawer = byId("settings-drawer");
    if (!drawer) return [];
    var nodes = drawer.querySelectorAll(
      'button:not([disabled]):not([hidden]), select:not([disabled]):not([hidden])'
    );
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].offsetParent !== null || nodes[i] === document.activeElement) {
        out.push(nodes[i]);
      }
    }
    return out;
  }

  function onSettingsDrawerKeydown(e) {
    if (!settingsDrawerActive) return;
    var key = e.key || e.which;
    if (key === "Escape" || key === "Esc" || key === 27) {
      e.preventDefault();
      closeSettingsDrawer();
      return;
    }
    if (key !== "Tab" && key !== 9) return;
    var nodes = drawerFocusables();
    if (!nodes.length) return;
    var first = nodes[0];
    var last = nodes[nodes.length - 1];
    var drawer = byId("settings-drawer");
    var inside = drawer && drawer.contains(document.activeElement);
    if (e.shiftKey) {
      if (!inside || document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else if (!inside || document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // Belt-and-suspenders keyboard containment, matching the figure viewer:
  // pull focus back into the drawer if it lands elsewhere by any route.
  function onSettingsDrawerFocusIn(e) {
    if (!settingsDrawerActive) return;
    var drawer = byId("settings-drawer");
    if (drawer && !drawer.contains(e.target)) {
      var close = byId("settings-drawer-close");
      if (close) close.focus();
    }
  }

  function openSettingsDrawer() {
    if (settingsDrawerActive) return;
    if (mode !== "study") return;
    // Drawer and figure viewer must not be open simultaneously.
    if (figureViewerActive) closeFigureViewer({ transition: true });

    var drawer = byId("settings-drawer");
    var menuButton = byId("menuButton");
    if (!drawer) return;
    if (settingsDrawerCloseTimer !== null) {
      window.clearTimeout(settingsDrawerCloseTimer);
      settingsDrawerCloseTimer = null;
    }

    settingsDrawerOpener = menuButton || null;
    drawer.hidden = false;
    if (menuButton) menuButton.setAttribute("aria-expanded", "true");
    settingsDrawerActive = true;

    // Force layout between removing `hidden` and adding `.open` so the
    // browser paints the closed (translated-out) position first and the
    // transition actually plays, instead of jumping straight to open.
    // (Deliberately not `requestAnimationFrame`: a frozen fake clock in
    // tests -- Playwright's `page.clock` mocks rAF too -- would otherwise
    // leave the panel permanently off-screen.)
    void drawer.offsetWidth;
    drawer.classList.add("open");

    document.addEventListener("keydown", onSettingsDrawerKeydown, true);
    document.addEventListener("focusin", onSettingsDrawerFocusIn, true);

    var closeBtn = byId("settings-drawer-close");
    if (closeBtn) closeBtn.focus();
    updateSettingsDrawerDiagnostics();
  }

  // opts.transition: closed by an application transition (Help/Mock Exam
  //   opening, or a mode change) -- destination focus wins over restoring
  //   focus to Menu, matching the figure viewer's convention.
  // opts.immediate: skip the exit transition and hide synchronously. Used
  //   when the figure viewer is about to open, so the two overlays are never
  //   simultaneously present (even mid-transition) -- not just never both
  //   reachable.
  function closeSettingsDrawer(opts) {
    if (!settingsDrawerActive) return;
    var transition = !!(opts && opts.transition);
    var immediate = !!(opts && opts.immediate);
    settingsDrawerActive = false;

    document.removeEventListener("keydown", onSettingsDrawerKeydown, true);
    document.removeEventListener("focusin", onSettingsDrawerFocusIn, true);

    var drawer = byId("settings-drawer");
    var menuButton = byId("menuButton");
    if (menuButton) menuButton.setAttribute("aria-expanded", "false");

    if (drawer && drawer.contains(document.activeElement) &&
        document.activeElement && typeof document.activeElement.blur === "function") {
      document.activeElement.blur();
    }

    var reduceMotion = immediate || prefersReducedMotion();
    if (drawer) {
      drawer.classList.remove("open");
      if (settingsDrawerCloseTimer !== null) {
        window.clearTimeout(settingsDrawerCloseTimer);
        settingsDrawerCloseTimer = null;
      }
      if (reduceMotion) {
        drawer.hidden = true;
      } else {
        // Keep the overlay (and its background-blocking backdrop) present
        // until the exit transition finishes, then remove it from the a11y
        // tree and layout. A fixed delay avoids relying on `transitionend`,
        // which can be skipped or fire more than once across properties.
        settingsDrawerCloseTimer = window.setTimeout(function() {
          settingsDrawerCloseTimer = null;
          drawer.hidden = true;
        }, 260);
      }
    }

    var opener = settingsDrawerOpener;
    settingsDrawerOpener = null;
    if (!transition && opener && document.contains(opener) && opener.offsetParent !== null) {
      opener.focus();
    }
    updateSettingsDrawerDiagnostics();
  }

  function updateBookmarkButton() {
    var btn = byId("bookmark");
    if (!btn) return;
    var x = studyList[index];
    var list = poolState(currentPool).bookmarks;
    var isMarked = list.indexOf(x.id) !== -1;
    btn.setAttribute("aria-pressed", String(isMarked));
    btn.textContent = isMarked ? "Remove bookmark" : "Bookmark";
    btn.classList.toggle("bookmarked", isMarked);
  }

  function toggleBookmark() {
    var x = studyList[index];
    var list = poolState(currentPool).bookmarks;
    var pos = list.indexOf(x.id);
    if (pos === -1) {
      list.push(x.id);
    } else {
      list.splice(pos, 1);
    }
    persistState();
    updateBookmarkButton();
  }

  function renderHelp() {
    var versionText = byId("help-version-text");
    if (versionText) versionText.textContent = APP_VERSION_DISPLAY;

    var list = byId("help-pool-list");
    if (!list) return;
    while (list.firstChild) list.removeChild(list.firstChild);

    POOL_KEYS.forEach(function(key) {
      var meta = POOLS[key];
      var bank = BANKS[key];
      var count = bank && bank.questions ? bank.questions.length : meta.expectedCount;
      var li = document.createElement("li");
      li.className = "help-pool-entry";

      var name = document.createElement("span");
      name.className = "help-pool-name";
      name.textContent = bank.title + " — ";
      li.appendChild(name);

      var desc = document.createTextNode(
        "Element " + meta.element + ", " + count + " questions, effective " + poolEffectiveRange(meta) + ". "
      );
      li.appendChild(desc);

      var link = document.createElement("a");
      link.href = meta.sourceUrl;
      link.textContent = "NCVEC source";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      li.appendChild(link);

      var errata = document.createElement("div");
      errata.className = "help-pool-meta";
      errata.textContent = meta.errataLabel + "; withdrawn questions are excluded where applicable.";
      li.appendChild(errata);

      list.appendChild(li);
    });
  }

  function openHelp() {
    if (helpOpen) return;
    if (mode !== "study") return;
    // Help & About lives inside the settings drawer; close it before showing
    // Help so destination focus (below) wins over restoring focus to Menu.
    closeSettingsDrawer({ transition: true, immediate: true });
    closeFigureViewer({ transition: true });
    helpOpen = true;

    // Pause an active timer while Help is open, then resume on close.
    helpPausedTimer = false;
    if (timerHandle !== null && !paused && !revealed && waitSeconds > 0) {
      paused = true;
      helpPausedTimer = true;
      updatePauseButton();
    }

    renderHelp();

    var helpPanel = byId("help");
    if (helpPanel) helpPanel.hidden = false;
    hideStudyUI();

    // Set the hash before focusing: navigating to a fragment can itself move
    // focus (to the target if focusable, else back to <body> per the HTML
    // fragment-navigation steps), which would otherwise undo an earlier
    // explicit focus() call made before this line.
    if (window.location.hash !== "#help") {
      window.location.hash = "#help";
    }

    var closeButton = byId("closeHelp");
    if (closeButton) closeButton.focus();
    // Scroll last: a fragment-navigation-driven scroll-into-view (from the
    // hash assignment above, or from focusing an off-screen control) can
    // otherwise be applied after an earlier scrollTo and win.
    window.scrollTo(0, 0);
  }

  function closeHelp() {
    if (!helpOpen) return;
    helpOpen = false;

    var helpPanel = byId("help");
    if (helpPanel) helpPanel.hidden = true;
    showStudyUI();

    if (helpPausedTimer) {
      paused = false;
      helpPausedTimer = false;
      updatePauseButton();
    }

    // Help & About is reached through the settings drawer, which is closed;
    // return focus to the Menu button that reveals it, not the (now
    // unreachable) button inside the closed drawer.
    var menuButton = byId("menuButton");
    if (menuButton) menuButton.focus();

    if (window.location.hash === "#help") {
      // Replace history entry to avoid leaving #help in the URL.
      try {
        if (window.history.replaceState) {
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
        } else {
          window.location.hash = "";
        }
      } catch (e) {
        window.location.hash = "";
      }
    }
  }

  // ---- Exam mode helpers ----

  function updateExamDiagnostics() {
    window.HAM_EXAM_DIAGNOSTICS.examMode = mode;
    window.HAM_EXAM_DIAGNOSTICS.examSession = examSession;
    window.HAM_EXAM_DIAGNOSTICS.examTimerActive = examTimerHandle !== null;
  }

  function formatExamTime(totalSeconds) {
    var m = Math.floor(totalSeconds / 60);
    var s = totalSeconds % 60;
    return (m < 10 ? "0" + m : m) + ":" + (s < 10 ? "0" + s : s);
  }

  function announceTimerState(msg) {
    var el = byId("exam-timer-announce");
    if (!el) return;
    el.textContent = msg;
  }

  function updateExamTimerDisplay() {
    var el = byId("exam-timer");
    if (!el || !examSession) return;
    if (examSession.timeLimitSeconds === 0) {
      el.textContent = "No time limit";
      el.className = "exam-timer";
      return;
    }
    var seconds = examSession.remainingSeconds;
    var prefix = "";
    var className = "exam-timer";
    var newState = "normal";
    if (seconds <= 60) {
      className += " urgent";
      prefix = "Urgent: ";
      newState = "urgent";
    } else if (seconds <= 300) {
      className += " warning";
      prefix = "Warning: ";
      newState = "warning";
    }
    el.className = className;
    el.textContent = prefix + "Time remaining: " + formatExamTime(seconds);
    if (newState !== examTimerState) {
      examTimerState = newState;
      if (newState === "warning") {
        announceTimerState("Warning: less than 5 minutes remaining on the practice timer.");
      } else if (newState === "urgent") {
        announceTimerState("Urgent: less than 1 minute remaining on the practice timer.");
      }
    }
  }

  function stopExamTimer() {
    if (examTimerHandle !== null) {
      window.clearInterval(examTimerHandle);
      examTimerHandle = null;
    }
    updateExamDiagnostics();
  }

  function updateExamTimer() {
    if (!examSession || examSession.timeLimitSeconds === 0) {
      stopExamTimer();
      return;
    }
    var remaining = Math.ceil((examSession.deadline - Date.now()) / 1000);
    examSession.remainingSeconds = remaining;
    if (remaining <= 0) {
      examSession.remainingSeconds = 0;
      updateExamTimerDisplay();
      stopExamTimer();
      submitExam({ timedOut: true });
      return;
    }
    updateExamTimerDisplay();
    updateExamDiagnostics();
  }

  function startExamTimer() {
    stopExamTimer();
    examTimerState = "normal";
    announceTimerState("");
    if (!examSession || examSession.timeLimitSeconds === 0) {
      updateExamTimerDisplay();
      return;
    }
    var now = Date.now();
    examSession.startedAt = now;
    examSession.deadline = now + examSession.timeLimitSeconds * 1000;
    examSession.remainingSeconds = examSession.timeLimitSeconds;
    updateExamTimerDisplay();
    examTimerHandle = window.setInterval(updateExamTimer, 1000);
    updateExamDiagnostics();
  }

  function scoreExam(session) {
    var questions = session.questions;
    var answers = session.answers;
    var correct = 0;
    var incorrect = 0;
    var unanswered = 0;
    var bySubelement = {};

    questions.forEach(function(q) {
      var sub = q.sub || "Unknown";
      if (!bySubelement[sub]) {
        bySubelement[sub] = { correct: 0, total: 0 };
      }
      bySubelement[sub].total++;

      var selected = answers[q.id];
      if (!selected) {
        unanswered++;
      } else if (selected === q.correct) {
        correct++;
        bySubelement[sub].correct++;
      } else {
        incorrect++;
      }
    });

    var total = questions.length;
    var percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
    var config = POOLS[session.poolKey];
    var passingScore = config ? config.passingScore : 0;

    return {
      correct: correct,
      incorrect: incorrect,
      unanswered: unanswered,
      total: total,
      percentage: percentage,
      passingScore: passingScore,
      passed: correct >= passingScore,
      bySubelement: bySubelement
    };
  }

  // The study shell (top bar, scrollable middle, bottom bar) is one element,
  // so Help / Mock Exam setup / active exam / results hide it as a unit. The
  // settings drawer is a separate overlay and is closed explicitly wherever
  // study mode is left (see openHelp/openExamSetup), not by hiding the shell.
  // Hide/show #study-viewport (the outer wrapper), not just #study-shell:
  // .study-viewport claims height:100dvh so the optional PWA install banner
  // and the shell share one available-height calculation (see
  // src/style.css). Hiding only the inner #study-shell would leave that
  // 100dvh-tall wrapper present-but-empty while Help/exam panels are shown,
  // pushing them down the page by a full viewport height.
  function hideStudyUI() {
    var viewport = byId("study-viewport");
    if (viewport) viewport.hidden = true;
  }

  function showStudyUI() {
    var viewport = byId("study-viewport");
    if (viewport) viewport.hidden = false;
  }

  // Refreshes the "Pool default" option's label with the given pool's
  // configured duration (the canonical registry, POOLS, is the one source of
  // truth for it; no duplicate metadata here) and returns that duration in
  // seconds.
  function updateExamTimerDefaultOption(poolKey) {
    var config = POOLS[poolKey];
    var seconds = config ? config.defaultTimeLimitSeconds : 0;
    var select = byId("exam-timer-select");
    var option = select ? select.querySelector('option[value="' + EXAM_TIMER_DEFAULT_OPTION + '"]') : null;
    if (option) option.textContent = "Pool default (" + Math.round(seconds / 60) + " minutes)";
    return seconds;
  }

  // Applies the persisted preference to #exam-timer-select for the given
  // pool: null selects "Pool default" (its label already reflects this
  // pool's duration); a fixed numeric preference selects that exact value
  // regardless of pool, so re-selecting the same pool or switching to
  // another one never disturbs a fixed choice. Called both when setup opens
  // and when the exam pool changes -- one path for both, like
  // updateExamSetupMeta() already does for the metadata list.
  function applyExamTimerSelection(poolKey) {
    updateExamTimerDefaultOption(poolKey);
    var select = byId("exam-timer-select");
    if (!select) return;
    var pref = appState.preferences.examTimerSeconds;
    select.value = (pref === null) ? EXAM_TIMER_DEFAULT_OPTION : String(pref);
  }

  function updateExamSetupMeta() {
    var select = byId("exam-pool-select");
    var poolKey = select ? select.value : POOL_KEYS[0];
    var config = POOLS[poolKey];
    if (!config) return;

    var meta = byId("exam-setup-meta");
    if (!meta) return;
    while (meta.firstChild) meta.removeChild(meta.firstChild);

    function addRow(term, detail) {
      var dt = document.createElement("dt");
      dt.textContent = term;
      var dd = document.createElement("dd");
      dd.textContent = String(detail);
      meta.appendChild(dt);
      meta.appendChild(dd);
    }

    addRow("FCC element", config.element);
    addRow("Questions", config.examQuestionCount);
    addRow("Passing score", config.passingScore + " of " + config.examQuestionCount);
    addRow("Pool effective", poolEffectiveRange(config));

    applyExamTimerSelection(poolKey);
  }

  function openExamSetup() {
    if (mode !== "study") return;
    // Mock Exam lives inside the settings drawer; close it before showing
    // setup so destination focus (the pool select, below) wins over Menu.
    closeSettingsDrawer({ transition: true, immediate: true });
    closeFigureViewer({ transition: true });
    suspendStudyTimer();
    mode = "exam-setup";

    hideStudyUI();
    var setupPanel = byId("exam-setup");
    if (setupPanel) setupPanel.hidden = false;

    var select = byId("exam-pool-select");
    if (select && select.options.length === 0) {
      POOL_KEYS.forEach(function(key) {
        var opt = document.createElement("option");
        opt.value = key;
        var config = POOLS[key];
        opt.textContent = (config ? config.displayName : key) + " (Element " + (config ? config.element : "?") + ")";
        select.appendChild(opt);
      });
    }
    // Default the exam pool to the active study pool every time setup opens,
    // before metadata and timer defaults are derived from the selection.
    if (select) select.value = currentPool;
    updateExamSetupMeta();

    if (select) select.focus();
    updateExamDiagnostics();
    window.scrollTo(0, 0);
  }

  function closeExamSetup() {
    if (mode !== "exam-setup") return;
    mode = "study";
    var setupPanel = byId("exam-setup");
    if (setupPanel) setupPanel.hidden = true;
    showStudyUI();
    resumeStudyTimer();
    // Mock Exam is reached through the settings drawer, which is closed;
    // return focus to Menu, not the (now unreachable) button inside it.
    var menuButton = byId("menuButton");
    if (menuButton) menuButton.focus();
    updateExamDiagnostics();
    window.scrollTo(0, 0);
  }

  function startExam(poolKey) {
    var ENGINE = window.HAM_EXAM_ENGINE;
    if (!ENGINE) { window.hamExamFail("Exam engine not available."); return; }
    var poolConfig = POOLS[poolKey];
    var questions;
    try {
      questions = ENGINE.selectExamQuestions(poolKey, BANKS, Math.random, poolConfig);
    } catch (e) {
      window.hamExamFail("Could not build exam: " + (e.message || String(e)));
      return;
    }

    // Resolve the effective duration: "Pool default" (or a missing select)
    // uses this pool's configured default; any other value is a number as-is
    // -- including a non-schema value a test injected for short-duration
    // timer coverage (see wireControls()'s change handler for why that never
    // becomes a stored preference). Only the resulting number is ever stored
    // on examSession; the selection itself is never persisted here.
    var timerSelect = byId("exam-timer-select");
    var timeLimitSeconds;
    if (!timerSelect || timerSelect.value === EXAM_TIMER_DEFAULT_OPTION) {
      timeLimitSeconds = poolConfig ? poolConfig.defaultTimeLimitSeconds : 0;
    } else {
      timeLimitSeconds = Number(timerSelect.value);
      if (isNaN(timeLimitSeconds)) timeLimitSeconds = 0;
    }

    examSession = {
      poolKey: poolKey,
      questions: questions,
      index: 0,
      answers: {},
      timeLimitSeconds: timeLimitSeconds,
      remainingSeconds: timeLimitSeconds,
      startedAt: null,
      deadline: null,
      timedOut: false
    };
    mode = "exam";
    suspendStudyTimer();

    var setupPanel = byId("exam-setup");
    if (setupPanel) setupPanel.hidden = true;
    var sessionPanel = byId("exam-session");
    if (sessionPanel) sessionPanel.hidden = false;

    showExamQuestion();
    startExamTimer();
    updateExamDiagnostics();
    // Move focus into the newly displayed session view.
    var sessionHeading = byId("exam-session-heading");
    if (sessionHeading) sessionHeading.focus();
    window.scrollTo(0, 0);
  }

  function showExamQuestion() {
    if (!examSession) return;
    // The originating exam question is changing -- dismiss any open viewer.
    closeFigureViewer({ transition: true });
    var q = examSession.questions[examSession.index];
    var total = examSession.questions.length;
    var idx = examSession.index;

    byId("exam-progress").textContent = "Question " + (idx + 1) + " of " + total;
    byId("exam-q-meta").textContent = q.id + " · " + q.sub;
    byId("exam-question").textContent = q.q;
    // Figure sits between the question text and the answer fieldset, never
    // inside it -- the fieldset keeps its question-specific legend and radio
    // group intact. Cleared/hidden for questions without a figure.
    renderExamFigure(q);

    var fieldset = byId("exam-choices");
    while (fieldset.firstChild) fieldset.removeChild(fieldset.firstChild);

    // The fieldset must retain a legend so the radio group has an accessible name.
    var legend = document.createElement("legend");
    legend.className = "visually-hidden";
    legend.textContent = "Answer choices for " + q.id;
    fieldset.appendChild(legend);

    var savedAnswer = examSession.answers[q.id];
    var groupName = "exam-answer-" + q.id;

    "ABCD".split("").forEach(function(L) {
      var label = document.createElement("label");
      label.className = "exam-choice-label" + (savedAnswer === L ? " selected" : "");

      var radio = document.createElement("input");
      radio.type = "radio";
      radio.name = groupName;
      radio.value = L;
      radio.className = "exam-choice-radio";
      if (savedAnswer === L) radio.checked = true;

      (function(capturedLabel, capturedL) {
        radio.onchange = function() {
          if (!this.checked) return;
          examSession.answers[q.id] = capturedL;
          var siblings = fieldset.querySelectorAll(".exam-choice-label");
          for (var i = 0; i < siblings.length; i++) {
            siblings[i].classList.remove("selected");
          }
          capturedLabel.classList.add("selected");
          updateExamDiagnostics();
        };
      })(label, L);

      var letterSpan = document.createElement("span");
      letterSpan.className = "exam-choice-letter";
      letterSpan.setAttribute("aria-hidden", "true");
      letterSpan.textContent = L + ".";

      var textSpan = document.createElement("span");
      textSpan.className = "exam-choice-text";
      textSpan.textContent = q.choices[L];

      label.appendChild(radio);
      label.appendChild(letterSpan);
      label.appendChild(textSpan);
      fieldset.appendChild(label);
    });

    byId("exam-prev").disabled = idx === 0;
    byId("exam-next").disabled = idx === total - 1;
    window.scrollTo(0, 0);
  }

  function examNext() {
    if (!examSession) return;
    if (examSession.index < examSession.questions.length - 1) {
      examSession.index++;
      showExamQuestion();
    }
  }

  function examPrev() {
    if (!examSession) return;
    if (examSession.index > 0) {
      examSession.index--;
      showExamQuestion();
    }
  }

  function exitExam() {
    if (!window.confirm("Exit the mock exam? Your progress will not be saved.")) return;
    closeFigureViewer({ transition: true });
    stopExamTimer();
    announceTimerState("");
    examSession = null;
    mode = "study";
    renderExamFigure(null);
    var sessionPanel = byId("exam-session");
    if (sessionPanel) sessionPanel.hidden = true;
    showStudyUI();
    resumeStudyTimer();
    // Mock Exam is reached through the settings drawer, which is closed;
    // return focus to Menu, not the (now unreachable) button inside it.
    var menuButton = byId("menuButton");
    if (menuButton) menuButton.focus();
    updateExamDiagnostics();
    window.scrollTo(0, 0);
  }

  function submitExam(opts) {
    if (!examSession || mode !== "exam") return;
    var timedOut = !!(opts && opts.timedOut);
    if (timedOut) {
      examSession.timedOut = true;
      stopExamTimer();
      announceTimerState("Time expired. Exam submitted automatically.");
      showExamResults();
      return;
    }
    var total = examSession.questions.length;
    var answered = Object.keys(examSession.answers).length;
    var unanswered = total - answered;
    if (unanswered > 0) {
      if (!window.confirm(
        "You have " + unanswered + " unanswered question" +
        (unanswered === 1 ? "" : "s") +
        " out of " + total + ". Submit anyway? Unanswered questions count as incorrect."
      )) return;
    }
    stopExamTimer();
    announceTimerState("");
    showExamResults();
  }

  function showExamResults() {
    if (!examSession) return;
    // Results replace the session view (this is also the timer-expiry path):
    // close the viewer without restoring focus to the now-hidden opener so the
    // results heading focus below takes effect.
    closeFigureViewer({ transition: true });
    mode = "results";

    var sessionPanel = byId("exam-session");
    if (sessionPanel) sessionPanel.hidden = true;
    var resultsPanel = byId("exam-results");
    if (resultsPanel) resultsPanel.hidden = false;

    var statusEl = byId("exam-result-status");
    if (statusEl) {
      statusEl.textContent = examSession.timedOut
        ? "Time expired — submitted automatically"
        : "Submitted manually";
    }

    var score = scoreExam(examSession);

    var summary = byId("exam-score-summary");
    if (summary) {
      while (summary.firstChild) summary.removeChild(summary.firstChild);

      var mainBox = document.createElement("div");
      mainBox.className = "exam-score-box exam-score-main";
      var pct = document.createElement("span");
      pct.className = "exam-score-value";
      pct.textContent = score.percentage + "%";
      mainBox.appendChild(pct);
      var verdict = document.createElement("span");
      verdict.className = "exam-score-verdict " + (score.passed ? "passed" : "failed");
      verdict.textContent = score.passed ? "Pass" : "Needs review";
      mainBox.appendChild(verdict);
      summary.appendChild(mainBox);

      [
        { label: "Correct", value: score.correct },
        { label: "Incorrect", value: score.incorrect },
        { label: "Unanswered", value: score.unanswered },
        { label: "Total", value: score.total },
        { label: "Passing", value: score.passingScore }
      ].forEach(function(b) {
        var box = document.createElement("div");
        box.className = "exam-score-box";
        var val = document.createElement("span");
        val.className = "exam-score-value";
        val.textContent = String(b.value);
        var lbl = document.createElement("span");
        lbl.className = "exam-score-label";
        lbl.textContent = b.label;
        box.appendChild(val);
        box.appendChild(lbl);
        summary.appendChild(box);
      });
    }

    var subBody = byId("exam-subelement-body");
    if (subBody) {
      while (subBody.firstChild) subBody.removeChild(subBody.firstChild);

      Object.keys(score.bySubelement).sort().forEach(function(sub) {
        var row = document.createElement("tr");
        row.className = "exam-sub-row";
        var data = score.bySubelement[sub];

        var head = document.createElement("th");
        head.setAttribute("scope", "row");
        head.textContent = sub;
        row.appendChild(head);

        [data.correct, data.total].forEach(function(val) {
          var cell = document.createElement("td");
          cell.textContent = String(val);
          row.appendChild(cell);
        });
        subBody.appendChild(row);
      });
    }

    var reviewList = byId("exam-review-list");
    if (reviewList) {
      while (reviewList.firstChild) reviewList.removeChild(reviewList.firstChild);

      examSession.questions.forEach(function(q) {
        var selected = examSession.answers[q.id];
        var isCorrect = selected && selected === q.correct;
        var isUnanswered = !selected;
        var itemClass = isCorrect ? "correct" : (isUnanswered ? "unanswered" : "incorrect");
        var statusText = isCorrect ? "Correct" : (isUnanswered ? "Unanswered" : "Incorrect");

        var item = document.createElement("div");
        item.className = "exam-review-item " + itemClass;

        var meta = document.createElement("div");
        meta.className = "exam-review-meta";
        var idSpan = document.createElement("span");
        idSpan.textContent = q.id + " · " + q.sub;
        var statusSpan = document.createElement("span");
        statusSpan.className = "exam-review-status";
        statusSpan.textContent = statusText;
        meta.appendChild(idSpan);
        meta.appendChild(statusSpan);
        item.appendChild(meta);

        var qText = document.createElement("div");
        qText.className = "exam-review-question";
        qText.textContent = q.q;
        item.appendChild(qText);

        // Keep the diagram with its own question's text and answer feedback.
        // Only figure-bearing questions get a figure block; unrelated rows get
        // nothing. Multiple questions sharing a figure reuse the same registry
        // data URL without duplicating the build-time registry.
        var reviewFigure = buildReviewFigure(q);
        if (reviewFigure) item.appendChild(reviewFigure);

        var userAns = document.createElement("div");
        userAns.className = "exam-review-answer";
        var userLabel = document.createElement("span");
        userLabel.className = "label";
        userLabel.textContent = "Your answer:";
        userAns.appendChild(userLabel);
        if (selected) {
          userAns.appendChild(document.createTextNode(" " + selected + " — " + q.choices[selected]));
        } else {
          userAns.appendChild(document.createTextNode(" Unanswered"));
        }
        item.appendChild(userAns);

        var correctAns = document.createElement("div");
        correctAns.className = "exam-review-correct";
        var correctLabel = document.createElement("span");
        correctLabel.className = "label";
        correctLabel.textContent = "Correct answer:";
        correctAns.appendChild(correctLabel);
        correctAns.appendChild(document.createTextNode(" " + q.correct + " — " + q.choices[q.correct]));
        item.appendChild(correctAns);

        if (q.ref) {
          var ref = document.createElement("div");
          ref.className = "exam-review-ref";
          ref.textContent = "FCC reference: " + q.ref;
          item.appendChild(ref);
        }

        reviewList.appendChild(item);
      });
    }

    updateExamDiagnostics();
    var heading = byId("exam-results-heading");
    if (heading) heading.focus();
    window.scrollTo(0, 0);
  }

  function returnToStudyFromResults() {
    if (mode !== "results") return;
    closeFigureViewer({ transition: true });
    examSession = null;
    mode = "study";
    renderExamFigure(null);
    var resultsPanel = byId("exam-results");
    if (resultsPanel) resultsPanel.hidden = true;
    showStudyUI();
    resumeStudyTimer();
    // Mock Exam is reached through the settings drawer, which is closed;
    // return focus to Menu, not the (now unreachable) button inside it.
    var menuButton = byId("menuButton");
    if (menuButton) menuButton.focus();
    updateExamDiagnostics();
    window.scrollTo(0, 0);
  }

  function retakeExam() {
    if (mode !== "results" || !examSession) return;
    closeFigureViewer({ transition: true });
    var poolKey = examSession.poolKey;
    stopExamTimer();
    examSession = null;
    var resultsPanel = byId("exam-results");
    if (resultsPanel) resultsPanel.hidden = true;
    startExam(poolKey);
  }

  function finishExam() {
    submitExam();
  }

  // ---- End exam mode helpers ----

  function startTimer() {
    var t = byId("timer");
    t.className = "timer";
    if (waitSeconds === 0) {
      t.textContent = "Answer hidden — use Reveal Now when ready";
      return;
    }
    t.textContent = "⏱ Revealing in " + remaining + " seconds…";
    timerHandle = window.setInterval(function() {
      if (paused || revealed) return;
      remaining -= 1;
      if (remaining > 0) {
        t.textContent = "⏱ Revealing in " + remaining + " second" +
          (remaining === 1 ? "" : "s") + "…";
      } else {
        clearTimer();
        revealAnswer();
      }
    }, 1000);
    window.HAM_EXAM_DIAGNOSTICS.timerActive = true;
  }

  function revealAnswer() {
    if (revealed) return;
    revealed = true;
    clearTimer();
    var x = studyList[index];
    var nodes = byId("choices").children;
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute("data-letter") === x.correct)
        nodes[i].className = "choice correct";
    }
    var t = byId("timer");
    t.textContent = "✓ Correct answer: " + x.correct;
    t.className = "timer ready";
    updatePauseButton();
  }

  function next() { if (index < studyList.length - 1) { index++; showQuestion(); } }
  function previous() { if (index > 0) { index--; showQuestion(); } }

  function resetProgress() {
    if (!window.confirm("Reset progress for all pools? This cannot be undone.")) return;
    // Reset every pool's position to its first question; keep the active
    // pool, all bookmarks, and the theme (see the testing checklist).
    POOL_KEYS.forEach(function(key) {
      var bank = BANKS[key].questions;
      var ps = poolState(key);
      ps.currentQuestionId = bank[0].id;
      ps.positions.all = bank[0].id;
    });
    // Return the display to the full pool too, so the just-reset question
    // is guaranteed to be in view (not excluded by an active narrow scope).
    studyScope = { level: "all", id: null };
    recomputeStudyList();
    index = indexOfQuestionId(studyList, poolState(currentPool).currentQuestionId);
    var scopeSelect = byId("scope-select");
    if (scopeSelect) scopeSelect.value = "all";
    updateScopeSummary();
    showQuestion();
    persistState();
  }

  function wireControls() {
    byId("next").onclick = next;
    byId("prev").onclick = previous;
    byId("reveal").onclick = revealAnswer;

    byId("pause").onclick = function() {
      if (revealed || waitSeconds === 0) return;
      paused = !paused;
      updatePauseButton();
    };

    byId("wait").onchange = function() {
      setRecallSeconds(Number(this.value));
      showQuestion();
    };

    var poolSelect = byId("pool");
    if (poolSelect) {
      poolSelect.onchange = function() {
        setPool(this.value);
        showQuestion();
        persistState();
      };
    }

    var scopeSelect = byId("scope-select");
    if (scopeSelect) {
      scopeSelect.onchange = function() {
        setStudyScope(tokenToScope(this.value));
      };
    }

    var themeSelect = byId("theme");
    if (themeSelect) {
      themeSelect.onchange = function() {
        setTheme(this.value);
      };
    }

    var resetButton = byId("reset");
    if (resetButton) {
      resetButton.onclick = resetProgress;
    }

    var bookmarkButton = byId("bookmark");
    if (bookmarkButton) {
      bookmarkButton.onclick = toggleBookmark;
    }

    var helpButton = byId("helpButton");
    if (helpButton) {
      helpButton.onclick = openHelp;
    }

    var closeHelpButton = byId("closeHelp");
    if (closeHelpButton) {
      closeHelpButton.onclick = closeHelp;
    }

    var mockExamButton = byId("mockExamButton");
    if (mockExamButton) {
      mockExamButton.onclick = openExamSetup;
    }

    var examPoolSelect = byId("exam-pool-select");
    if (examPoolSelect) {
      examPoolSelect.onchange = updateExamSetupMeta;
    }

    var examTimerSelect = byId("exam-timer-select");
    if (examTimerSelect) {
      examTimerSelect.onchange = function() {
        var next;
        if (this.value === EXAM_TIMER_DEFAULT_OPTION) {
          next = null;
        } else {
          var n = Number(this.value);
          // Not one of the schema's allowed values -- e.g. a test-injected
          // short duration for expiry/warning coverage. Leave it selected
          // for this session (startExam() will still use it) but never
          // write it into the persisted preference.
          if (EXAM_TIMER_SECONDS_VALUES.indexOf(n) === -1) return;
          next = n;
        }
        if (appState.preferences.examTimerSeconds !== next) {
          appState.preferences.examTimerSeconds = next;
          persistState();
        }
      };
    }

    var examStartBtn = byId("exam-start");
    if (examStartBtn) {
      examStartBtn.onclick = function() {
        var sel = byId("exam-pool-select");
        startExam(sel ? sel.value : POOL_KEYS[0]);
      };
    }

    var examCancelBtn = byId("exam-cancel");
    if (examCancelBtn) {
      examCancelBtn.onclick = closeExamSetup;
    }

    var examPrevBtn = byId("exam-prev");
    if (examPrevBtn) {
      examPrevBtn.onclick = examPrev;
    }

    var examNextBtn = byId("exam-next");
    if (examNextBtn) {
      examNextBtn.onclick = examNext;
    }

    var examExitBtn = byId("exam-exit");
    if (examExitBtn) {
      examExitBtn.onclick = exitExam;
    }

    var examFinishBtn = byId("exam-finish");
    if (examFinishBtn) {
      examFinishBtn.onclick = finishExam;
    }

    var examRetakeBtn = byId("exam-retake");
    if (examRetakeBtn) {
      examRetakeBtn.onclick = retakeExam;
    }

    var examReturnBtn = byId("exam-return-study");
    if (examReturnBtn) {
      examReturnBtn.onclick = returnToStudyFromResults;
    }

    var fvFit = byId("figure-viewer-fit");
    if (fvFit) fvFit.onclick = function() { setFigureViewerMode("fit"); };
    var fvActual = byId("figure-viewer-actual");
    if (fvActual) fvActual.onclick = function() { setFigureViewerMode("actual"); };
    var fvClose = byId("figure-viewer-close");
    if (fvClose) fvClose.onclick = function() { closeFigureViewer(); };

    var menuButton = byId("menuButton");
    if (menuButton) menuButton.onclick = openSettingsDrawer;
    var drawerCloseBtn = byId("settings-drawer-close");
    if (drawerCloseBtn) drawerCloseBtn.onclick = function() { closeSettingsDrawer(); };
    var drawerBackdrop = document.querySelector(".settings-drawer-backdrop");
    if (drawerBackdrop) drawerBackdrop.onclick = function() { closeSettingsDrawer(); };
  }

  // Stage 4B: warn before a reload, close, or navigation would discard an
  // active in-memory mock exam. Triggers only while a real exam is actually
  // in progress (mode "exam" with a live examSession) -- not during setup,
  // results, or study, and not once results are entered (submission and
  // timer expiry both route through showExamResults(), which sets
  // mode = "results" before this could fire again). No new state: reuses
  // the same mode/examSession every other exam-lifecycle function already
  // maintains. Registered exactly once, at startup, alongside the other
  // application-level listeners (see below); this one guarded listener is
  // never added or removed again -- its own check decides whether to act
  // each time the browser fires the event. Browsers do not display custom
  // text for this dialog; returnValue is set only for older-engine support.
  function onBeforeUnload(event) {
    if (mode !== "exam" || !examSession) return;
    event.preventDefault();
    event.returnValue = "";
  }

  function handleHash() {
    if (window.location.hash === "#help") {
      openHelp();
    } else {
      closeHelp();
    }
  }

  window.hamExamStage("Initializing application");
  loadAppState();
  setPool(appState.study.activePool);
  setTheme(appState.preferences.theme);
  setRecallSeconds(appState.preferences.recallSeconds);
  wireControls();
  showQuestion();
  updateExamDiagnostics();
  updateFigureViewerDiagnostics();
  updateSettingsDrawerDiagnostics();

  if (window.addEventListener) {
    window.addEventListener("hashchange", handleHash, false);
    window.addEventListener("beforeunload", onBeforeUnload, false);
    document.addEventListener("keydown", function(event) {
      if (!helpOpen) return;
      if (event.key === "Escape" || event.key === "Esc") {
        closeHelp();
      }
    }, false);
  } else if (window.attachEvent) {
    window.attachEvent("onhashchange", handleHash);
    window.attachEvent("onbeforeunload", onBeforeUnload);
    document.attachEvent("onkeydown", function(event) {
      if (!helpOpen) return;
      var key = event.key || event.which;
      if (key === "Escape" || key === "Esc" || key === 27) {
        closeHelp();
      }
    });
  }
  handleHash();

  byId("footer").textContent =
    "Version " + APP_VERSION_DISPLAY + " — offline study file with " +
    POOL_KEYS.map(function(key) { return BANKS[key].title; }).join(", ") +
    " question pools embedded.";
  byId("startup").style.display = "none";
  window.hamExamStage("Application ready");
})();
