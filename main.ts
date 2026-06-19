/// <reference lib="deno.unstable" />

// ---------------------------------------------------------------------------
// La Bataille des Chips — petit serveur Deno + Deno KV (stockage partagé)
// Le même code tourne en local (deno task dev) et sur Deno Deploy.
// ---------------------------------------------------------------------------

const kv = await Deno.openKv();

// Code "organisateur" demandé pour révéler les notes individuelles à la fin.
// Modifiable via une variable d'environnement ORGANIZER_CODE.
const ORGANIZER_CODE = (Deno.env.get("ORGANIZER_CODE") ?? "patate").trim();

type Chip = { id: string; name: string; broughtBy: string; createdAt: number };
type Rating = { score: number; updatedAt: number };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function clean(s: unknown, max = 60): string {
  return String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

// --- Lecture de l'état complet ----------------------------------------------
async function getState(name: string) {
  const revealed =
    (await kv.get<boolean>(["meta", "revealed"])).value ?? false;

  const chips: Array<Record<string, unknown>> = [];
  for await (const entry of kv.list<Chip>({ prefix: ["chips"] })) {
    const chip = entry.value;
    let sum = 0;
    let count = 0;
    let myScore: number | null = null;
    const notes: Array<{ voter: string; score: number }> = [];

    for await (const r of kv.list<Rating>({ prefix: ["ratings", chip.id] })) {
      const voter = r.key[2] as string;
      sum += r.value.score;
      count++;
      notes.push({ voter, score: r.value.score });
      if (voter === name) myScore = r.value.score;
    }

    const card: Record<string, unknown> = {
      id: chip.id,
      name: chip.name,
      broughtBy: chip.broughtBy,
      createdAt: chip.createdAt,
      avg: count ? Math.round((sum / count) * 10) / 10 : null,
      count,
      myScore,
      mine: chip.broughtBy === name,
    };
    // Les notes individuelles ne sortent du serveur QUE si on a révélé.
    if (revealed) {
      notes.sort((a, b) => b.score - a.score);
      card.notes = notes;
    }
    chips.push(card);
  }

  chips.sort((a, b) => (a.createdAt as number) - (b.createdAt as number));
  return { chips, revealed, you: name };
}

// --- Handler HTTP ------------------------------------------------------------
async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // ---- API ----
  if (path === "/api/state" && req.method === "GET") {
    const name = clean(url.searchParams.get("name"));
    return json(await getState(name));
  }

  if (path === "/api/chips" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const name = clean(body.name);
    const broughtBy = clean(body.broughtBy, 30);
    if (!name || !broughtBy) return json({ error: "champs manquants" }, 400);
    const chip: Chip = {
      id: crypto.randomUUID(),
      name,
      broughtBy,
      createdAt: Date.now(),
    };
    await kv.set(["chips", chip.id], chip);
    return json({ ok: true, chip });
  }

  if (path === "/api/chips/delete" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const id = clean(body.id, 60);
    const name = clean(body.name, 30);
    const existing = (await kv.get<Chip>(["chips", id])).value;
    if (!existing) return json({ error: "introuvable" }, 404);
    if (existing.broughtBy !== name) {
      return json({ error: "pas le propriétaire" }, 403);
    }
    // Supprime le paquet et toutes ses notes.
    await kv.delete(["chips", id]);
    for await (const r of kv.list({ prefix: ["ratings", id] })) {
      await kv.delete(r.key);
    }
    return json({ ok: true });
  }

  if (path === "/api/rate" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const chipId = clean(body.chipId, 60);
    const voter = clean(body.voter, 30);
    let score = Number(body.score);
    if (!chipId || !voter || Number.isNaN(score)) {
      return json({ error: "champs manquants" }, 400);
    }
    score = Math.max(0, Math.min(10, Math.round(score * 2) / 2)); // 0..10 par 0.5
    const chip = (await kv.get<Chip>(["chips", chipId])).value;
    if (!chip) return json({ error: "chips introuvable" }, 404);
    if (chip.broughtBy === voter) {
      return json({ error: "on ne note pas ses propres chips" }, 403);
    }
    const rating: Rating = { score, updatedAt: Date.now() };
    await kv.set(["ratings", chipId, voter], rating);
    return json({ ok: true });
  }

  if (path === "/api/reset" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const code = clean(body.code, 40);
    if (code !== ORGANIZER_CODE) return json({ error: "code incorrect" }, 403);
    let n = 0;
    for await (const e of kv.list({ prefix: [] })) {
      await kv.delete(e.key);
      n++;
    }
    return json({ ok: true, deleted: n });
  }

  if (path === "/api/reveal" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const code = clean(body.code, 40);
    if (code !== ORGANIZER_CODE) return json({ error: "code incorrect" }, 403);
    const value = body.value === false ? false : true;
    await kv.set(["meta", "revealed"], value);
    return json({ ok: true, revealed: value });
  }

  // ---- Fichiers statiques ----
  const files: Record<string, [string, string]> = {
    "/": ["index.html", "text/html; charset=utf-8"],
    "/index.html": ["index.html", "text/html; charset=utf-8"],
    "/styles.css": ["styles.css", "text/css; charset=utf-8"],
    "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  };
  const file = files[path];
  if (file) {
    try {
      const data = await Deno.readFile(
        new URL(`./static/${file[0]}`, import.meta.url),
      );
      return new Response(data, { headers: { "content-type": file[1] } });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  }

  return new Response("Not found", { status: 404 });
}

Deno.serve(handler);
