import assert from "node:assert/strict";
import { XMLValidator } from "fast-xml-parser";

export function assertWellFormedXml(xml) {
  const result = XMLValidator.validate(xml);
  assert.ok(result === true, result === true ? "" : `Malformed XML: ${result.err.msg} (line ${result.err.line})`);
}
