import Ajv from 'ajv';
import type { APIRequestContext } from '@playwright/test';

interface OpenApiDocument {
  components?: {
    schemas?: Record<string, unknown>;
  };
}

interface LoadedSpec {
  ajv: Ajv;
  document: OpenApiDocument;
}

let loadedSpec: Promise<LoadedSpec> | undefined;

function isOpenApiDocument(value: unknown): value is OpenApiDocument {
  return typeof value === 'object' && value !== null;
}

function readSpec(request: APIRequestContext): Promise<LoadedSpec> {
  if (!loadedSpec) {
    loadedSpec = fetchSpec(request).catch((error: unknown) => {
      loadedSpec = undefined;
      throw error;
    });
  }
  return loadedSpec;
}

async function fetchSpec(request: APIRequestContext): Promise<LoadedSpec> {
  const response = await request.get('/openapi.json');
  if (!response.ok()) {
    throw new Error(`GET /openapi.json returned HTTP ${response.status()}`);
  }

  const document: unknown = await response.json();
  if (!isOpenApiDocument(document)) {
    throw new Error('GET /openapi.json did not return an OpenAPI document');
  }

  const ajv = new Ajv({
    strict: false,
    allErrors: true,
  });
  ajv.addSchema(document, 'openapi');
  return { ajv, document };
}

function schemaRef(name: string): string {
  return `openapi#/components/schemas/${name}`;
}

function formatAjvErrors(name: string, errors: { instancePath: string; message?: string }[]): string {
  const lines = errors.map((error) => {
    const at = error.instancePath.length > 0 ? error.instancePath : '/';
    return `${at}: ${error.message ?? 'validation failed'}`;
  });
  const details = lines.length > 0 ? lines.join('\n') : 'no Ajv error details';
  return `Schema ${name} validation failed:\n${details}`;
}

export async function expectSchema(
  request: APIRequestContext,
  body: unknown,
  name: string,
): Promise<void> {
  const { ajv, document } = await readSpec(request);
  const schemas = document.components?.schemas;
  if (!schemas || !Object.prototype.hasOwnProperty.call(schemas, name)) {
    throw new Error(
      `Unknown schema "${name}" is not in GET /openapi.json components.schemas`,
    );
  }

  const validate = ajv.getSchema(schemaRef(name));
  if (!validate) {
    throw new Error(`Unknown schema "${name}" could not be resolved at ${schemaRef(name)}`);
  }

  if (!validate(body)) {
    throw new Error(formatAjvErrors(name, validate.errors ?? []));
  }
}
