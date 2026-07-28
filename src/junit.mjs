const XML_BLOCK = /<testsuite\b[^>]*>|<\/testsuite>|<testcase\b[^>]*\/>|<testcase\b[^>]*>[\s\S]*?<\/testcase>/g;
const TESTSUITE_NAME_ATTR = /(<testsuite\b[^>]*\sname=")([^"]*)(")/;
const COMMENT = /<!--[\s\S]*?-->/g;

export function escapeXmlAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// describe() blocks can nest, and node:test's own junit reporter mirrors that by nesting
// <testsuite> inside <testsuite>; a flat top-level test() instead produces a bare <testcase>
// directly under <testsuites>, with no enclosing suite at all (called orphanTestcases).
function scanWorkspaceXml(xml) {
  const suiteRanges = [];
  const orphanTestcases = [];
  let depth = 0;
  let blockStart = null;
  let match;

  XML_BLOCK.lastIndex = 0;
  while ((match = XML_BLOCK.exec(xml)) !== null) {
    const token = match[0];

    if (token === "</testsuite>") {
      if (depth === 0) {
        continue; // stray closing tag with no matching open; ignore defensively.
      }
      depth -= 1;
      if (depth === 0) {
        suiteRanges.push({ start: blockStart, end: match.index + token.length });
      }
      continue;
    }

    if (token.startsWith("<testsuite")) {
      if (depth === 0) {
        blockStart = match.index;
      }
      depth += 1;
      continue;
    }

    // otherwise token is a <testcase> block (self-closing or with a <failure> child).
    if (depth === 0) {
      orphanTestcases.push(token);
    }
  }

  return { suiteRanges, orphanTestcases };
}

export function extractTestsuites(xml, ranges = scanWorkspaceXml(xml).suiteRanges) {
  return ranges.map(({ start, end }) => xml.slice(start, end));
}

export function prefixTestsuiteName(block, prefix) {
  if (!TESTSUITE_NAME_ATTR.test(block)) {
    return block;
  }

  return block.replace(TESTSUITE_NAME_ATTR, (_match, open, name, close) => `${open}${escapeXmlAttr(prefix)} › ${name}${close}`);
}

export function buildJunitReport(workspaces) {
  const suites = workspaces.flatMap(({ name, xml }) => {
    const cleaned = xml.replace(COMMENT, "");
    const { suiteRanges, orphanTestcases } = scanWorkspaceXml(cleaned);
    const namedSuites = extractTestsuites(cleaned, suiteRanges).map((block) => prefixTestsuiteName(block, name));

    if (orphanTestcases.length === 0) {
      return namedSuites;
    }

    return [...namedSuites, `<testsuite name="${escapeXmlAttr(name)}">\n${orphanTestcases.join("\n")}\n</testsuite>`];
  });

  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites>\n${suites.join("\n")}\n</testsuites>\n`;
}
