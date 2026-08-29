(function() {
  "use strict";

  var APP_VERSION = window.HAM_EXAM_VERSION || "unknown";
  var BANKS = window.HAM_EXAM_BANKS;
  window.HAM_EXAM_DIAGNOSTICS.version = APP_VERSION;

  if (!BANKS || typeof BANKS !== "object") {
    window.hamExamFail("The embedded question banks are missing or invalid.");
    return;
  }

  var POOL_KEYS = ["technician", "general", "extra"];
  var DEFAULT_POOL = "technician";
  var STORAGE_POOL_KEY = "ham-exam-pool";
  var STORAGE_THEME_KEY = "ham-exam-theme";
  var THEMES = ["light", "dark", "night"];
  var DEFAULT_THEME = "light";
  function storageIndexKey(pool) { return "ham-exam-index-" + pool; }

  var currentPool = DEFAULT_POOL;
  var BANK = null;
  var index = 0;
  var waitSeconds = 10;
  var paused = false;
  var revealed = false;
  var remaining = 10;
  var timerHandle = null;

  function byId(id) { return document.getElementById(id); }

  function supportsStorage() {
    try {
      var test = "__ham_exam_test__";
      window.localStorage.setItem(test, test);
      window.localStorage.removeItem(test);
      return true;
    } catch (e) {
      return false;
    }
  }

  function readStoredPool() {
    if (!supportsStorage()) return DEFAULT_POOL;
    var stored = window.localStorage.getItem(STORAGE_POOL_KEY);
    if (stored && POOL_KEYS.indexOf(stored) !== -1) return stored;
    return DEFAULT_POOL;
  }

  function readStoredIndex(pool) {
    if (!supportsStorage()) return 0;
    var raw = window.localStorage.getItem(storageIndexKey(pool));
    var n = raw ? parseInt(raw, 10) : 0;
    return isNaN(n) || n < 0 ? 0 : n;
  }

  function storePool(pool) {
    if (!supportsStorage()) return;
    try { window.localStorage.setItem(STORAGE_POOL_KEY, pool); } catch (e) {}
  }

  function storeIndex(pool, n) {
    if (!supportsStorage()) return;
    try { window.localStorage.setItem(storageIndexKey(pool), String(n)); } catch (e) {}
  }

  function readStoredTheme() {
    if (!supportsStorage()) return DEFAULT_THEME;
    var stored = window.localStorage.getItem(STORAGE_THEME_KEY);
    if (stored && THEMES.indexOf(stored) !== -1) return stored;
    return DEFAULT_THEME;
  }

  function storeTheme(theme) {
    if (!supportsStorage()) return;
    try { window.localStorage.setItem(STORAGE_THEME_KEY, theme); } catch (e) {}
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
    storeTheme(theme);
    var select = byId("theme");
    if (select) select.value = theme;
  }

  function clearTimer() {
    if (timerHandle !== null) {
      window.clearInterval(timerHandle);
      timerHandle = null;
    }
    window.HAM_EXAM_DIAGNOSTICS.timerActive = false;
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

  function setPool(pool) {
    if (POOL_KEYS.indexOf(pool) === -1) pool = DEFAULT_POOL;
    currentPool = pool;
    BANK = BANKS[pool].questions;
    storePool(pool);
    populatePoolSelector();
    var select = byId("pool");
    if (select) select.value = pool;
    index = readStoredIndex(pool);
    if (index >= BANK.length) index = 0;
  }

  function showQuestion() {
    clearTimer();
    paused = false;
    revealed = false;
    remaining = waitSeconds;
    byId("pause").textContent = "Pause";

    var x = BANK[index];
    byId("meta").textContent = x.id + " · " + x.sub;
    byId("question").textContent = x.q;
    byId("ref").textContent = x.ref ? "FCC reference: " + x.ref : "";
    byId("progress").textContent = "Question " + (index + 1) + " / " + BANK.length;

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
    byId("bottomPrev").disabled = index === 0;
    byId("next").disabled = index === BANK.length - 1;
    byId("bottomNext").disabled = index === BANK.length - 1;

    storeIndex(currentPool, index);
    startTimer();
    window.scrollTo(0, 0);
  }

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
    var x = BANK[index];
    var nodes = byId("choices").children;
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute("data-letter") === x.correct)
        nodes[i].className = "choice correct";
    }
    var t = byId("timer");
    t.textContent = "✓ Correct answer: " + x.correct;
    t.className = "timer ready";
  }

  function next() { if (index < BANK.length - 1) { index++; showQuestion(); } }
  function previous() { if (index > 0) { index--; showQuestion(); } }

  function wireControls() {
    byId("next").onclick = next;
    byId("bottomNext").onclick = next;
    byId("prev").onclick = previous;
    byId("bottomPrev").onclick = previous;
    byId("reveal").onclick = revealAnswer;

    byId("pause").onclick = function() {
      if (revealed || waitSeconds === 0) return;
      paused = !paused;
      byId("pause").textContent = paused ? "Resume" : "Pause";
    };

    byId("wait").onchange = function() {
      waitSeconds = Number(this.value);
      showQuestion();
    };

    var poolSelect = byId("pool");
    if (poolSelect) {
      poolSelect.onchange = function() {
        setPool(this.value);
        showQuestion();
      };
    }

    var themeSelect = byId("theme");
    if (themeSelect) {
      themeSelect.onchange = function() {
        setTheme(this.value);
      };
    }
  }

  window.hamExamStage("Initializing application");
  setPool(readStoredPool());
  setTheme(readStoredTheme());
  wireControls();
  showQuestion();

  byId("footer").textContent =
    "Version " + APP_VERSION + " (beta) — offline study file with " +
    POOL_KEYS.map(function(key) { return BANKS[key].title; }).join(", ") +
    " question pools embedded.";
  byId("startup").style.display = "none";
  window.hamExamStage("Application ready");
})();
