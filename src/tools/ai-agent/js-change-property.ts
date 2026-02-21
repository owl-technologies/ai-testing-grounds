import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { ToolDefinition, ToolDescriptor, ToolExecutionContext } from './types';

const descriptor: ToolDescriptor = {
  type: 'function',
  function: {
    name: 'js-change-property',
    description: 'Replace a function or property in a JS/JSCAD file. Use target like MyClass.constructor to update a class constructor. Use target "file" to replace the entire file (useful for empty files).',
    parameters: {
      type: 'object',
      required: ['filePath', 'target', 'replacement', 'replaceBodyOnly'],
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the .js or .jscad file to edit.',
        },
        target: {
          type: 'string',
          description: 'Function or property to replace (e.g., main, MyClass.constructor, exports.main).',
        },
        replacement: {
          type: 'string',
          description: 'Replacement code for the target. For class methods, provide either the full member or just the body statements.',
        },
        replaceBodyOnly: {
          type: 'boolean',
          description: 'Set true to replace only the function/method body, keeping the existing signature. Set false to replace the full node.',
        },
      },
    },
  },
};

type Match =
  | { kind: 'functionDeclaration'; node: ts.FunctionDeclaration }
  | { kind: 'variableInitializer'; node: ts.VariableDeclaration }
  | { kind: 'classMember'; node: ts.ClassElement }
  | { kind: 'objectLiteralProperty'; node: ts.ObjectLiteralElementLike }
  | { kind: 'propertyAssignment'; node: ts.BinaryExpression };

