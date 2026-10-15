import { describe, expect, it } from "vitest";
import { shouldRecordModelIO } from "../src/model/runner-debug.js";

describe("shouldRecordModelIO", () => {
  it("returns false when ZCODE_DISABLE_MODEL_IO_RECORD=1", () => {
    expect(shouldRecordModelIO({ ZCODE_DISABLE_MODEL_IO_RECORD: "1" })).toBe(false);
    expect(
      shouldRecordModelIO({
        ZCODE_DISABLE_MODEL_IO_RECORD: "1",
        ZCODE_RUNTIME_ENV: "development",
      }),
    ).toBe(false);
  });

  it("still respects ZCODE_RUNTIME_ENV=test when the disable flag is absent", () => {
    expect(shouldRecordModelIO({ ZCODE_RUNTIME_ENV: "test" })).toBe(false);
    expect(shouldRecordModelIO({ ZCODE_RUNTIME_ENV: "development" })).toBe(true);
    expect(shouldRecordModelIO({})).toBe(true);
  });
});
