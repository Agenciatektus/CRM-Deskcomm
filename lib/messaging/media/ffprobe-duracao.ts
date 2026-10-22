/**
 * Duração de um áudio pelo `ffprobe` (vem no mesmo pacote do `ffmpeg` que o
 * worker de mídia já usa). Módulo à parte para o teste do worker poder trocá-lo
 * sem rodar processo nenhum. Ver `trava-da-transcricao.ts`.
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** ffprobe → duração em segundos, ou null se não deu para medir. Nunca lança. */
export async function medirDuracaoComFfprobe(audio: Buffer): Promise<number | null> {
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), "dur-audio-"));
    const arquivo = join(dir, "in");
    await writeFile(arquivo, audio);
    const saida = await new Promise<string>((resolve, reject) => {
      const proc = spawn(
        "ffprobe",
        ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", arquivo],
        { timeout: 15_000 },
      );
      let out = "";
      proc.stdout.on("data", (d) => {
        out += String(d);
      });
      proc.on("error", reject);
      proc.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`ffprobe_exit_${code}`))));
    });
    const s = Number.parseFloat(saida.trim());
    return Number.isFinite(s) && s > 0 ? s : null;
  } catch {
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
