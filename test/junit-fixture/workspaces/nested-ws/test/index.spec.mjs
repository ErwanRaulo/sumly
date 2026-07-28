import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("outer suite", () => {
  it("passes at the top level", () => {
    assert.equal(1 + 1, 2);
  });

  describe("inner suite", () => {
    it("passes inside the nested describe", () => {
      assert.equal(2 + 2, 4);
    });
  });
});
