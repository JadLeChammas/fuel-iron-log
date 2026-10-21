// Fuel & Iron Log — home-screen widget for Scriptable (iPhone).
// Shows today's calories and protein against your targets.
// Run it once inside Scriptable to sign in; your email and password are kept in the iPhone Keychain, never in this file.

const SUPABASE_URL = "https://vihtfmxbndutftapvtbs.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpaHRmbXhibmR1dGZ0YXB2dGJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzNjUyNTQsImV4cCI6MjEwNzk0MTI1NH0.9YcRCunVNnSnF9Ye0Amaf37yHnK_9w5CRI9XI6__9Rs";
const APP_URL = "https://fuel-iron-log.vercel.app"; // tapping the widget opens this; change it if your Vercel address is different

const KC_EMAIL = "fil_email", KC_PASS = "fil_password", KC_REFRESH = "fil_refresh";
const COLORS = { bg: "#1C1C20", text: "#F2F2F4", dim: "#9C9CA6", kcal: "#FF9F43", protein: "#2DD4B0", track: "#2C2C33", band: "#24513A", good: "#4ADE80", bad: "#F87171", warn: "#FBBF24" };

const pad = n => String(n).padStart(2, "0");
const iso = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());

async function askCredentials() {
  const a = new Alert();
  a.title = "Fuel & Iron Log";
  a.message = "Sign in with the same email and password you use in the app.";
  a.addTextField("Email", Keychain.contains(KC_EMAIL) ? Keychain.get(KC_EMAIL) : "");
  a.addSecureTextField("Password", "");
  a.addAction("Save");
  a.addCancelAction("Cancel");
  if (await a.presentAlert() === -1) return false;
  Keychain.set(KC_EMAIL, a.textFieldValue(0).trim());
  Keychain.set(KC_PASS, a.textFieldValue(1));
  if (Keychain.contains(KC_REFRESH)) Keychain.remove(KC_REFRESH);
  return true;
}

