(function() {
  "use strict";
  var BANK = window.HAM_EXAM_BANK;
  var APP_VERSION = window.HAM_EXAM_VERSION || "unknown";
  window.HAM_EXAM_DIAGNOSTICS.version = APP_VERSION;
  if (!BANK || Object.prototype.toString.call(BANK) !== "[object Array]" || !BANK.length) {
    window.hamExamFail("The embedded question bank is missing or invalid.");
    return;
  }
  window.hamExamStage("Initializing application");
  var index = 0;
  var waitSeconds = 10;
  var paused = false;
  var revealed = false;
  var remaining = 10;
  var timerHandle = null;

  function byId(id) { return document.getElementById(id); }

  function clearTimer() {
    if (timerHandle !== null) {
      window.clearInterval(timerHandle);
      timerHandle = null;
    }
    window.HAM_EXAM_DIAGNOSTICS.timerActive = false;
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

    startTimer();
    window.scrollTo(0,0);
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
    for (var i=0;i<nodes.length;i++) {
      if (nodes[i].getAttribute("data-letter") === x.correct)
        nodes[i].className = "choice correct";
    }
    var t = byId("timer");
    t.textContent = "✓ Correct answer: " + x.correct;
    t.className = "timer ready";
  }

  function next() { if (index < BANK.length-1) { index++; showQuestion(); } }
  function previous() { if (index > 0) { index--; showQuestion(); } }

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

  showQuestion();
  byId("footer").textContent =
    "Version " + APP_VERSION + " (beta) — offline study file with all " +
    BANK.length + " Technician questions embedded.";
  byId("startup").style.display = "none";
  window.hamExamStage("Application ready");
})();
