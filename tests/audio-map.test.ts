import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEmptyAudioMap, loadAudioMap, saveAudioMap } from "../src/core/audio-map.js";
import type { AudioArtifact } from "../src/types/index.js";

describe("audio-map", () => {
  test("createEmptyAudioMap is version 3", () => {
    expect(createEmptyAudioMap().version).toBe(3);
  });

  test("returns an empty v3 map when the file is missing", async () => {
    const map = await loadAudioMap(join(tmpdir(), `vocasync-missing-${Date.now()}.json`));
    expect(map.version).toBe(3);
    expect(map.entries).toEqual({});
  });

  test("round-trips a v3 artifact", async () => {
    const path = join(tmpdir(), `vocasync-roundtrip-${Date.now()}.json`);
    const artifact: AudioArtifact = {
      contentHash: "abc",
      voice: "onyx",
      language: "en",
      format: "mp3",
      synthesisProjectUuid: "syn-1",
      synthesisPublishableKey: "pk_syn",
      audioUrl: "https://vocasync.io/api/v1/stream/syn-1/synthesis",
      alignmentProjectUuid: "ali-1",
      alignmentPublishableKey: "pk_ali",
      words: [{ word: "hello", start: 0, end: 0.5 }],
      duration: 0.5,
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z",
    };
    const map = createEmptyAudioMap();
    map.entries.hello = artifact;
    await saveAudioMap(path, map);

    const loaded = await loadAudioMap(path);
    expect(loaded.version).toBe(3);
    expect(loaded.entries.hello).toEqual(artifact);
  });
});
