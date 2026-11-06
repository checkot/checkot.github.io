/* ==========================================================================
   PWA-INSTALL.JS - Progressive Web App Custom Install Prompt Controller
   RENATA PLC RPPF Overtime & Allowance Calculator PWA
   ========================================================================== */

(function () {
  let deferredInstallPrompt = null;
  const PWA_DISMISS_KEY = 'renata_pwa_install_dismissed_at';
  const COOLDOWN_DAYS = 5;

  function isStandalone() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true ||
      document.referrer.includes('android-app://')
    );
  }

  function isIos() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  function isDismissedRecently() {
    try {
      const ts = parseInt(localStorage.getItem(PWA_DISMISS_KEY), 10);
      if (!ts || isNaN(ts)) return false;
      const days = (Date.now() - ts) / (1000 * 60 * 60 * 24);
      return days < COOLDOWN_DAYS;
    } catch (e) {
      return false;
    }
  }

  function showBanner() {
    if (isStandalone()) return;
    const banner = document.getElementById('pwaInstallBanner');
    if (!banner) return;
    banner.style.display = 'block';
  }

  function hideBanner() {
    const banner = document.getElementById('pwaInstallBanner');
    if (banner) banner.style.display = 'none';
  }

  window.dismissPwaInstall = function (recordCooldown = true) {
    hideBanner();
    if (recordCooldown) {
      try {
        localStorage.setItem(PWA_DISMISS_KEY, Date.now().toString());
      } catch (e) {}
    }
  };

  window.showPwaIosModal = function () {
    hideBanner();
    const modal = document.getElementById('pwaIosModal');
    if (modal) modal.style.display = 'flex';
  };

  window.closePwaIosModal = function () {
    const modal = document.getElementById('pwaIosModal');
    if (modal) modal.style.display = 'none';
  };

  window.executePwaInstall = async function () {
    if (deferredInstallPrompt) {
      try {
        hideBanner();
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        if (choice && choice.outcome === 'accepted') {
          if (typeof showToast === 'function') {
            showToast('RPPF অ্যাপ সফলভাবে ইনস্টল হচ্ছে...', 'success');
          }
          deferredInstallPrompt = null;
        } else {
          // User chose Cancel in the native prompt
          window.dismissPwaInstall(true);
        }
      } catch (err) {
        console.warn('[PWA] Prompt error:', err);
      }
      return;
    }

    if (isIos()) {
      window.showPwaIosModal();
      return;
    }

    // Fallback for desktop / Android when beforeinstallprompt is not cached
    if (isStandalone()) {
      if (typeof showToast === 'function') {
        showToast('অ্যাপটি ইতিমধ্যে ইনস্টল করা রয়েছে!', 'info');
      }
      return;
    }

    if (typeof showToast === 'function') {
      showToast('ব্রাউজারের অ্যাড্রেস বার থেকে "Install" আইকন চাপুন', 'info');
    }
  };

  // Capture beforeinstallprompt event
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;

    const moreBtn = document.getElementById('moreInstallAppBtn');
    if (moreBtn && !isStandalone()) moreBtn.style.display = 'flex';

    if (isStandalone() || isDismissedRecently()) return;

    // Show floating install prompt after 3.5 seconds
    setTimeout(() => {
      showBanner();
    }, 3500);
  });

  window.addEventListener('appinstalled', () => {
    hideBanner();
    window.closePwaIosModal();
    deferredInstallPrompt = null;
    try {
      localStorage.setItem('renata_pwa_installed', '1');
    } catch (e) {}
    if (typeof showToast === 'function') {
      showToast('RPPF Overtime অ্যাপ সফলভাবে ইনস্টল হয়েছে!', 'success');
    }
    const moreBtn = document.getElementById('moreInstallAppBtn');
    if (moreBtn) moreBtn.style.display = 'none';
  });

  // Initialization check
  window.addEventListener('DOMContentLoaded', () => {
    const moreBtn = document.getElementById('moreInstallAppBtn');
    if (moreBtn && isStandalone()) {
      moreBtn.style.display = 'none';
    }

    // For iOS Safari users without beforeinstallprompt
    if (isIos() && !isStandalone() && !isDismissedRecently()) {
      setTimeout(() => {
        showBanner();
      }, 4000);
    }
  });
})();
