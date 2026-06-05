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
const VOCECHAT_BOT_API_KEY =
  "24145bc2c1724293676b7fbc341fa27a8b4a36c639658273845dc2fe73bf40877b22756964223a3433363639382c226e6f6e6365223a22743351414e657331496d6f4141414141325439566a705a372b38457244717748227d";
/** Admin inbox: new completions are pushed here (no prompt to the test taker). */
const VOCECHAT_NOTIFY_UID = "394719";
const DEFAULT_TEST_UID = VOCECHAT_NOTIFY_UID;
const VOCE_NOTIFY_DEDUPE_PREFIX = "majorTestVoceNotify:";
const VOCE_SAVE_DEDUPE_PREFIX = "majorTestVoceSave:";

function getBaseUrl() {
  const fromEnv = typeof process !== "undefined" && process.env && process.env.VOCECHAT_BASE_URL;
  return (fromEnv || VOCECHAT_BASE_URL).replace(/\/$/, "");
}

function getApiKey() {
  const fromEnv = typeof process !== "undefined" && process.env && process.env.VOCECHAT_BOT_API_KEY;
  return fromEnv || VOCECHAT_BOT_API_KEY;
}

/**
 * @param {string|number} uid
 * @param {string} body
 * @param {"text/plain"|"text/markdown"} contentType
 */
async function sendToUser(uid, body, contentType = "text/plain") {
  const baseUrl = getBaseUrl();
  const apiKey = getApiKey();
  const url = `${baseUrl}/api/bot/send_to_user/${encodeURIComponent(String(uid))}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "content-type": contentType
    },
    body
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

async function sendMarkdownToUser(uid, markdown) {
  return sendToUser(uid, markdown, "text/markdown");
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
  const lines = [
    "### ZYBT AI专业测试 · 你的结果",
    "",
    `${result.codename || ""}${result.codenameEn ? ` · ${result.codenameEn}` : ""}`,
    result.displayName ? `_${result.displayName}_` : "",
    result.matchPercent != null && result.matchPercent !== ""
      ? `匹配度：${result.matchPercent}%`
      : "",
    result.shareUrl ? `[查看完整报告](${result.shareUrl})` : "",
    Array.isArray(result.majors) && result.majors.length
      ? `推荐专业：${result.majors.slice(0, 5).join("、")}`
      : ""
  ];
  return lines.filter(Boolean).join("\n");
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

/**
 * Browser-only metadata (no permission prompts).
 */
async function collectClientMeta() {
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

  if (typeof fetch !== "undefined") {
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
  }

  return meta;
}

/**
 * @param {object} payload – buildResultPayload() from index.html
 * @param {object} meta – from collectClientMeta()
 * @param {object} [opts]
 * @param {string} [opts.reportUrl]
 */
function formatCompletionNotifyMarkdown(payload, meta, opts) {
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

  const lines = [
    "### 新用户完成 ZYBT 专业测试",
    "",
    `画像：${profileLabel(rule)}`,
    rule && rule.display_name ? `类型：${rule.display_name}` : "",
    payload && payload.matchPercent != null ? `匹配度：${payload.matchPercent}%` : "",
    payload && payload.conf ? `置信度：${payload.conf}` : "",
    payload && payload.conf === "低" && secondary
      ? `接近画像：${profileLabel(secondary)} / ${secondary.display_name || ""}`
      : "",
    mbti && mbti.code ? `MBTI：${mbti.code}${mbti.name ? `（${mbti.name}）` : ""}` : "",
    majors.length ? `推荐专业：${majors.join("、")}` : "",
    topDims ? `维度：${topDims}` : "",
    options.reportUrl ? `[完整报告](${options.reportUrl})` : "",
    "",
    "---",
    "### 环境信息",
    meta.completedAtLocal ? `- 本地时间：${meta.completedAtLocal}` : "",
    meta.completedAtUtc ? `- UTC：${meta.completedAtUtc}` : "",
    meta.timezone ? `- 时区：${meta.timezone}` : "",
    meta.language ? `- 语言：${meta.language}` : "",
    meta.location ? `- 位置：${meta.location}` : "",
    meta.ip ? `- IP：${meta.ip}` : "",
    meta.pageUrl ? `- 页面：${meta.pageUrl}` : "",
    meta.viewport ? `- 视口：${meta.viewport}` : "",
    meta.screen ? `- 屏幕：${meta.screen}` : "",
    meta.platform ? `- 平台：${meta.platform}` : "",
    meta.referrer ? `- 来源：${meta.referrer}` : "",
    meta.userAgent ? `- UA：${meta.userAgent}` : ""
  ];

  return lines.filter(Boolean).join("\n");
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
  const options = opts || {};
  const rule = payload && payload.rule;
  const secondary = payload && payload.secondary && payload.secondary.rule;
  const mbti = payload && payload.mbti;
  const majors = (payload && payload.combinedMajors || [])
    .slice(0, 6)
    .map((m) => m.name)
    .filter(Boolean);

  const lines = [
    "### 用户保存了分享图",
    "",
    `画像：${profileLabel(rule)}`,
    rule && rule.display_name ? `类型：${rule.display_name}` : "",
    payload && payload.matchPercent != null ? `匹配度：${payload.matchPercent}%` : "",
    payload && payload.conf ? `置信度：${payload.conf}` : "",
    payload && payload.conf === "低" && secondary
      ? `接近画像：${profileLabel(secondary)} / ${secondary.display_name || ""}`
      : "",
    mbti && mbti.code ? `MBTI：${mbti.code}${mbti.name ? `（${mbti.name}）` : ""}` : "",
    majors.length ? `推荐专业：${majors.join("、")}` : "",
    options.reportUrl ? `[完整报告](${options.reportUrl})` : "",
    "",
    "---",
    "### 环境信息",
    meta.completedAtLocal ? `- 本地时间：${meta.completedAtLocal}` : "",
    meta.completedAtUtc ? `- UTC：${meta.completedAtUtc}` : "",
    meta.timezone ? `- 时区：${meta.timezone}` : "",
    meta.language ? `- 语言：${meta.language}` : "",
    meta.location ? `- 位置：${meta.location}` : "",
    meta.ip ? `- IP：${meta.ip}` : "",
    meta.pageUrl ? `- 页面：${meta.pageUrl}` : "",
    meta.viewport ? `- 视口：${meta.viewport}` : "",
    meta.screen ? `- 屏幕：${meta.screen}` : "",
    meta.platform ? `- 平台：${meta.platform}` : "",
    meta.referrer ? `- 来源：${meta.referrer}` : "",
    meta.userAgent ? `- UA：${meta.userAgent}` : ""
  ];

  return lines.filter(Boolean).join("\n");
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
  VOCECHAT_NOTIFY_UID,
  sendToUser,
  sendTextToUser,
  sendMarkdownToUser,
  formatResultMarkdown,
  sendResultToUser,
  collectClientMeta,
  formatCompletionNotifyText,
  formatCompletionNotifyMarkdown,
  formatImageSavedNotifyMarkdown,
  notifyTestCompletion,
  notifyTestImageSaved,
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
