import { ContentSanitizer, SanitizationResult, SanitizationRule } from './types';

export class MessageSanitizer implements ContentSanitizer {
  private rules: SanitizationRule[] = [
    {
      name: 'trim-whitespace',
      sanitize: (content) => content.trim(),
      description: 'Remove leading and trailing whitespace'
    },
    {
      name: 'normalize-whitespace',
      sanitize: (content) => content.replace(/\s+/g, ' '),
      description: 'Normalize multiple whitespace characters'
    },
    {
      name: 'remove-control-chars',
      sanitize: (content) => content.replace(/[\x00-\x1F\x7F]/g, ''),
      description: 'Remove control characters'
    },
    {
      name: 'normalize-line-endings',
      sanitize: (content) => content.replace(/\r\n?/g, '\n'),
      description: 'Normalize line endings to \\n'
    },
    {
      name: 'escape-html',
      sanitize: (content) => 
        content
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;'),
      description: 'Escape HTML special characters'
    }
  ];

  constructor(additionalRules: SanitizationRule[] = []) {
    this.rules = [...this.rules, ...additionalRules];
  }

  sanitize(content: string): SanitizationResult {
    const modifications: string[] = [];
    let wasModified = false;
    let sanitized = content;

    for (const rule of this.rules) {
      const result = rule.sanitize(sanitized);
      if (result !== sanitized) {
        wasModified = true;
        modifications.push(rule.name);
        sanitized = result;
      }
    }

    return {
      content: sanitized,
      wasModified,
      modifications: wasModified ? modifications : undefined
    };
  }
} 