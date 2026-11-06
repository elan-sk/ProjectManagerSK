import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAnyUser } from "@/lib/apiAuth";
import { transcribeAudio, transcriptionErrorText } from "@/lib/voiceTranscription";
import { APP_VOICE_MAX_SECONDS } from "@/lib/uploadLimits";

const MAX_AUDIO_BYTES = 30 * 1024 * 1024;
const JOB_TTL_MS = 15 * 60_000;

type Job = { userId: string; createdAt: number; result?: { text: string } | { error: string } };
const globalForJobs = globalThis as unknown as { voiceJobs?: Map<string, Job> };
const jobs = (globalForJobs.voiceJobs ??= new Map());

function prune() {
  const now = Date.now();
  for (const [id, job] of jobs) if (now - job.createdAt > JOB_TTL_MS) jobs.delete(id);
}

export async function POST(request: Request) {
  const auth = await requireAnyUser(request);
  if ("error" in auth) return auth.error;

  try {
    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File) || audio.size === 0) return NextResponse.json({ error: transcriptionErrorText("failed") }, { status: 400 });
    const tooLong = transcriptionErrorText("too_long", APP_VOICE_MAX_SECONDS);
    if (audio.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: tooLong }, { status: 413 });
    const seconds = Number(form.get("seconds")) || null;
    if (seconds && seconds > APP_VOICE_MAX_SECONDS + 2) return NextResponse.json({ error: tooLong }, { status: 413 });

    prune();
    const id = randomUUID();
    const job: Job = { userId: auth.actor.id, createdAt: Date.now() };
    jobs.set(id, job);
    const buffer = Buffer.from(await audio.arrayBuffer());
    transcribeAudio(buffer, seconds ? Math.min(seconds, APP_VOICE_MAX_SECONDS) : null)
      .then((r) => (job.result = r.ok ? { text: r.text } : { error: transcriptionErrorText(r.reason, APP_VOICE_MAX_SECONDS) }))
      .catch((err) => {
        console.error("[voz] falló la transcripción desde la app", err);
        job.result = { error: transcriptionErrorText("failed") };
      });
    return NextResponse.json({ jobId: id }, { status: 202 });
  } catch (err) {
    console.error("[voz] no se pudo recibir el audio", err);
    return NextResponse.json({ error: transcriptionErrorText("failed") }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const auth = await requireAnyUser(request);
  if ("error" in auth) return auth.error;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const job = jobs.get(id);
  if (!job || job.userId !== auth.actor.id) return NextResponse.json({ error: "No se encontró ese audio; grabarlo de nuevo." }, { status: 404 });
  if (!job.result) return NextResponse.json({ status: "pending" });
  jobs.delete(id);
  return NextResponse.json(job.result, { status: "error" in job.result ? 422 : 200 });
}
