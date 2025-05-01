/**
 * @fileoverview Detects raw text outside of Text component
 * @author Alex Zhukov
 * @author Prithpal Sooriya
 */

'use strict';

// eslint-disable-next-line import/no-unresolved
const { ESLintUtils } = require('@typescript-eslint/utils');

const elementName = (node) => {
  const reversedIdentifiers = [];
  if (
    node.type === 'JSXElement'
    && node.openingElement.type === 'JSXOpeningElement'
  ) {
    let object = node.openingElement.name;
    while (object.type === 'JSXMemberExpression') {
      if (object.property.type === 'JSXIdentifier') {
        reversedIdentifiers.push(object.property.name);
      }
      object = object.object;
    }

    if (object.type === 'JSXIdentifier') {
      reversedIdentifiers.push(object.name);
    }
  }

  return reversedIdentifiers.reverse().join('.');
};

const hasAllowedParent = (parent, allowedElements) => {
  let curNode = parent;

  while (curNode) {
    if (curNode.type === 'JSXElement') {
      const name = elementName(curNode);
      if (allowedElements.includes(name)) {
        return true;
      }
    }
    curNode = curNode.parent;
  }

  return false;
};

const getTSLinting = (context) => {
  try {
    /** @type {ReturnType<typeof ESLintUtils.getParserServices>} */
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();
    const isNumberType = (type) => {
      if (checker.typeToString(type) === 'number') {
        return true;
      }

      if (type.isUnion()) {
        return type.types.some(
          (subType) => checker.typeToString(subType) === 'number'
        );
      }

      return false;
    };
    return {
      services,
      checker,
      isNumberType,
    };
  } catch (_e) {
    return null;
  }
};

function create(context) {
  const options = context.options[0] || {};

  const tsLinting = getTSLinting(context);

  const report = (node) => {
    const errorValue = node.type === 'TemplateLiteral'
      ? `TemplateLiteral: ${node.expressions[0].name}`
      : node.value.trim();

    const formattedErrorValue = errorValue.length > 0 ? `Raw text (${errorValue})` : 'Whitespace(s)';

    context.report({
      node,
      message: `${formattedErrorValue} cannot be used outside of a <Text> tag`,
    });
  };

  const skippedElements = options.skip ? options.skip : [];
  const allowedElements = [
    'Text',
    'TSpan',
    'StyledText',
    'Animated.Text',
  ].concat(skippedElements);

  const hasOnlyLineBreak = (value) => /^[\r\n\t\f\v]+$/.test(value.replace(/ /g, ''));

  const getValidation = (node) => !hasAllowedParent(node.parent, allowedElements);

  return {
    Literal(node) {
      const parentType = node.parent.type;
      const onlyFor = ['JSXExpressionContainer', 'JSXElement'];
      if (
        typeof node.value !== 'string'
        || hasOnlyLineBreak(node.value)
        || !onlyFor.includes(parentType)
        || (node.parent.parent && node.parent.parent.type === 'JSXAttribute')
      ) return;

      const isStringLiteral = parentType === 'JSXExpressionContainer';
      if (getValidation(isStringLiteral ? node.parent : node)) {
        report(node);
      }
    },

    JSXText(node) {
      if (typeof node.value !== 'string' || hasOnlyLineBreak(node.value)) return;
      if (getValidation(node)) {
        report(node);
      }
    },

    TemplateLiteral(node) {
      if (
        node.parent.type !== 'JSXExpressionContainer'
        || (node.parent.parent && node.parent.parent.type === 'JSXAttribute')
      ) return;

      if (getValidation(node.parent)) {
        report(node);
      }
    },

    LogicalExpression(node) {
      if (
        node.parent.type !== 'JSXExpressionContainer'
        || (node.parent.parent && node.parent.parent.type === 'JSXAttribute')
      ) return;

      // Number Literal Checks (e.g. 0 && <Component />)
      if (node.left.type === 'Literal' && typeof node.left.value === 'number') {
        context.report({
          node: node.left,
          message: `Numeric literal (${node.left.value}) cannot be used outside of a <Text> tag`,
        });
        return;
      }

      // Number Variable Checks (e.g. myNumber && <Component />)
      if (tsLinting) {
        if (node.left.type === 'Identifier' || node.left.type === 'MemberExpression') {
          if (tsLinting.isNumberType(tsLinting.services)) {
            context.report({
              node: node.left,
              message: 'Number property cannot be used outside of a <Text> tag',
            });
          }
        }
      }
    },
  };
}

export default {
  meta: {
    schema: [
      {
        type: 'object',
        properties: {
          skip: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
        },
        additionalProperties: false,
      },
    ],
  },
  create,
};
