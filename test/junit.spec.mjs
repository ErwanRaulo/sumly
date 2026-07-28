import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { escapeXmlAttr, extractTestsuites, prefixTestsuiteName, buildJunitReport } from "../src/junit.mjs";
import { assertWellFormedXml } from "./xmlAssertions.mjs";

describe("escapeXmlAttr", () => {
  it("escapes the characters that are unsafe in an XML attribute value", () => {
    assert.equal(escapeXmlAttr(`a & b < c > d "e"`), "a &amp; b &lt; c &gt; d &quot;e&quot;");
  });

  it("coerces non-string input", () => {
    assert.equal(escapeXmlAttr(42), "42");
  });
});

describe("extractTestsuites", () => {
  it("extracts every <testsuite> block from a node:test junit report", () => {
    const xml = [
      "<?xml version=\"1.0\"?>",
      "<testsuites>",
      "<testsuite name=\"a\"><testcase name=\"t1\"/></testsuite>",
      "<testsuite name=\"b\"><testcase name=\"t2\"/></testsuite>",
      "</testsuites>"
    ].join("\n");

    const suites = extractTestsuites(xml);

    assert.equal(suites.length, 2);
    assert.match(suites[0], /name="a"/);
    assert.match(suites[1], /name="b"/);
  });

  it("does not mistake the outer <testsuites> wrapper for a <testsuite> block", () => {
    const xml = "<testsuites></testsuites>";

    assert.deepEqual(extractTestsuites(xml), []);
  });

  it("returns an empty array when there is no testsuite block at all", () => {
    assert.deepEqual(extractTestsuites("not xml"), []);
  });

  it("extracts the whole outer block when a <testsuite> nests another <testsuite> (nested describe blocks)", () => {
    const xml = [
      "<testsuites>",
      "<testsuite name=\"outer\">",
      "<testcase name=\"t1\"/>",
      "<testsuite name=\"inner\">",
      "<testcase name=\"t2\"/>",
      "</testsuite>",
      "</testsuite>",
      "<testsuite name=\"sibling\"><testcase name=\"t3\"/></testsuite>",
      "</testsuites>"
    ].join("\n");

    const suites = extractTestsuites(xml);

    assert.equal(suites.length, 2);
    assert.match(suites[0], /^<testsuite name="outer">[\s\S]*<testsuite name="inner">[\s\S]*<\/testsuite>\s*<\/testsuite>$/);
    assert.match(suites[1], /^<testsuite name="sibling">/);
  });
});

describe("prefixTestsuiteName", () => {
  it("prefixes the testsuite's name attribute, leaving the rest untouched", () => {
    const block = "<testsuite name=\"my suite\" time=\"1.2\"><testcase name=\"t\"/></testsuite>";

    const result = prefixTestsuiteName(block, "my-workspace");

    assert.equal(result, "<testsuite name=\"my-workspace › my suite\" time=\"1.2\"><testcase name=\"t\"/></testsuite>");
  });

  it("escapes special characters in the workspace prefix", () => {
    const block = "<testsuite name=\"suite\"></testsuite>";

    const result = prefixTestsuiteName(block, "a & b");

    assert.match(result, /name="a &amp; b › suite"/);
  });

  it("leaves the block untouched when it has no name attribute", () => {
    const block = "<testsuite time=\"1.2\"></testsuite>";

    assert.equal(prefixTestsuiteName(block, "workspace"), block);
  });
});

describe("buildJunitReport", () => {
  it("wraps every workspace's testsuites into a single <testsuites> document, prefixing each name", () => {
    const report = buildJunitReport([
      { name: "pass-ws", xml: "<testsuites><testsuite name=\"suite a\"><testcase name=\"t1\"/></testsuite></testsuites>" },
      { name: "fail-ws", xml: "<testsuites><testsuite name=\"suite b\"><testcase name=\"t2\"/></testsuite></testsuites>" }
    ]);

    assert.match(report, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(report, /<testsuites>[\s\S]*<\/testsuites>\s*$/);
    assert.match(report, /<testsuite name="pass-ws › suite a">/);
    assert.match(report, /<testsuite name="fail-ws › suite b">/);
    assertWellFormedXml(report);
  });

  it("keeps multiple testsuite blocks from the same workspace, all prefixed", () => {
    const report = buildJunitReport([
      {
        name: "utils",
        xml: "<testsuites><testsuite name=\"first\"></testsuite><testsuite name=\"second\"></testsuite></testsuites>"
      }
    ]);

    assert.match(report, /<testsuite name="utils › first">/);
    assert.match(report, /<testsuite name="utils › second">/);
    assertWellFormedXml(report);
  });

  it("produces an empty <testsuites> document when no workspace has usable output", () => {
    const report = buildJunitReport([]);

    assert.match(report, /<testsuites>\s*<\/testsuites>/);
    assertWellFormedXml(report);
  });

  it("wraps bare top-level <testcase> elements (no describe block) into a synthetic testsuite", () => {
    const xml = [
      "<?xml version=\"1.0\"?>",
      "<testsuites>",
      "<testcase name=\"adds numbers\" time=\"0.001\" classname=\"test\"/>",
      "<!-- tests 1 -->",
      "<!-- pass 1 -->",
      "</testsuites>"
    ].join("\n");

    const report = buildJunitReport([{ name: "pass-ws", xml }]);

    assert.match(report, /<testsuite name="pass-ws">/);
    assert.match(report, /<testcase name="adds numbers"/);
    assert.doesNotMatch(report, /tests 1/);
    assertWellFormedXml(report);
  });

  it("prefixes only the outer suite's name when suites are nested (nested describe blocks), keeping the document balanced", () => {
    const xml = [
      "<testsuites>",
      "<testsuite name=\"outer\">",
      "<testcase name=\"t1\"/>",
      "<testsuite name=\"inner\">",
      "<testcase name=\"t2\"/>",
      "</testsuite>",
      "</testsuite>",
      "</testsuites>"
    ].join("\n");

    const report = buildJunitReport([{ name: "utils", xml }]);

    assert.match(report, /<testsuite name="utils › outer">/);
    assert.match(report, /<testsuite name="inner">/);
    assert.equal((report.match(/<testsuite\b/g) ?? []).length, 2);
    assert.equal((report.match(/<\/testsuite>/g) ?? []).length, 2);
    assert.doesNotMatch(report, /<testsuite name="utils">/);
    assertWellFormedXml(report);
  });

  it("keeps a bare failing <testcase> (with its <failure> child) alongside any named suites", () => {
    const xml = [
      "<testsuites>",
      "<testcase name=\"breaks\" time=\"0.001\" classname=\"test\" failure=\"assertion\">",
      "<failure type=\"testCodeFailure\" message=\"assertion\">boom</failure>",
      "</testcase>",
      "</testsuites>"
    ].join("\n");

    const report = buildJunitReport([{ name: "fail-ws", xml }]);

    assert.match(report, /<testsuite name="fail-ws">/);
    assert.match(report, /<failure type="testCodeFailure" message="assertion">boom<\/failure>/);
    assertWellFormedXml(report);
  });
});
