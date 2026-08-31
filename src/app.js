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

  var POOL_META = {
    technician: {
      element: 2,
      count: 409,
      effective: "July 1, 2026 – June 30, 2030",
      ncvecUrl: "https://ncvec.org/index.php/2026-2030-technician-question-pool",
      errata: "February 19, 2026 errata"
    },
    general: {
      element: 3,
      count: 423,
      effective: "July 1, 2023 – June 30, 2027",
      ncvecUrl: "https://ncvec.org/index.php/2023-2027-general-question-pool-release",
      errata: "6th errata February 4, 2026"
    },
    extra: {
      element: 4,
      count: 599,
      effective: "July 1, 2024 – June 30, 2028",
      ncvecUrl: "https://ncvec.org/index.php/2024-2028-extra-class-question-pool-release",
      errata: "4th errata February 4, 2026"
    }
  };

  var currentPool = DEFAULT_POOL;
  var BANK = null;
  var index = 0;
  var waitSeconds = 10;
  var paused = false;
  var revealed = false;
  var remaining = 10;
  var timerHandle = null;
  var timerSnapshot = null;
  var helpOpen = false;
  var helpPausedTimer = false;

  // "study" | "exam-setup" | "exam"
  var mode = "study";
  // Active mock-exam session; null when no exam is running.
  var examSession = null;

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

  function clearStoredIndex(pool) {
    if (!supportsStorage()) return;
    try { window.localStorage.removeItem(storageIndexKey(pool)); } catch (e) {}
  }

  function storageBookmarksKey(pool) { return "ham-exam-bookmarks-" + pool; }

  function readStoredBookmarks(pool) {
    if (!supportsStorage()) return [];
    try {
      var raw = window.localStorage.getItem(storageBookmarksKey(pool));
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function storeBookmarks(pool, list) {
    if (!supportsStorage()) return;
    try { window.localStorage.setItem(storageBookmarksKey(pool), JSON.stringify(list)); } catch (e) {}
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

  function suspendStudyTimer() {
    if (timerSnapshot) return; // preserve the original snapshot across repeated transitions
    var t = byId("timer");
    timerSnapshot = {
      waitSeconds: waitSeconds,
      remaining: remaining,
      paused: paused,
      revealed: revealed,
      active: timerHandle !== null,
      pauseText: byId("pause").textContent,
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

    var pauseBtn = byId("pause");
    if (pauseBtn) pauseBtn.textContent = snap.pauseText;

    if (revealed) {
      var x = BANK[index];
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

    updateBookmarkButton();
    storeIndex(currentPool, index);
    startTimer();
    window.scrollTo(0, 0);
  }

  function updateBookmarkButton() {
    var btn = byId("bookmark");
    if (!btn) return;
    var x = BANK[index];
    var list = readStoredBookmarks(currentPool);
    var isMarked = list.indexOf(x.id) !== -1;
    btn.setAttribute("aria-pressed", String(isMarked));
    btn.textContent = isMarked ? "Remove bookmark" : "Bookmark";
    btn.classList.toggle("bookmarked", isMarked);
  }

  function toggleBookmark() {
    var x = BANK[index];
    var list = readStoredBookmarks(currentPool);
    var pos = list.indexOf(x.id);
    if (pos === -1) {
      list.push(x.id);
    } else {
      list.splice(pos, 1);
    }
    storeBookmarks(currentPool, list);
    updateBookmarkButton();
  }

  function setStudyControlsHidden(shouldHide) {
    var groups = document.querySelectorAll(".control-group");
    for (var i = 0; i < groups.length; i++) {
      var group = groups[i];
      if (group.classList.contains("help-group")) continue;
      group.hidden = shouldHide;
    }
  }

  function renderHelp() {
    var versionText = byId("help-version-text");
    if (versionText) versionText.textContent = APP_VERSION + " (beta)";

    var list = byId("help-pool-list");
    if (!list) return;
    while (list.firstChild) list.removeChild(list.firstChild);

    POOL_KEYS.forEach(function(key) {
      var meta = POOL_META[key];
      var bank = BANKS[key];
      var count = bank && bank.questions ? bank.questions.length : meta.count;
      var li = document.createElement("li");
      li.className = "help-pool-entry";

      var name = document.createElement("span");
      name.className = "help-pool-name";
      name.textContent = bank.title + " — ";
      li.appendChild(name);

      var desc = document.createTextNode(
        "Element " + meta.element + ", " + count + " questions, effective " + meta.effective + ". "
      );
      li.appendChild(desc);

      var link = document.createElement("a");
      link.href = meta.ncvecUrl;
      link.textContent = "NCVEC source";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      li.appendChild(link);

      var errata = document.createElement("div");
      errata.className = "help-pool-meta";
      errata.textContent = meta.errata + "; withdrawn questions are excluded where applicable.";
      li.appendChild(errata);

      list.appendChild(li);
    });
  }

  function openHelp() {
    if (helpOpen) return;
    if (mode !== "study") return;
    helpOpen = true;

    // Pause an active timer while Help is open, then resume on close.
    helpPausedTimer = false;
    if (timerHandle !== null && !paused && !revealed && waitSeconds > 0) {
      paused = true;
      helpPausedTimer = true;
    }

    renderHelp();

    var helpPanel = byId("help");
    var main = document.querySelector("main");
    var footer = byId("footer");
    if (helpPanel) helpPanel.hidden = false;
    if (main) main.hidden = true;
    if (footer) footer.hidden = true;
    setStudyControlsHidden(true);

    var closeButton = byId("closeHelp");
    if (closeButton) closeButton.focus();
    window.scrollTo(0, 0);

    if (window.location.hash !== "#help") {
      window.location.hash = "#help";
    }
  }

  function closeHelp() {
    if (!helpOpen) return;
    helpOpen = false;

    var helpPanel = byId("help");
    var main = document.querySelector("main");
    var footer = byId("footer");
    if (helpPanel) helpPanel.hidden = true;
    if (main) main.hidden = false;
    if (footer) footer.hidden = false;
    setStudyControlsHidden(false);

    if (helpPausedTimer) {
      paused = false;
      helpPausedTimer = false;
    }

    var helpButton = byId("helpButton");
    if (helpButton) helpButton.focus();

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
  }

  function hideStudyUI() {
    var header = document.querySelector("header.top");
    var main = document.querySelector("main");
    var footer = byId("footer");
    if (header) header.hidden = true;
    if (main) main.hidden = true;
    if (footer) footer.hidden = true;
  }

  function showStudyUI() {
    var header = document.querySelector("header.top");
    var main = document.querySelector("main");
    var footer = byId("footer");
    if (header) header.hidden = false;
    if (main) main.hidden = false;
    if (footer) footer.hidden = false;
  }

  function updateExamSetupMeta() {
    var select = byId("exam-pool-select");
    var poolKey = select ? select.value : POOL_KEYS[0];
    var ENGINE = window.HAM_EXAM_ENGINE;
    if (!ENGINE) return;
    var config = ENGINE.EXAM_CONFIG[poolKey];
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
    addRow("Questions", config.questionCount);
    addRow("Passing score", config.passingScore + " of " + config.questionCount);
    addRow("Pool effective", config.effectiveDateRange);
  }

  function openExamSetup() {
    if (mode !== "study") return;
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
        var config = window.HAM_EXAM_ENGINE && window.HAM_EXAM_ENGINE.EXAM_CONFIG[key];
        opt.textContent = (config ? config.displayName : key) + " (Element " + (config ? config.element : "?") + ")";
        select.appendChild(opt);
      });
    }
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
    var btn = byId("mockExamButton");
    if (btn) btn.focus();
    updateExamDiagnostics();
    window.scrollTo(0, 0);
  }

  function startExam(poolKey) {
    var ENGINE = window.HAM_EXAM_ENGINE;
    if (!ENGINE) { window.hamExamFail("Exam engine not available."); return; }
    var questions;
    try {
      questions = ENGINE.selectExamQuestions(poolKey, BANKS, Math.random);
    } catch (e) {
      window.hamExamFail("Could not build exam: " + (e.message || String(e)));
      return;
    }

    examSession = {
      poolKey: poolKey,
      questions: questions,
      index: 0,
      answers: {}
    };
    mode = "exam";
    suspendStudyTimer();

    var setupPanel = byId("exam-setup");
    if (setupPanel) setupPanel.hidden = true;
    var sessionPanel = byId("exam-session");
    if (sessionPanel) sessionPanel.hidden = false;

    showExamQuestion();
    updateExamDiagnostics();
    window.scrollTo(0, 0);
  }

  function showExamQuestion() {
    if (!examSession) return;
    var q = examSession.questions[examSession.index];
    var total = examSession.questions.length;
    var idx = examSession.index;

    byId("exam-progress").textContent = "Question " + (idx + 1) + " of " + total;
    byId("exam-q-meta").textContent = q.id + " · " + q.sub;
    byId("exam-question").textContent = q.q;

    var fieldset = byId("exam-choices");
    while (fieldset.firstChild) fieldset.removeChild(fieldset.firstChild);

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
    examSession = null;
    mode = "study";
    var sessionPanel = byId("exam-session");
    if (sessionPanel) sessionPanel.hidden = true;
    showStudyUI();
    resumeStudyTimer();
    var btn = byId("mockExamButton");
    if (btn) btn.focus();
    updateExamDiagnostics();
    window.scrollTo(0, 0);
  }

  function finishExam() {
    if (!window.confirm(
      "Submit exam? Scoring is not yet implemented — " +
      "your answers will not be graded in this version."
    )) return;
    examSession = null;
    mode = "study";
    var sessionPanel = byId("exam-session");
    if (sessionPanel) sessionPanel.hidden = true;
    showStudyUI();
    resumeStudyTimer();
    var btn = byId("mockExamButton");
    if (btn) btn.focus();
    updateExamDiagnostics();
    window.scrollTo(0, 0);
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

  function resetProgress() {
    if (!window.confirm("Reset progress for all pools? This cannot be undone.")) return;
    POOL_KEYS.forEach(function(key) { clearStoredIndex(key); });
    index = 0;
    showQuestion();
  }

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
  }

  function handleHash() {
    if (window.location.hash === "#help") {
      openHelp();
    } else {
      closeHelp();
    }
  }

  window.hamExamStage("Initializing application");
  setPool(readStoredPool());
  setTheme(readStoredTheme());
  wireControls();
  showQuestion();
  updateExamDiagnostics();

  if (window.addEventListener) {
    window.addEventListener("hashchange", handleHash, false);
    document.addEventListener("keydown", function(event) {
      if (!helpOpen) return;
      if (event.key === "Escape" || event.key === "Esc") {
        closeHelp();
      }
    }, false);
  } else if (window.attachEvent) {
    window.attachEvent("onhashchange", handleHash);
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
    "Version " + APP_VERSION + " (beta) — offline study file with " +
    POOL_KEYS.map(function(key) { return BANKS[key].title; }).join(", ") +
    " question pools embedded.";
  byId("startup").style.display = "none";
  window.hamExamStage("Application ready");
})();
