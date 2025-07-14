import { ValidationError } from '../errors';
import { ContentValidator, ValidationResult, ValidationRule } from './types';

export class MessageValidator implements ContentValidator {
  private rules: ValidationRule[] = [
    {
      name: 'non-empty',
      validate: (content) => content.trim().length > 0,
      message: 'Message cannot be empty'
    },
    {
      name: 'max-length',
      validate: (content) => content.length <= 32000, // Arbitrary limit, adjust as needed
      message: 'Message exceeds maximum length'
    },
    {
      name: 'valid-utf8',
      validate: (content) => {
        try {
          encodeURIComponent(content);
          return true;
        } catch {
          return false;
        }
      },
      message: 'Message contains invalid characters'
    }
  ];

  constructor(additionalRules: ValidationRule[] = []) {
    this.rules = [...this.rules, ...additionalRules];
  }

  validate(content: string): ValidationResult {
    const errors: string[] = [];

    for (const rule of this.rules) {
      if (!rule.validate(content)) {
        errors.push(rule.message);
      }
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  validateOrThrow(content: string): void {
    const result = this.validate(content);
    if (!result.isValid) {
      throw new ValidationError('Message validation failed', {
        errors: result.errors
      });
    }
  }
} 