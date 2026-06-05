/**
 * VoceChat Bot client for sending major-test results to users.
 * @see https://doc.voce.chat/bot/bot-and-webhook
 *
 * CLI:
 *   node vocechat-bot.js test [uid]
 *   node vocechat-bot.js text <uid> <message>
 *
 * Browser (GitHub Pages):
 *   <script src="vocechat-bot.js"></script>
 *   await VoceChatBot.sendResultToUser(uid, result)
 */

const VOCECHAT_BASE_URL = "https://dev.voce.chat";
/** 测完、存图等常规通知 */
const VOCECHAT_BOT_API_KEY =
  "24145bc2c1724293676b7fbc341fa27a8b4a36c639658273845dc2fe73bf40877b22756964223a3433363639382c226e6f6e6365223a22743351414e657331496d6f4141414141325439566a705a372b38457244717748227d";
/** Stripe 付费点击通知 */
const VOCECHAT_BOT_API_KEY_PAY =
  "0f4a1946f3f299aa44c8b286ee451e65912e5f9b0f9969b53376ef202a224c2d7b22756964223a3433363738342c226e6f6e6365223a2270596a72414c5459496d6f414141414132577763576377396f36474965575048227d";
/** 内测 beta 链接测完通知 */
const VOCECHAT_BOT_API_KEY_BETA =
  "a76eadb1f6d5359e2faf973cefe46c70f7185bedb6d0d52b1d61eab142b36de37b22756964223a3433363738352c226e6f6e6365223a22712f574f47555461496d6f414141414146634677464378464b70424563376168227d";
/** Admin inbox: new completions are pushed here (no prompt to the test taker). */
const VOCECHAT_NOTIFY_UID = "394719";
const DEFAULT_TEST_UID = VOCECHAT_NOTIFY_UID;
const VOCE_NOTIFY_DEDUPE_PREFIX = "majorTestVoceNotify:";
const VOCE_SAVE_DEDUPE_PREFIX = "majorTestVoceSave:";
const VOCE_BETA_NOTIFY_DEDUPE_PREFIX = "majorTestVoceBetaNotify:";

function getBaseUrl() {
  const fromEnv = typeof process !== "undefined" && process.env && process.env.VOCECHAT_BASE_URL;
  return (fromEnv || VOCECHAT_BASE_URL).replace(/\/$/, "");
}

function getApiKey(profile) {
  const kind = profile || "default";
  if (kind === "pay") {
    const fromEnv = typeof process !== "undefined" && process.env && process.env.VOCECHAT_BOT_API_KEY_PAY;
    return fromEnv || VOCECHAT_BOT_API_KEY_PAY;
  }
  if (kind === "beta") {
    const fromEnv = typeof process !== "undefined" && process.env && process.env.VOCECHAT_BOT_API_KEY_BETA;
    return fromEnv || VOCECHAT_BOT_API_KEY_BETA;
  }
  const fromEnv = typeof process !== "undefined" && process.env && process.env.VOCECHAT_BOT_API_KEY;
  return fromEnv || VOCECHAT_BOT_API_KEY;
}

/**
 * @param {string|number} uid
 * @param {string} body
 * @param {"text/plain"|"text/markdown"} contentType
 */