async function token(grant, body) {
  const r = new Request(`${SUPABASE_URL}/auth/v1/token?grant_type=${grant}`);
  r.method = "POST";
  r.headers = { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" };
  r.body = JSON.stringify(body);
  const j = await r.loadJSON();
  if (!j.access_token) return null;
  Keychain.set(KC_REFRESH, j.refresh_token);
  return j.access_token;
}

async function signIn() {
  if (Keychain.contains(KC_REFRESH)) {
    const t = await token("refresh_token", { refresh_token: Keychain.get(KC_REFRESH) });
    if (t) return t;
  }
  if (!Keychain.contains(KC_EMAIL) || !Keychain.contains(KC_PASS)) return null;
  return token("password", { email: Keychain.get(KC_EMAIL), password: Keychain.get(KC_PASS) });
}

async function get(path, jwt) {
  const r = new Request(`${SUPABASE_URL}/rest/v1/${path}`);
  r.headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${jwt}` };
  return r.loadJSON();
}

async function loadToday() {
  const jwt = await signIn();
  if (!jwt) return { error: "Open Scriptable and run this script to sign in." };
  const [days, settings] = await Promise.all([
    get(`days?select=meals&date=eq.${iso(new Date())}`, jwt),
    get("settings?select=*", jwt) // "*" keeps working before and after the kcal_min / protein_max database update
  ]);
  if (!Array.isArray(days)) return { error: "Couldn't load today's meals." };
  const meals = (days[0] && days[0].meals) || [];
  const s = (Array.isArray(settings) && settings[0]) || {};
  return {
    kcal: meals.reduce((t, m) => t + (+m.kcal || 0), 0),
    protein: meals.reduce((t, m) => t + (+m.protein || 0), 0),
    kcalMin: +s.kcal_min || 0, kcalMax: +s.kcal_target || 0,
    proteinMin: +s.protein_target || 0, proteinMax: +s.protein_max || 0,
    count: meals.length
  };
}

// Same rules as the app: under the calorie minimum is fine; under the protein minimum is not.
function status(kind, v, min, max) {
  if (!min && !max) return { text: "no window", color: COLORS.dim };
  if (kind === "kcal") {
    if (max && v > max) return { text: `${Math.round(v - max)} over`, color: COLORS.bad };
    if (min && v < min) return { text: `${Math.round(min - v)} to min`, color: COLORS.dim };
    return { text: max ? `${Math.round(max - v)} to max ✓` : "in window ✓", color: COLORS.good };
  }
  if (min && v < min) return { text: `${Math.round(min - v)} g to min`, color: COLORS.bad };
  if (max && v > max) return { text: `${Math.round(v - max)} g over max`, color: COLORS.warn };
  return { text: "in window ✓", color: COLORS.good };
}

function bar(value, min, max, color, width) {
  const h = 6, ctx = new DrawContext(), scale = max || min;
  ctx.size = new Size(width, h);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const rect = (x, w, c) => { ctx.setFillColor(new Color(c)); const p = new Path(); p.addRoundedRect(new Rect(x, 0, w, h), 3, 3); ctx.addPath(p); ctx.fillPath(); };
  rect(0, width, COLORS.track);
  if (min && max) rect(min / max * width, width - min / max * width, COLORS.band); // the window
  const w = scale ? Math.max(h, Math.min(1, value / scale) * width) : 0;
  if (w) rect(0, w, color);
  return ctx.getImage();
}

function line(stack, kind, value, min, max, unit, color, width, small) {
  const n = x => Math.round(x).toLocaleString();
  const row = stack.addStack();
  row.centerAlignContent();
  const v = row.addText(n(value));
  v.font = Font.boldRoundedSystemFont(small ? 20 : 22);
  v.textColor = new Color(color);
  const range = min && max ? `${n(min)}–${n(max)}` : max ? `max ${n(max)}` : min ? `min ${n(min)}` : "";
  const t = row.addText(range ? ` / ${range} ${unit}` : ` ${unit}`);
  t.font = Font.mediumRoundedSystemFont(small ? 10 : 13);
  t.textColor = new Color(COLORS.dim);
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.7;
  row.addSpacer();
  const st = status(kind, value, min, max);
  if (!small) {
    const l = row.addText(st.text);
    l.font = Font.mediumSystemFont(12);
    l.textColor = new Color(st.color);
  }
  stack.addSpacer(4);
  stack.addImage(bar(value, min, max, st.color === COLORS.bad ? COLORS.bad : color, width));
}

async function build() {
  const family = config.widgetFamily || "medium";
  const small = family === "small";
  const w = new ListWidget();
  w.backgroundColor = new Color(COLORS.bg);
  w.setPadding(14, 14, 14, 14);
  w.url = APP_URL;
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

  const head = w.addText(small ? "TODAY" : "FUEL & IRON · TODAY");
  head.font = Font.semiboldSystemFont(11);
  head.textColor = new Color(COLORS.dim);
  w.addSpacer(small ? 6 : 8);

  let d;
  try { d = await loadToday(); } catch (e) { d = { error: "No connection. Will retry." }; }
  if (d.error) {
    const m = w.addText(d.error);
    m.font = Font.systemFont(13);
    m.textColor = new Color(COLORS.text);
    return w;
  }

  const width = small ? 130 : 290;
  line(w, "kcal", d.kcal, d.kcalMin, d.kcalMax, "kcal", COLORS.kcal, width, small);
  w.addSpacer(small ? 8 : 10);
  line(w, "protein", d.protein, d.proteinMin, d.proteinMax, "g", COLORS.protein, width, small);
  w.addSpacer();

  const foot = w.addText(`${d.count} ${d.count === 1 ? "item" : "items"} · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
  foot.font = Font.systemFont(10);
  foot.textColor = new Color(COLORS.dim);
  return w;
}

if (config.runsInApp && (!Keychain.contains(KC_EMAIL) || args.queryParameters.reset)) {
  await askCredentials();
} else if (config.runsInApp && !(await signIn())) {
  const a = new Alert();
  a.title = "Sign-in failed";
  a.message = "Check your email and password and try again.";
  a.addAction("OK");
  await a.presentAlert();
  await askCredentials();
}

const widget = await build();
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
