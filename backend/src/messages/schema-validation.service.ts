import { Injectable } from '@nestjs/common';
import { JsonSchemaDefinition, ValidateSchemaResponseDto } from './dto/message.dto';

@Injectable()
export class SchemaValidationService {
  validateSchema(data: unknown, schema: JsonSchemaDefinition): ValidateSchemaResponseDto {
    const errors: string[] = [];
    this.validateValue(data, schema, '', errors);

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private validateValue(
    value: unknown,
    schema: JsonSchemaDefinition,
    path: string,
    errors: string[],
  ): void {
    const fieldLabel = path || 'root';

    if (schema.enum) {
      if (!schema.enum.includes(value)) {
        errors.push(`${fieldLabel}: value must be one of [${schema.enum.join(', ')}]`);
      }
      return;
    }

    if (!schema.type) return;

    switch (schema.type) {
      case 'string':
        if (typeof value !== 'string') {
          errors.push(`${fieldLabel}: expected string, got ${typeof value}`);
          return;
        }
        if (schema.minLength !== undefined && value.length < schema.minLength) {
          errors.push(`${fieldLabel}: string length must be >= ${schema.minLength}`);
        }
        if (schema.maxLength !== undefined && value.length > schema.maxLength) {
          errors.push(`${fieldLabel}: string length must be <= ${schema.maxLength}`);
        }
        break;

      case 'number':
      case 'integer':
        if (typeof value !== 'number') {
          errors.push(`${fieldLabel}: expected ${schema.type}, got ${typeof value}`);
          return;
        }
        if (schema.type === 'integer' && !Number.isInteger(value)) {
          errors.push(`${fieldLabel}: expected integer, got float`);
        }
        if (schema.minimum !== undefined && value < schema.minimum) {
          errors.push(`${fieldLabel}: value must be >= ${schema.minimum}`);
        }
        if (schema.maximum !== undefined && value > schema.maximum) {
          errors.push(`${fieldLabel}: value must be <= ${schema.maximum}`);
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push(`${fieldLabel}: expected boolean, got ${typeof value}`);
        }
        break;

      case 'null':
        if (value !== null) {
          errors.push(`${fieldLabel}: expected null`);
        }
        break;

      case 'array':
        if (!Array.isArray(value)) {
          errors.push(`${fieldLabel}: expected array, got ${typeof value}`);
          return;
        }
        if (schema.items) {
          value.forEach((item: unknown, idx: number) => {
            this.validateValue(item, schema.items!, `${path}[${idx}]`, errors);
          });
        }
        break;

      case 'object':
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          errors.push(`${fieldLabel}: expected object`);
          return;
        }
        this.validateObject(value as Record<string, unknown>, schema, path, errors);
        break;

      default:
        errors.push(`${fieldLabel}: unsupported type "${schema.type}"`);
    }
  }

  private validateObject(
    value: Record<string, unknown>,
    schema: JsonSchemaDefinition,
    path: string,
    errors: string[],
  ): void {
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in value)) {
          errors.push(`${path ? path + '.' : ''}${field}: required field is missing`);
        }
      }
    }

    if (schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        if (propName in value) {
          this.validateValue(
            value[propName],
            propSchema,
            path ? `${path}.${propName}` : propName,
            errors,
          );
        }
      }
    }
  }
}
