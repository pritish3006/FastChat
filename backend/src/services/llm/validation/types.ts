export interface ValidationResult {
  isValid: boolean;
  errors?: string[];
}

export interface SanitizationResult {
  content: string;
  wasModified: boolean;
  modifications?: string[];
}

export interface ContentValidator {
  validate(content: string): ValidationResult;
}

export interface ContentSanitizer {
  sanitize(content: string): SanitizationResult;
}

export interface ValidationRule {
  name: string;
  validate(content: string): boolean;
  message: string;
}

export interface SanitizationRule {
  name: string;
  sanitize(content: string): string;
  description: string;
} 