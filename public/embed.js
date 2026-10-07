/*!
 * AI E-commerce Support Assistant embed.js
 * Drop this on any site to add a floating AI support chat launcher.
 *
 * Usage:
 *   <script src="https://YOUR_APP_DOMAIN/embed.js" data-widget-id="YOUR_WIDGET_ID" async></script>
 *
 * Optional attributes on the same <script> tag:
 *   data-base-url    Override the app origin (defaults to this script's origin)
 *   data-position     "bottom-right" | "bottom-left"   (default: bottom-right)
 *   data-color        Launcher accent color, e.g. "#4f46e5"
 *   data-greeting     Short tooltip shown near the launcher on first load
 */
(function () {
  "use strict";

  if (window.__EcommerceWidgetLoaded) return;
  window.__EcommerceWidgetLoaded = true;

  function getCurrentScript() {
    if (document.currentScript) return document.currentScript;
    var scripts = document.getElementsByTagName("script");
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (/embed\.js(\?|$)/.test(scripts[i].src)) return scripts[i];
    }
    return scripts[scripts.length - 1];
  }

  var scriptEl = getCurrentScript();
  var data = (scriptEl && scriptEl.dataset) || {};

  var widgetId = data.widgetId || data.widgetid;
  if (!widgetId) {
    console.error(
      "[AI E-commerce Support Assistant] embed.js is missing required attribute data-widget-id. " +
        'Add it to your <script> tag, e.g. <script src="…/embed.js" data-widget-id="your-id"></script>'
    );
    return;
  }

  var baseUrl = (data.baseUrl || (scriptEl && new URL(scriptEl.src, window.location.href).origin) || "").replace(
    /\/$/,
    ""
  );
  var position = data.position === "bottom-left" ? "bottom-left" : "bottom-right";
  var accent = data.color || "#4f46e5";
  var greeting = data.greeting || "";

  var OPEN_W = 390;
  var OPEN_H = 700;
  var Z = 2147483000;
  var side = position === "bottom-left" ? "left" : "right";

  var style = document.createElement("style");
  style.setAttribute("data-ecommerce-widget", "");
  style.textContent =
    "" +
    ".saiw-root, .saiw-root *{box-sizing:border-box;}" +
    ".saiw-launcher{position:fixed;" +
    side +
    ":24px;bottom:24px;width:60px;height:60px;border-radius:999px;border:0;cursor:pointer;" +
    "background:linear-gradient(135deg," +
    accent +
    "," +
    accent +
    "cc);box-shadow:0 10px 30px -6px " +
    accent +
    "66,0 2px 8px rgba(0,0,0,.15);z-index:" +
    Z +
    ";display:flex;align-items:center;justify-content:center;" +
    "transition:transform .18s ease, box-shadow .18s ease;padding:0;}" +
    ".saiw-launcher:hover{transform:scale(1.06);box-shadow:0 14px 36px -6px " +
    accent +
    "88,0 2px 10px rgba(0,0,0,.18);}" +
    ".saiw-launcher:active{transform:scale(.96);}" +
    ".saiw-launcher svg{width:26px;height:26px;transition:transform .25s ease, opacity .2s ease;}" +
    ".saiw-launcher .saiw-icon-close{position:absolute;opacity:0;transform:rotate(-45deg) scale(.6);}" +
    ".saiw-launcher .saiw-icon-chat{opacity:1;transform:rotate(0) scale(1);}" +
    ".saiw-launcher.saiw-open .saiw-icon-chat{opacity:0;transform:rotate(45deg) scale(.6);}" +
    ".saiw-launcher.saiw-open .saiw-icon-close{opacity:1;transform:rotate(0) scale(1);}" +
    ".saiw-badge{position:fixed;" +
    side +
    ":24px;bottom:92px;max-width:220px;background:#111827;color:#fff;font:500 13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
    "padding:10px 14px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.18);z-index:" +
    Z +
    ";opacity:0;transform:translateY(6px);pointer-events:none;transition:opacity .25s ease, transform .25s ease;}" +
    ".saiw-badge.saiw-show{opacity:1;transform:translateY(0);pointer-events:auto;}" +
    ".saiw-badge button{position:absolute;top:-6px;" +
    (side === "left" ? "left:-6px;" : "right:-6px;") +
    "width:18px;height:18px;border-radius:999px;background:#fff;color:#111827;border:0;cursor:pointer;font-size:11px;line-height:1;}" +
    ".saiw-panel{position:fixed;" +
    side +
    ":24px;bottom:96px;width:" +
    OPEN_W +
    "px;height:min(" +
    OPEN_H +
    "px,80vh);max-height:80vh;border-radius:20px;overflow:hidden;" +
    "box-shadow:0 24px 64px -12px rgba(0,0,0,.35),0 0 0 1px rgba(0,0,0,.06);z-index:" +
    (Z - 1) +
    ";" +
    "opacity:0;transform:translateY(16px) scale(.98);pointer-events:none;transition:opacity .22s ease, transform .22s ease;background:#fff;}" +
    ".saiw-panel.saiw-open{opacity:1;transform:translateY(0) scale(1);pointer-events:auto;}" +
    ".saiw-panel iframe{width:100%;height:100%;border:0;display:block;}" +
    "@media (max-width:480px){" +
    ".saiw-panel{top:0;left:0;right:0;bottom:0;width:100%;height:100%;max-height:100%;border-radius:0;}" +
    ".saiw-launcher{" +
    side +
    ":16px;bottom:16px;}" +
    "}";
  document.head.appendChild(style);

  var root = document.createElement("div");
  root.className = "saiw-root";

  var panel = document.createElement("div");
  panel.className = "saiw-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Support chat");

  var iframe = null;

  var launcher = document.createElement("button");
  launcher.className = "saiw-launcher";
  launcher.type = "button";
  launcher.setAttribute("aria-label", "Open support chat");
  launcher.innerHTML =
    '<svg class="saiw-icon-chat" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>' +
    '<svg class="saiw-icon-close" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  var badge = null;
  if (greeting) {
    badge = document.createElement("div");
    badge.className = "saiw-badge";
    var badgeText = document.createElement("span");
    badgeText.textContent = greeting;
    var badgeClose = document.createElement("button");
    badgeClose.type = "button";
    badgeClose.setAttribute("aria-label", "Dismiss");
    badgeClose.textContent = "×";
    badgeClose.onclick = function (e) {
      e.stopPropagation();
      dismissBadge();
    };
    badge.appendChild(badgeText);
    badge.appendChild(badgeClose);
  }

  var open = false;
  var badgeDismissed = false;

  function dismissBadge() {
    if (!badge || badgeDismissed) return;
    badgeDismissed = true;
    badge.classList.remove("saiw-show");
  }

  function ensureIframe() {
    if (iframe) return;
    iframe = document.createElement("iframe");
    iframe.title = "AI E-commerce Support Assistant Chat";
    iframe.src = baseUrl + "/widgets/p/" + encodeURIComponent(widgetId) + "?embedded=1";
    iframe.allow = "clipboard-write";
    panel.appendChild(iframe);
  }

  function openPanel() {
    if (open) return;
    open = true;
    dismissBadge();
    ensureIframe();
    panel.classList.add("saiw-open");
    launcher.classList.add("saiw-open");
    launcher.setAttribute("aria-label", "Close support chat");
  }

  function closePanel() {
    if (!open) return;
    open = false;
    panel.classList.remove("saiw-open");
    launcher.classList.remove("saiw-open");
    launcher.setAttribute("aria-label", "Open support chat");
  }

  function togglePanel() {
    if (open) closePanel();
    else openPanel();
  }

  launcher.addEventListener("click", togglePanel);

  window.addEventListener("message", function (event) {
    var msg = event.data;
    var type = typeof msg === "string" ? msg : msg && msg.type;
    if (type === "AI E-commerce Support Assistant:close") closePanel();
    if (type === "AI E-commerce Support Assistant:open") openPanel();
  });

  function mount() {
    root.appendChild(panel);
    if (badge) root.appendChild(badge);
    root.appendChild(launcher);
    document.body.appendChild(root);

    if (badge) {
      setTimeout(function () {
        if (!open) badge.classList.add("saiw-show");
      }, 1200);
    }
  }

  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);

  window.EcommerceWidget = {
    open: openPanel,
    close: closePanel,
    toggle: togglePanel,
  };
})();