async function sendToUser(uid, body, contentType = "text/plain", options = {}) {
  const baseUrl = getBaseUrl();
  const apiKey = options.apiKey || getApiKey(options.apiKeyProfile);
  const url = `${baseUrl}/api/bot/send_to_user/${encodeURIComponent(String(uid))}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "content-type": contentType
    },
    body,
    keepalive: !!options.keepalive
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `VoceChat send_to_user failed (${response.status}): ${detail || response.statusText}`
    );
  }

  return response;
}

async function sendTextToUser(uid, text) {
  return sendToUser(uid, text, "text/plain");
}

async function sendMarkdownToUser(uid, markdown, options = {}) {
  return sendToUser(uid, markdown, "text/markdown", options);
}

/**
 * @param {object} result
 * @param {string} result.codename
 * @param {string} [result.codenameEn]
 * @param {string} result.displayName
 * @param {number|string} [result.matchPercent]
 * @param {string} [result.shareUrl]
 * @param {string[]} [result.majors]
 */
function formatResultMarkdown(result) {
  const lines = ["- 通知：ZYBT AI专业测试 · 你的结果"];
  pushNotifyLine(
    lines,
    "画像",
    `${result.codename || ""}${result.codenameEn ? ` · ${result.codenameEn}` : ""}`
  );
  pushNotifyLine(lines, "类型", result.displayName);
  if (result.matchPercent != null && result.matchPercent !== "") {
    pushNotifyLine(lines, "匹配度", `${result.matchPercent}%`);
  }
  if (result.shareUrl) {
    lines.push(`- 完整报告：[链接](${result.shareUrl})`);
  }
  if (Array.isArray(result.majors) && result.majors.length) {
    pushNotifyLine(lines, "推荐专业", result.majors.slice(0, 5).join("、"));
  }
  return lines.join("\n");
}

async function sendResultToUser(uid, result) {
  const markdown = formatResultMarkdown(result);
  return sendMarkdownToUser(uid, markdown);
}

function profileLabel(rule) {
  if (!rule) return "";
  const codename = rule.codename || rule.name || "";
  const en = rule.codename_en ? ` · ${rule.codename_en}` : "";
  return `${codename}${en}`;
}

function pushNotifyLine(lines, label, value) {
  if (value != null && value !== "") {
    lines.push(`- ${label}：${value}`);
  }
}

function appendResultNotifyLines(lines, payload, opts) {
  const options = opts || {};
  const rule = payload && payload.rule;
  const secondary = payload && payload.secondary && payload.secondary.rule;
  const mbti = payload && payload.mbti;
  const majors = (payload && payload.combinedMajors || [])
    .slice(0, 6)
    .map((m) => m.name)
    .filter(Boolean);
  const topDims = (payload && payload.topDims || [])
    .slice(0, 4)
    .map((d) => `${d.k} ${Math.round(d.v * 10) / 10}`)
    .join(" · ");

  pushNotifyLine(lines, "画像", profileLabel(rule));
  pushNotifyLine(lines, "类型", rule && rule.display_name);
  if (payload && payload.matchPercent != null) {
    pushNotifyLine(lines, "匹配度", `${payload.matchPercent}%`);
  }
  pushNotifyLine(lines, "置信度", payload && payload.conf);
  if (payload && payload.conf === "低" && secondary) {
    pushNotifyLine(
      lines,
      "接近画像",
      `${profileLabel(secondary)} / ${secondary.display_name || ""}`
    );
  }
  if (mbti && mbti.code) {
    pushNotifyLine(
      lines,
      "MBTI",
      `${mbti.code}${mbti.name ? `（${mbti.name}）` : ""}`
    );
  }
  if (majors.length) pushNotifyLine(lines, "推荐专业", majors.join("、"));
  if (topDims) pushNotifyLine(lines, "维度", topDims);
  if (options.reportUrl) {
    lines.push(`- 完整报告：[链接](${options.reportUrl})`);
  }
}

function appendMetaNotifyLines(lines, meta) {
  pushNotifyLine(lines, "本地时间", meta.completedAtLocal);
  pushNotifyLine(lines, "UTC", meta.completedAtUtc);
  pushNotifyLine(lines, "时区", meta.timezone);
  pushNotifyLine(lines, "语言", meta.language);
  pushNotifyLine(lines, "位置", meta.location);
  pushNotifyLine(lines, "IP", meta.ip);
  pushNotifyLine(lines, "页面", meta.pageUrl);
  pushNotifyLine(lines, "视口", meta.viewport);
  pushNotifyLine(lines, "屏幕", meta.screen);
  pushNotifyLine(lines, "平台", meta.platform);
  pushNotifyLine(lines, "来源", meta.referrer);
  pushNotifyLine(lines, "UA", meta.userAgent);
}

/**
 * Browser-only metadata (no permission prompts).
 * @param {object} [opts]
 * @param {boolean} [opts.skipGeo]
 */
async function collectClientMeta(opts) {
  const options = opts || {};
  const meta = collectClientMetaSync();

  if (options.skipGeo || typeof fetch === "undefined") {
    return meta;
  }

  try {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 4000) : null;
    const response = await fetch("https://ipapi.co/json/", {
      signal: controller ? controller.signal : undefined
    });
    if (timer) clearTimeout(timer);
    if (response.ok) {
      const geo = await response.json();
      meta.location = [geo.city, geo.region, geo.country_name].filter(Boolean).join(", ");
      meta.ip = geo.ip || "";
    }
  } catch (_) { /* geo is optional */ }

  return meta;
}

function collectClientMetaSync() {
  const now = new Date();
  const meta = {
    completedAtLocal: now.toLocaleString("zh-CN", { hour12: false }),
    completedAtUtc: now.toISOString(),
    timezone: "",
    language: typeof navigator !== "undefined" ? navigator.language || "" : "",
    platform: typeof navigator !== "undefined" ? navigator.platform || "" : "",
    userAgent: typeof navigator !== "undefined" ? String(navigator.userAgent || "").slice(0, 200) : "",
    referrer: typeof document !== "undefined" ? document.referrer || "" : "",
    pageUrl: typeof location !== "undefined" ? location.href : "",
    viewport:
      typeof window !== "undefined"
        ? `${window.innerWidth}x${window.innerHeight}`
        : "",
    screen:
      typeof screen !== "undefined"
        ? `${screen.width}x${screen.height}`
        : "",
    location: "",
    ip: ""
  };

  try {
    meta.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch (_) { /* ignore */ }

  return meta;
}

/**
 * @param {object} payload – buildResultPayload() from index.html
 * @param {object} meta – from collectClientMeta()
 * @param {object} [opts]
 * @param {string} [opts.reportUrl]
 */
function formatCompletionNotifyMarkdown(payload, meta, opts) {
  const lines = ["- 通知：新用户完成 ZYBT 专业测试"];
  appendResultNotifyLines(lines, payload, opts);
  appendMetaNotifyLines(lines, meta);
  return lines.join("\n");
}

function formatBetaTestCompletionNotifyMarkdown(payload, meta, opts) {
  const lines = ["- 通知：内测 beta 链接用户完成 ZYBT 专业测试"];
  pushNotifyLine(lines, "内测", "已免付费解锁完全版");
  appendResultNotifyLines(lines, payload, opts);
  appendMetaNotifyLines(lines, meta);
  return lines.join("\n");
}

function formatCompletionNotifyText(payload, meta, opts) {
  return formatCompletionNotifyMarkdown(payload, meta, opts);
}

/**
 * @param {object} payload
 * @param {object} meta
 * @param {object} [opts]
 * @param {string} [opts.reportUrl]
 */
function formatImageSavedNotifyMarkdown(payload, meta, opts) {
  const lines = ["- 通知：用户保存了分享图"];
  appendResultNotifyLines(lines, payload, opts);
  appendMetaNotifyLines(lines, meta);
  return lines.join("\n");
}

function formatStripePayClickNotifyMarkdown(payload, meta, opts) {
  const options = opts || {};
  const lines = ["- 通知：用户点击付费解锁（Stripe）"];
  pushNotifyLine(lines, "金额", options.amount || "￥5.99");
  if (options.channel === "wechat_guide") {
    pushNotifyLine(lines, "动作", "微信内点击，已展示「浏览器打开」引导");
  } else {
    pushNotifyLine(lines, "动作", "跳转 Stripe 支付页");
  }
  if (options.stripeUrl) {
    lines.push(`- Stripe：[链接](${options.stripeUrl})`);
  }
  if (options.browserOpenUrl) {
    lines.push(`- 浏览器打开链接：[链接](${options.browserOpenUrl})`);
  }
  appendResultNotifyLines(lines, payload, options);
  appendMetaNotifyLines(lines, meta);
  return lines.join("\n");
}

function markNotifyFlag(prefix, dedupeKey) {
  if (typeof sessionStorage === "undefined" || !dedupeKey) return;
  try {
    sessionStorage.setItem(prefix + dedupeKey, "1");
  } catch (_) { /* ignore */ }
}

function wasNotifyFlag(prefix, dedupeKey) {
  if (typeof sessionStorage === "undefined" || !dedupeKey) return false;
  try {
    return sessionStorage.getItem(prefix + dedupeKey) === "1";
  } catch (_) {
    return false;
  }
}

/**
 * Fire-and-forget: notify admin when a user freshly completes the test.
 * @param {object} payload
 * @param {object} [opts]
 * @param {string} [opts.dedupeKey] – e.g. serializeAnswersToParam()
 * @param {string} [opts.reportUrl]
 * @param {string|number} [opts.notifyUid]
 */
async function notifyTestCompletion(payload, opts) {
  const options = opts || {};
  const dedupeKey = options.dedupeKey || "";
  if (dedupeKey && wasNotifyFlag(VOCE_NOTIFY_DEDUPE_PREFIX, dedupeKey)) {
    return { skipped: true, reason: "duplicate" };
  }

  const meta = await collectClientMeta();
  const markdown = formatCompletionNotifyMarkdown(payload, meta, options);
  const uid = options.notifyUid != null ? options.notifyUid : VOCECHAT_NOTIFY_UID;
  await sendMarkdownToUser(uid, markdown);

  if (dedupeKey) markNotifyFlag(VOCE_NOTIFY_DEDUPE_PREFIX, dedupeKey);
  return { sent: true, uid };
}

/**
 * Notify admin when a beta-link user freshly completes the test.
 */
async function notifyBetaTestCompletion(payload, opts) {
  const options = opts || {};
  const dedupeKey = options.dedupeKey || "";
  if (dedupeKey && wasNotifyFlag(VOCE_BETA_NOTIFY_DEDUPE_PREFIX, dedupeKey)) {
    return { skipped: true, reason: "duplicate" };
  }

  const meta = await collectClientMeta();
  const markdown = formatBetaTestCompletionNotifyMarkdown(payload, meta, options);
  const uid = options.notifyUid != null ? options.notifyUid : VOCECHAT_NOTIFY_UID;
  await sendMarkdownToUser(uid, markdown, { apiKeyProfile: "beta" });

  if (dedupeKey) markNotifyFlag(VOCE_BETA_NOTIFY_DEDUPE_PREFIX, dedupeKey);
  return { sent: true, uid };
}

/**
 * Notify admin when the user saves / opens the share image (button or unlock dialog).
 */
async function notifyTestImageSaved(payload, opts) {
  const options = opts || {};
  const dedupeKey = options.dedupeKey || "";
  if (dedupeKey && wasNotifyFlag(VOCE_SAVE_DEDUPE_PREFIX, dedupeKey)) {
    return { skipped: true, reason: "duplicate" };
  }

  const meta = await collectClientMeta();
  const markdown = formatImageSavedNotifyMarkdown(payload, meta, options);
  const uid = options.notifyUid != null ? options.notifyUid : VOCECHAT_NOTIFY_UID;
  await sendMarkdownToUser(uid, markdown);

  if (dedupeKey) markNotifyFlag(VOCE_SAVE_DEDUPE_PREFIX, dedupeKey);
  return { sent: true, uid };
}

/**
 * Notify admin when the user clicks the Stripe pay-unlock button.
 * Fires before redirect; payment success/failure is not required.
 */
async function notifyStripePayClick(payload, opts) {
  const options = opts || {};
  const meta = options.keepalive
    ? collectClientMetaSync()
    : await collectClientMeta();
  const markdown = formatStripePayClickNotifyMarkdown(payload, meta, options);
  const uid = options.notifyUid != null ? options.notifyUid : VOCECHAT_NOTIFY_UID;
  await sendMarkdownToUser(uid, markdown, {
    keepalive: !!options.keepalive,
    apiKeyProfile: "pay"
  });
  return { sent: true, uid };
}

async function main(argv) {
  const args = argv.slice(2);
  const command = args[0] || "test";

  if (command === "test") {
    const uid = args[1] || DEFAULT_TEST_UID;
    await sendTextToUser(uid, "hello world");
    console.log(`Sent test message to user ${uid}`);
    return;
  }

  if (command === "text") {
    const uid = args[1];
    const message = args.slice(2).join(" ");
    if (!uid || !message) {
      throw new Error("Usage: node vocechat-bot.js text <uid> <message>");
    }
    await sendTextToUser(uid, message);
    console.log(`Sent text to user ${uid}`);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

const exportApi = {
  VOCECHAT_BASE_URL,
  VOCECHAT_BOT_API_KEY,
  VOCECHAT_BOT_API_KEY_PAY,
  VOCECHAT_BOT_API_KEY_BETA,
  VOCECHAT_NOTIFY_UID,
  sendToUser,
  sendTextToUser,
  sendMarkdownToUser,
  formatResultMarkdown,
  sendResultToUser,
  collectClientMeta,
  formatCompletionNotifyText,
  formatCompletionNotifyMarkdown,
  formatBetaTestCompletionNotifyMarkdown,
  formatImageSavedNotifyMarkdown,
  formatStripePayClickNotifyMarkdown,
  notifyTestCompletion,
  notifyBetaTestCompletion,
  notifyTestImageSaved,
  notifyStripePayClick,
  collectClientMetaSync,
  getApiKey,
  getBaseUrl
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = exportApi;
}

if (typeof window !== "undefined") {
  window.VoceChatBot = exportApi;
}

if (typeof require !== "undefined" && require.main === module) {
  main(process.argv).catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
