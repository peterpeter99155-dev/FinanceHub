const { execFileSync } = require('node:child_process');
const { readdirSync, readFileSync, statSync } = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const projectRoot = path.resolve(__dirname, '..');
const rendererRoot = path.join(projectRoot, 'src', 'renderer');
const infrastructureRoot = path.join(
  projectRoot,
  'src',
  'infrastructure',
);
const MAX_TSX_LINES = 300;
const MAX_COMPONENT_USE_STATE = 8;
const WARN_CHANGED_FILES = 25;
const WARN_CHANGED_LINES = 1500;
const FORBIDDEN_DOMAIN_FUNCTION = /^(assert|calculate|compute|validate|apply|reverse|sum|transactionCashFlow|create.*ValidationOptions)/;

const errors = [];
const warnings = [];

checkRendererFiles();
checkInfrastructureImports();
checkDiff();

if (warnings.length > 0) {
  process.stdout.write(
    `${warnings.map((warning) => `WARN ${warning}`).join('\n')}\n`,
  );
}

if (errors.length > 0) {
  process.stderr.write(
    `${errors.map((error) => `ERROR ${error}`).join('\n')}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    [
      'Architecture verification passed.',
      `TSX line limit: <= ${MAX_TSX_LINES}`,
      `Component useState limit: <= ${MAX_COMPONENT_USE_STATE}`,
      'Focus scheduling with setTimeout: 0',
      'Infrastructure domain validation/calculation imports: 0',
      '',
    ].join('\n'),
  );
}

function checkRendererFiles() {
  for (const filePath of filesUnder(rendererRoot, '.tsx')) {
    const sourceText = readFileSync(filePath, 'utf8');
    const relativePath = relative(filePath);
    const lineCount = sourceText.split(/\r?\n/).length;
    if (lineCount > MAX_TSX_LINES) {
      errors.push(
        `${relativePath} has ${lineCount} lines; maximum is ${MAX_TSX_LINES}.`,
      );
    }

    const sourceFile = ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    for (const component of topLevelComponents(sourceFile)) {
      const count = countUseStateCalls(component.node);
      if (count > MAX_COMPONENT_USE_STATE) {
        errors.push(
          `${relativePath}:${component.line} component ${component.name} ` +
            `uses useState ${count} times; maximum is ` +
            `${MAX_COMPONENT_USE_STATE}.`,
        );
      }
    }
    checkFocusTimeouts(sourceFile, relativePath);
  }
}

function checkInfrastructureImports() {
  for (const filePath of filesUnder(infrastructureRoot, '.ts')) {
    const sourceText = readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    for (const statement of sourceFile.statements) {
      if (
        !ts.isImportDeclaration(statement) ||
        !ts.isStringLiteral(statement.moduleSpecifier) ||
        !statement.moduleSpecifier.text.includes('/domain/')
      ) {
        continue;
      }

      const bindings = statement.importClause?.namedBindings;
      if (!bindings || !ts.isNamedImports(bindings)) {
        continue;
      }
      for (const element of bindings.elements) {
        const importedName = element.propertyName?.text ?? element.name.text;
        if (
          !element.isTypeOnly &&
          FORBIDDEN_DOMAIN_FUNCTION.test(importedName)
        ) {
          const line =
            sourceFile.getLineAndCharacterOfPosition(element.getStart())
              .line + 1;
          errors.push(
            `${relative(filePath)}:${line} imports forbidden domain ` +
              `validation/calculation function ${importedName}.`,
          );
        }
      }
    }
  }
}

function checkDiff() {
  const base = diffBase();
  const normal = diffSummary(base, []);
  const ignoreWhitespace = diffSummary(base, ['-w']);
  const ignoreEndOfLine = diffSummary(base, ['--ignore-space-at-eol']);

  const whitespaceOnly = difference(normal.files, ignoreWhitespace.files);
  const endOfLineOnly = difference(normal.files, ignoreEndOfLine.files);

  if (endOfLineOnly.length > 0) {
    warnings.push(
      `line-ending-only false differences: ${endOfLineOnly.join(', ')}`,
    );
  }
  const otherWhitespaceOnly = whitespaceOnly.filter(
    (file) => !endOfLineOnly.includes(file),
  );
  if (otherWhitespaceOnly.length > 0) {
    warnings.push(
      `whitespace-only differences: ${otherWhitespaceOnly.join(', ')}`,
    );
  }

  if (normal.files.length > WARN_CHANGED_FILES) {
    warnings.push(
      `changed file count is ${normal.files.length}; warning threshold is ` +
        `${WARN_CHANGED_FILES}.`,
    );
  }
  if (normal.changedLines > WARN_CHANGED_LINES) {
    warnings.push(
      `changed line count is ${normal.changedLines}; warning threshold is ` +
        `${WARN_CHANGED_LINES}.`,
    );
  }

  process.stdout.write(
    [
      `Diff base: ${base.label}`,
      `git diff: ${normal.files.length} files, ` +
        `${normal.added} additions, ${normal.deleted} deletions`,
      `git diff -w: ${ignoreWhitespace.files.length} files, ` +
        `${ignoreWhitespace.added} additions, ` +
        `${ignoreWhitespace.deleted} deletions`,
      `Line-ending-only false differences: ${endOfLineOnly.length}`,
      `Other whitespace-only differences: ${otherWhitespaceOnly.length}`,
      '',
    ].join('\n'),
  );
}

function topLevelComponents(sourceFile) {
  const components = [];
  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      isComponentName(statement.name.text)
    ) {
      components.push(componentInfo(sourceFile, statement.name.text, statement));
      continue;
    }
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        isComponentName(declaration.name.text) &&
        declaration.initializer &&
        (ts.isArrowFunction(declaration.initializer) ||
          ts.isFunctionExpression(declaration.initializer))
      ) {
        components.push(
          componentInfo(
            sourceFile,
            declaration.name.text,
            declaration.initializer,
          ),
        );
      }
    }
  }
  return components;
}

function componentInfo(sourceFile, name, node) {
  return {
    name,
    node,
    line:
      sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
  };
}

function countUseStateCalls(node) {
  let count = 0;
  visit(node);
  return count;

  function visit(current) {
    if (
      ts.isCallExpression(current) &&
      ((ts.isIdentifier(current.expression) &&
        current.expression.text === 'useState') ||
        (ts.isPropertyAccessExpression(current.expression) &&
          current.expression.name.text === 'useState'))
    ) {
      count += 1;
    }
    ts.forEachChild(current, visit);
  }
}

function checkFocusTimeouts(sourceFile, relativePath) {
  visit(sourceFile);

  function visit(node) {
    if (ts.isCallExpression(node) && isSetTimeout(node.expression)) {
      const callback = node.arguments[0];
      if (callback && /\bfocus(?:[A-Z]|\s*\()|\.focus\s*\(/i.test(
        callback.getText(sourceFile),
      )) {
        const line =
          sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        errors.push(
          `${relativePath}:${line} uses setTimeout to coordinate focus.`,
        );
      }
    }
    ts.forEachChild(node, visit);
  }
}

function isSetTimeout(expression) {
  return (
    (ts.isIdentifier(expression) && expression.text === 'setTimeout') ||
    (ts.isPropertyAccessExpression(expression) &&
      expression.name.text === 'setTimeout')
  );
}

function isComponentName(name) {
  return /^[A-Z]/.test(name);
}

function filesUnder(directory, extension) {
  const results = [];
  for (const entry of readdirSync(directory)) {
    const filePath = path.join(directory, entry);
    if (statSync(filePath).isDirectory()) {
      results.push(...filesUnder(filePath, extension));
    } else if (filePath.endsWith(extension)) {
      results.push(filePath);
    }
  }
  return results;
}

function diffBase() {
  const configured = process.env.VERIFY_BASE;
  if (configured) {
    return { args: [configured], label: configured };
  }
  try {
    const mergeBase = git(['merge-base', 'HEAD', 'main']).trim();
    return { args: [mergeBase], label: `${mergeBase} (merge-base main)` };
  } catch {
    return { args: ['HEAD'], label: 'HEAD' };
  }
}

function diffSummary(base, options) {
  const args = [
    'diff',
    ...options,
    '--numstat',
    ...base.args,
    '--',
  ];
  const output = git(args);
  let added = 0;
  let deleted = 0;
  const files = [];
  for (const line of output.split(/\r?\n/)) {
    if (!line) {
      continue;
    }
    const [addedText, deletedText, file] = line.split('\t');
    files.push(file);
    if (addedText !== '-') {
      added += Number(addedText);
    }
    if (deletedText !== '-') {
      deleted += Number(deletedText);
    }
  }
  return {
    added,
    deleted,
    changedLines: added + deleted,
    files,
  };
}

function git(args) {
  return execFileSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function difference(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

function relative(filePath) {
  return path.relative(projectRoot, filePath).replaceAll('\\', '/');
}
