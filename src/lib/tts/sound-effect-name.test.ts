import { describe, expect, test } from "bun:test"

import {
  normalizeSoundEffectName,
  uniqueSoundEffectName,
} from "@/lib/tts/sound-effect-name"

describe("normalizeSoundEffectName", () => {
  test("lowercases and replaces runs of invalid characters with one underscore", () => {
    expect(normalizeSoundEffectName("  Air Horn!!  ")).toBe("air_horn")
    expect(normalizeSoundEffectName("big   bad__wolf")).toBe("big_bad_wolf")
  })

  test("keeps dashes inside the name but trims edge separators", () => {
    expect(normalizeSoundEffectName("--wow-zers__")).toBe("wow-zers")
    expect(normalizeSoundEffectName("_-_x-_-")).toBe("x")
  })

  test("drops non-ASCII letters", () => {
    expect(normalizeSoundEffectName("Café 😀 sound.mp3")).toBe("caf_sound_mp3")
    expect(normalizeSoundEffectName("😀😀")).toBe("")
  })

  test("produces names usable as sound tokens", () => {
    for (const input of ["Air Horn", "a(b)c", "x y z", "Ünïcode"]) {
      const name = normalizeSoundEffectName(input)
      expect(name).toMatch(/^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$/)
    }
  })
})

describe("uniqueSoundEffectName", () => {
  test("returns the normalized name when it is free", () => {
    expect(uniqueSoundEffectName("Air Horn", ["boom"])).toBe("air_horn")
  })

  test("appends the first free numeric suffix", () => {
    expect(
      uniqueSoundEffectName("air horn", [
        "air_horn",
        "air_horn_2",
        "air_horn_4",
      ])
    ).toBe("air_horn_3")
  })

  test("falls back to 'sound' for names with no valid characters", () => {
    expect(uniqueSoundEffectName("!!!", [])).toBe("sound")
    expect(uniqueSoundEffectName("😀", new Set(["sound"]))).toBe("sound_2")
  })
})
