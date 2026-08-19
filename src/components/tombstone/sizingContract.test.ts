/**
 * Directory-wide guard for the tombstone sizing contract
 * (`docs/TOMBSTONE_SIZING_CONTRACT.md`): every dimension under
 * `src/components/tombstone/` scales by the viewport's short edge via
 * `designPx` (vmin), never by a viewport axis (`vw`/`vh`) or by an ancestor's
 * width (`%`).
 *
 * `TombstoneOverlay.test.tsx` asserts the same thing about one component's
 * *rendered* style. This scans the *source*, so the rule also covers styles
 * that test never renders — a new component in the directory, a branch behind
 * a prop, a value only some mode reaches. A hand-written `maxWidth: '60%'`
 * living among designPx values is exactly how the portrait wrap bug shipped
 * twice (030872c, then #283 → #286).
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const TOMBSTONE_DIR = path.join(process.cwd(), 'src/components/tombstone');

/**
 * Properties whose value is a *size*. A percentage here resolves against an
 * ancestor's box, which is the long axis in one orientation and the short one
 * in the other — the bug. Position offsets (`top`/`left`/…) and `transform`
 * are deliberately absent: a percentage there places rather than sizes, and
 * the toast's `left: '50%'` + `translateX(-50%)` centres correctly either way
 * up. Viewport-axis units are still banned everywhere, including those.
 */
const DIMENSION_PROPERTIES = new Set([
  'width',
  'minWidth',
  'maxWidth',
  'height',
  'minHeight',
  'maxHeight',
  'inset',
  'flexBasis',
  'fontSize',
  'lineHeight',
  'letterSpacing',
  'gap',
  'rowGap',
  'columnGap',
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'borderRadius',
  'borderWidth',
  'boxShadow',
]);

/**
 * Percentages that carry no scale of their own: "collapse" and "fill the
 * parent". The parent is already vmin-sized, so these stay correct in both
 * orientations — the timer bar's track and depleting fill need them.
 */
const SCALE_FREE_PERCENTAGES = new Set(['0', '100']);

/**
 * Conscious exceptions, keyed `file:property:value` so that *changing* an
 * allowed value fails the scan and has to be argued again. The toast's cap is
 * inert: its fixed confirmation strings are `nowrap` and never reach it.
 */
const ALLOWED = new Set(['TombstoneToast.tsx:maxWidth:80%']);

const VIEWPORT_AXIS_UNIT = /-?\d+(?:\.\d+)?(vw|vh)\b/;
const PERCENTAGE = /-?\d+(?:\.\d+)?%/g;

interface Violation {
  file: string;
  line: number;
  property: string;
  value: string;
  reason: string;
}

function propertyName(name: ts.PropertyName): string | null {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;
}

/**
 * String content reachable from a property's value, including the literal
 * chunks of a template. Nested object literals are left alone: their own
 * property assignments are visited separately, under their own names.
 */
function literalParts(initializer: ts.Node): string[] {
  const parts: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      return;
    }
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      parts.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(initializer);
  return parts;
}

function offendingPercentage(property: string, value: string): string | null {
  if (!DIMENSION_PROPERTIES.has(property)) {
    return null;
  }
  const found = value.match(PERCENTAGE);
  if (found === null) {
    return null;
  }
  // Compare on the bare number so '0%'/'100%' pass wherever they appear.
  return (
    found.find(token => !SCALE_FREE_PERCENTAGES.has(token.slice(0, -1))) ?? null
  );
}

function checkValue(property: string, value: string): string | null {
  const axis = VIEWPORT_AXIS_UNIT.exec(value);
  if (axis) {
    return `${axis[0]} binds to a viewport axis; use designPx() so the value scales by the short edge`;
  }
  const percentage = offendingPercentage(property, value);
  if (percentage) {
    return `${percentage} sizes against an ancestor box, which is the long axis in one orientation; use designPx()`;
  }
  return null;
}

/** Every sizing violation in one file's source text. */
export function findSizingViolations(
  file: string,
  source: string
): Violation[] {
  const parsed = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const violations: Violation[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node)) {
      const property = propertyName(node.name);
      if (property !== null) {
        for (const value of literalParts(node.initializer)) {
          const reason = checkValue(property, value);
          if (reason !== null && !ALLOWED.has(`${file}:${property}:${value}`)) {
            const { line } = parsed.getLineAndCharacterOfPosition(
              node.getStart(parsed)
            );
            violations.push({
              file,
              line: line + 1,
              property,
              value,
              reason,
            });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(parsed, visit);
  return violations;
}

function tombstoneSourceFiles(): string[] {
  return fs
    .readdirSync(TOMBSTONE_DIR)
    .filter(name => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
    .sort();
}

function format(violation: Violation): string {
  return `${violation.file}:${String(violation.line)} ${violation.property}: '${violation.value}' — ${violation.reason}`;
}

const RULE =
  'Tombstone dimensions scale by the viewport short edge (vmin) via designPx(). ' +
  'FF1 rotation is display-level, so a portrait wall reports a 1080x1920 viewport ' +
  'where vh/vw/% bind to the wrong axis and metadata wraps early. ' +
  'See docs/TOMBSTONE_SIZING_CONTRACT.md.';

describe('tombstone sizing contract', () => {
  it('sizes every dimension in the directory with designPx', () => {
    const files = tombstoneSourceFiles();
    // Fail loudly rather than passing vacuously if the directory moves.
    expect(files).toContain('TombstoneOverlay.tsx');

    const violations = files.flatMap(file =>
      findSizingViolations(
        file,
        fs.readFileSync(path.join(TOMBSTONE_DIR, file), 'utf8')
      )
    );
    expect(violations.map(format), RULE).toEqual([]);
  });

  it('flags the percentage and viewport-axis dimensions that caused the bug', () => {
    const source = `
      const style = {
        maxWidth: '60%',
        width: '50vw',
        height: '80vh',
        fontSize: 'calc(2vh + 1px)',
      };
    `;
    expect(
      findSizingViolations('Bad.tsx', source).map(v => v.property)
    ).toEqual(['maxWidth', 'width', 'height', 'fontSize']);
  });

  it('allows designPx values, fill-parent percentages, and placement', () => {
    const source = `
      const style = {
        fontSize: designPx(16),
        padding: \`\${designPx(12)} \${designPx(16)}\`,
        height: \`max(1px, \${designPx(1)})\`,
        width: depleting ? '0%' : '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        opacity: 0.5,
        transition: 'opacity 300ms ease',
        backgroundColor: 'rgba(0, 0, 0, 0.32)',
      };
    `;
    expect(findSizingViolations('Ok.tsx', source)).toEqual([]);
  });

  it('holds the toast exception to its exact value', () => {
    const allowed = "const s = { maxWidth: '80%' };";
    const changed = "const s = { maxWidth: '70%' };";
    expect(findSizingViolations('TombstoneToast.tsx', allowed)).toEqual([]);
    expect(findSizingViolations('TombstoneToast.tsx', changed)).toHaveLength(1);
    // The exception is per-file: the same cap on the label is still a bug.
    expect(findSizingViolations('TombstoneOverlay.tsx', allowed)).toHaveLength(
      1
    );
  });
});