const run = async (args: Record<string, unknown>, _context: ToolExecutionContext): Promise<string> => {
  const filePath = typeof args.filePath === 'string' ? args.filePath.trim() : '';
  const target = typeof args.target === 'string' ? args.target.trim() : '';
  const replacement = typeof args.replacement === 'string' ? args.replacement : '';
  const replaceBodyOnly = typeof args.replaceBodyOnly === 'boolean' ? args.replaceBodyOnly : undefined;

  if (!filePath) {
    return JSON.stringify({ ok: false, error: 'Invalid tool input: "filePath" must be a non-empty string.' });
  }
  if (!target) {
    return JSON.stringify({ ok: false, error: 'Invalid tool input: "target" must be a non-empty string.' });
  }
  if (!replacement.trim()) {
    return JSON.stringify({ ok: false, error: 'Invalid tool input: "replacement" must be a non-empty string.' });
  }

  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    return JSON.stringify({ ok: false, error: `File not found: ${resolvedPath}` });
  }

  const ext = path.extname(resolvedPath).toLowerCase();
  const allowedExtensions = new Set(['.js', '.jscad', '.ts', '.mjs', '.cjs']);
  if (!allowedExtensions.has(ext)) {
    return JSON.stringify({ ok: false, error: `Unsupported file type: ${ext}` });
  }

  const source = fs.readFileSync(resolvedPath, 'utf-8');
  const targetParts = target.split('.').filter(Boolean);
  const trimmedReplacement = replacement.trim();

  if (targetParts.length === 0) {
    return JSON.stringify({ ok: false, error: 'Target must include a function or property name.' });
  }
  if (targetParts.length === 1 && targetParts[0] === 'file') {
    fs.writeFileSync(resolvedPath, trimmedReplacement, 'utf-8');
    return JSON.stringify({ ok: true, path: resolvedPath, target: targetParts[0] });
  }

  const scriptKind = ext === '.ts' ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const sourceFile = ts.createSourceFile(resolvedPath, source, ts.ScriptTarget.Latest, true, scriptKind);

  let match: Match | undefined;

  const visit = (node: ts.Node) => {
    if (match) {
      return;
    }

    if (targetParts.length >= 2 && ts.isClassDeclaration(node) && node.name?.text === targetParts[0]) {
      const memberName = targetParts[1];
      for (const member of node.members) {
        if (memberName === 'constructor' && ts.isConstructorDeclaration(member)) {
          match = { kind: 'classMember', node: member };
          return;
        }
        if (ts.isMethodDeclaration(member) || ts.isPropertyDeclaration(member) || ts.isGetAccessor(member) || ts.isSetAccessor(member)) {
          const memberId = member.name;
          if (memberId && ts.isIdentifier(memberId) && memberId.text === memberName) {
            match = { kind: 'classMember', node: member };
            return;
          }
        }
      }
    }

    if (targetParts.length === 1 && ts.isFunctionDeclaration(node) && node.name?.text === targetParts[0]) {
      match = { kind: 'functionDeclaration', node };
      return;
    }

    if (targetParts.length === 1 && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === targetParts[0]) {
      if (node.initializer) {
        match = { kind: 'variableInitializer', node };
        return;
      }
    }

    if (
      targetParts.length === 2 &&
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === targetParts[0] &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      const propName = targetParts[1];
      const property = node.initializer.properties.find((prop) => {
        if (ts.isPropertyAssignment(prop) || ts.isMethodDeclaration(prop) || ts.isGetAccessor(prop) || ts.isSetAccessor(prop)) {
          const name = prop.name;
          if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
            return name.text === propName;
          }
        }
        if (ts.isShorthandPropertyAssignment(prop)) {
          return prop.name.text === propName;
        }
        return false;
      });
      if (property) {
        match = { kind: 'objectLiteralProperty', node: property };
        return;
      }
    }

    if (targetParts.length >= 2 && ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const parts: string[] = [];
      let current: ts.Expression = node.left;
      while (ts.isPropertyAccessExpression(current)) {
        parts.unshift(current.name.text);
        current = current.expression;
      }
      if (ts.isIdentifier(current)) {
        parts.unshift(current.text);
        if (parts.length === targetParts.length && parts.every((part, index) => part === targetParts[index])) {
          match = { kind: 'propertyAssignment', node };
          return;
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  if (!match) {
    return JSON.stringify({ ok: false, error: `Target not found: ${target}` });
  }

  const looksLikeMember =
    trimmedReplacement.startsWith('constructor') ||
    /^async\s+[A-Za-z_$][\w$]*\s*\(/.test(trimmedReplacement) ||
    /^[A-Za-z_$][\w$]*\s*\(/.test(trimmedReplacement) ||
    /^get\s+[A-Za-z_$][\w$]*/.test(trimmedReplacement) ||
    /^set\s+[A-Za-z_$][\w$]*/.test(trimmedReplacement) ||
    /^function\b/.test(trimmedReplacement) ||
    /=>/.test(trimmedReplacement);
  const useBodyOnly =
    typeof replaceBodyOnly === 'boolean'
      ? replaceBodyOnly
      : !looksLikeMember || (trimmedReplacement.startsWith('{') && trimmedReplacement.endsWith('}'));

  let editStart = 0;
  let editEnd = 0;
  let editText = trimmedReplacement;

  if (match.kind === 'functionDeclaration') {
    editStart = match.node.getStart(sourceFile);
    editEnd = match.node.getEnd();
  } else if (match.kind === 'variableInitializer') {
    const initializer = match.node.initializer;
    if (!initializer) {
      return JSON.stringify({ ok: false, error: `Target ${target} has no initializer to replace.` });
    }
    editStart = initializer.getStart(sourceFile);
    editEnd = initializer.getEnd();
  } else if (match.kind === 'classMember') {
    if ((ts.isConstructorDeclaration(match.node) || ts.isMethodDeclaration(match.node) || ts.isGetAccessor(match.node) || ts.isSetAccessor(match.node)) && match.node.body && useBodyOnly) {
      editStart = match.node.body.getStart(sourceFile);
      editEnd = match.node.body.getEnd();
      if (!trimmedReplacement.startsWith('{') || !trimmedReplacement.endsWith('}')) {
        editText = `{
${trimmedReplacement}
}`;
      }
    } else if (useBodyOnly) {
      return JSON.stringify({ ok: false, error: `Target ${target} does not support body-only replacement.` });
    } else {
      editStart = match.node.getStart(sourceFile);
      editEnd = match.node.getEnd();
    }
  } else if (match.kind === 'objectLiteralProperty') {
    if (ts.isPropertyAssignment(match.node)) {
      editStart = match.node.initializer.getStart(sourceFile);
      editEnd = match.node.initializer.getEnd();
    } else if (ts.isMethodDeclaration(match.node) || ts.isGetAccessor(match.node) || ts.isSetAccessor(match.node)) {
      if (match.node.body && useBodyOnly) {
        editStart = match.node.body.getStart(sourceFile);
        editEnd = match.node.body.getEnd();
        if (!trimmedReplacement.startsWith('{') || !trimmedReplacement.endsWith('}')) {
          editText = `{
${trimmedReplacement}
}`;
        }
      } else if (useBodyOnly) {
        return JSON.stringify({ ok: false, error: `Target ${target} does not support body-only replacement.` });
      } else {
        editStart = match.node.getStart(sourceFile);
        editEnd = match.node.getEnd();
      }
    } else if (ts.isShorthandPropertyAssignment(match.node)) {
      return JSON.stringify({ ok: false, error: `Target ${target} is a shorthand property and cannot be replaced without an explicit value.` });
    } else {
      editStart = match.node.getStart(sourceFile);
      editEnd = match.node.getEnd();
    }
  } else if (match.kind === 'propertyAssignment') {
    editStart = match.node.right.getStart(sourceFile);
    editEnd = match.node.right.getEnd();
  }

  if (editEnd <= editStart) {
    return JSON.stringify({ ok: false, error: `Failed to compute replacement range for ${target}.` });
  }

  const nextSource = source.slice(0, editStart) + editText + source.slice(editEnd);
  fs.writeFileSync(resolvedPath, nextSource, 'utf-8');

  return JSON.stringify({ ok: true, path: resolvedPath, target });
};

export const jsChangePropertyTool: ToolDefinition = {
  descriptor,
  run,
};
