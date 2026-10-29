import { describe, expect, it } from "vitest";

import {
  DEFAULT_MASCOT_BODY,
  MASCOT_BODIES,
  MASCOT_BODY_IDS,
  botMascotBody,
  mascotBodySchema,
} from "../../shared/mascot-bodies.ts";

describe("the generated catalog", () => {
  it("carries all fifteen bodies", () => {
    expect(MASCOT_BODY_IDS).toHaveLength(15);
    for (const id of MASCOT_BODY_IDS) expect(MASCOT_BODIES[id].id).toBe(id);
  });

  it("defaults to the ASTER Mochi blob", () => {
    expect(DEFAULT_MASCOT_BODY).toBe("mochi");
  });

  it("gives every body the markup the renderer expects", () => {
    for (const id of MASCOT_BODY_IDS) {
      const entry = MASCOT_BODIES[id];
      expect(entry.body, id).toContain('fill="{{GRADIENT}}"');
      expect(entry.clip, id).not.toContain("fill=");
      expect(entry.fit, id).toMatch(/^translate\(/);
      expect(entry.name.length, id).toBeGreaterThan(0);
    }
  });

  it("places every face inside its body", () => {
    for (const id of MASCOT_BODY_IDS) {
      const { anchor } = MASCOT_BODIES[id];
      expect(anchor.scale, id).toBeGreaterThan(0);
      expect(anchor.scale, id).toBeLessThanOrEqual(1);
      expect(anchor.x, id).toBeGreaterThan(0);
      expect(anchor.y, id).toBeGreaterThan(0);
    }
  });

  it("clamps every face to one shared size", () => {
    const scales = new Set(MASCOT_BODY_IDS.map(id => MASCOT_BODIES[id].anchor.scale));
    expect([...scales]).toHaveLength(1);
  });
});

describe("botMascotBody", () => {
  it("accepts a known id", () => {
    expect(botMascotBody("blob")).toBe("blob");
  });

  it("falls back to the default Mochi for anything else", () => {
    expect(botMascotBody("hexagram")).toBe("mochi");
    expect(botMascotBody(undefined)).toBe("mochi");
    expect(botMascotBody(null)).toBe("mochi");
    expect(botMascotBody(42)).toBe("mochi");
    expect(botMascotBody("cursor")).toBe("cursor");
  });

  it("exposes a schema that rejects an unknown id", () => {
    expect(mascotBodySchema.safeParse("star").success).toBe(true);
    expect(mascotBodySchema.safeParse("nope").success).toBe(false);
  });
});
