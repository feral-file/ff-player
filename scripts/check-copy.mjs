#!/usr/bin/env node
/*
 * check-copy.js — user-facing copy lint for ff-player.
 *
 * Fails the build when banned spellings appear in copy the kiosk renders.
 * Approved terms and rationale live in Canon: reference/voice/product-copy.md
 * (mirrors ff-cli scripts/check-copy.js; extend both word lists together).
 *
 * Scope: a string is user-facing here only when JSX renders it, so the check
 * inspects JSX text nodes and string/template literals that sit inside JSX.
 * Plain literals elsewhere — the WIFI: QR payload, CDP contract states,
 * logger calls, route/config keys — legitimately contain these tokens and
 * are never shown to a person, so they are skipped, as are comments.
 */
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src');

// Boundaries exclude identifiers (frameName, qrFrame, connectedWifi) and the
// correct forms (Wi-Fi, DP-1). FF1/FFP are case-sensitive so the ff1.config
// portal address and _ff1._tcp service names never trip it. "frame" is a
// repo-local rule (not in the Canon table): on this surface it always means
// the product, and the product is the Art Computer.
const BANNED = [
  { re: /(?<![A-Za-z0-9_-])WiFi(?![A-Za-z0-9_-])/, fix: 'Wi-Fi' },
  { re: /(?<![A-Za-z0-9_-])Wifi(?![A-Za-z0-9_-])/, fix: 'Wi-Fi' },
  { re: /(?<![A-Za-z0-9_-])wifi(?![A-Za-z0-9_-])/, fix: 'Wi-Fi' },
  { re: /(?<![A-Za-z0-9_-])DP1(?![A-Za-z0-9_-])/, fix: 'DP-1' },
  { re: /(?<![A-Za-z0-9_-])FF1(?![A-Za-z0-9_-])/, fix: 'Art Computer' },
  { re: /(?<![A-Za-z0-9_-])FFP(?![A-Za-z0-9_-])/, fix: 'Art Panel' },
  { re: /Device (?:Id|iD|id)(?![A-Za-z])/, fix: 'Device ID' },
  { re: /(?<![A-Za-z0-9_-])Feralfile(?![A-Za-z0-9_-])/, fix: 'Feral File' },
  { re: /(?<![A-Za-z0-9_-])[Ff]rames?(?![A-Za-z0-9_-])/, fix: 'Art Computer' },
];

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (/\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)) {
      out.push(full);
    }
  }
}

// A literal is rendered copy when any ancestor is JSX (element body,
// expression container, or attribute value).
function insideJsx(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (
      ts.isJsxElement(p) ||
      ts.isJsxSelfClosingElement(p) ||
      ts.isJsxFragment(p) ||
      ts.isJsxExpression(p) ||
      ts.isJsxAttribute(p)
    ) {
      return true;
    }
  }
  return false;
}

const files = [];
if (fs.existsSync(SRC)) {
  walk(SRC, files);
}

let violations = 0;

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );

  const report = (node, value) => {
    for (const { re, fix } of BANNED) {
      if (re.test(value)) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        const rel = path.relative(ROOT, file);
        console.log(`  ${rel}:${line + 1}: "${value.trim()}"`);
        console.log(`    -> use: ${fix}`);
        violations++;
      }
    }
  };

  const visit = (node) => {
    if (ts.isJsxText(node)) {
      report(node, node.text);
    } else if (
      (ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node)) &&
      insideJsx(node)
    ) {
      report(node, node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

if (violations > 0) {
  console.log(`\ncheck-copy: found ${violations} user-facing copy issue(s).`);
  console.log(
    'See reference/voice/product-copy.md (Canon) for the approved terms.'
  );
  process.exit(1);
}
console.log(`check-copy: user-facing copy OK (${files.length} file(s) scanned).`);
