(function() {
  "use strict";
  var installPrompt = null;
  var installBox = document.getElementById("pwaInstall");
  var installButton = document.getElementById("installApp");
  var dismissButton = document.getElementById("dismissInstall");
  var standalone = window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  if (standalone && installBox) installBox.style.display = "none";

  if (dismissButton) {
    dismissButton.onclick = function() {
      installBox.style.display = "none";
    };
  }

  window.addEventListener("beforeinstallprompt", function(event) {
    event.preventDefault();
    installPrompt = event;
    if (installButton) installButton.hidden = false;
  });

  if (installButton) {
    installButton.onclick = function() {
      if (!installPrompt) return;
      installButton.hidden = true;
      installPrompt.prompt();
      installPrompt.userChoice.then(function() {
        installPrompt = null;
      });
    };
  }

  window.addEventListener("appinstalled", function() {
    if (installBox) installBox.style.display = "none";
  });

  if ("serviceWorker" in window.navigator) {
    window.addEventListener("load", function() {
      window.navigator.serviceWorker.register("./sw.js", { scope: "./" })
        .then(function(registration) {
          window.HAM_EXAM_DIAGNOSTICS.serviceWorker = registration.scope;
        })
        .catch(function(error) {
          window.HAM_EXAM_DIAGNOSTICS.serviceWorkerError = error.message || String(error);
        });
    });
  }
})();
