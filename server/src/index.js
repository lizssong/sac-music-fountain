// 예술의전당 세계음악분수 — 실시간 광장 서버 (Cloudflare Worker + Durable Object)
// One Durable Object per plaza room. Visitors connect by WebSocket and share only
// plaza coordinates, a colour, an avatar number and a nickname.

const MAX_PEOPLE = 80;
const MAX_MSG = 600;
const EMOTES = ["wave", "heart", "clap", "laugh", "wow", "party", "cry"];

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const cors = { "Access-Control-Allow-Origin": "*" };
    const room = (url.searchParams.get("room") || "plaza").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32) || "plaza";
    const stub = env.PLAZA.get(env.PLAZA.idFromName(room));
    if (url.pathname === "/ws") {
      if (req.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426, headers: cors });
      return stub.fetch(req);
    }
    if (url.pathname === "/count") {
      const r = await stub.fetch(new Request("https://plaza/count"));
      return new Response(await r.text(), { headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
    }
    return new Response("세계음악분수 광장 서버입니다. /ws 로 연결하세요.", { headers: { ...cors, "Content-Type": "text/plain; charset=utf-8" } });
  }
};

const num = v => (typeof v === "number" && isFinite(v) ? Math.max(-60, Math.min(60, v)) : null);
const clean = s => (typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯]/g, "").trim().slice(0, 12) : "");
function sanitize(p) {
  if (!p || typeof p !== "object") return null;
  const x = num(p.x), z = num(p.z);
  if (x === null || z === null) return null;
  return {
    x, z,
    c: typeof p.c === "string" && /^#[0-9a-fA-F]{6}$/.test(p.c) ? p.c : null,
    look: Number.isInteger(p.look) && p.look > 0 && p.look < 1e7 ? p.look : 1,
    n: clean(p.n), nc: p.nc ? 1 : 0
  };
}

export class Plaza {
  constructor(state) { this.state = state; }

  peers() {
    return this.state.getWebSockets().map(ws => ws.deserializeAttachment() || {}).filter(a => a.id);
  }
  broadcast(msg, except) {
    const s = JSON.stringify(msg);
    for (const ws of this.state.getWebSockets()) { if (ws !== except) { try { ws.send(s); } catch (e) {} } }
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/count") return new Response(JSON.stringify({ count: this.peers().length }));
    if (this.state.getWebSockets().length >= MAX_PEOPLE) return new Response("광장이 가득 찼어요", { status: 503 });
    const [client, server] = Object.values(new WebSocketPair());
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ id, p: null, t: 0, n: 0 });
    server.send(JSON.stringify({ t: "hello", id, peers: this.peers().filter(a => a.p && a.id !== id).map(a => ({ id: a.id, p: a.p })) }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== "string" || raw.length > MAX_MSG) return;
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    const a = ws.deserializeAttachment() || {};
    // simple per-connection rate limit: 20 messages per second
    const now = Date.now();
    if (now - (a.t || 0) > 1000) { a.t = now; a.n = 0; }
    if (++a.n > 20) { ws.serializeAttachment(a); return; }
    if (m.t === "p") {
      const p = sanitize(m.p); if (!p) return;
      a.p = p; ws.serializeAttachment(a);
      this.broadcast({ t: "p", id: a.id, p }, ws);
    } else if (m.t === "e" && ["wish", "cheer", "emote", "chat"].includes(m.k)) {
      ws.serializeAttachment(a);
      let d = {};
      if (m.k === "wish") { d = { x: num(m.d && m.d.x), z: num(m.d && m.d.z) }; if (d.x === null || d.z === null) return; }
      else if (m.k === "emote") { const k = m.d && m.d.k; if (!EMOTES.includes(k)) return; d = { k }; }
      else if (m.k === "chat") {
        const msg = typeof (m.d && m.d.m) === "string" ? m.d.m.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) : "";
        if (!msg || now - (a.lc || 0) < 800) return; a.lc = now; ws.serializeAttachment(a); d = { m: msg };
      }
      this.broadcast({ t: "e", id: a.id, k: m.k, d }, ws);
    } else if (m.t === "ping") {
      ws.serializeAttachment(a);
      try { ws.send('{"t":"pong"}'); } catch (e) {}
    }
  }
  async webSocketClose(ws) { const a = ws.deserializeAttachment() || {}; if (a.id) this.broadcast({ t: "x", id: a.id }, ws); }
  async webSocketError(ws) { const a = ws.deserializeAttachment() || {}; if (a.id) this.broadcast({ t: "x", id: a.id }, ws); }
}
