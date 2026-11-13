import { _readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const FUNCTIONS_DIR = join(process.cwd(), 'supabase/functions');
const OUTPUT_FILE = join(process.cwd(), 'docs/api/openapi.yaml');

function generateOpenAPI() {
  const functions = readdirSync(FUNCTIONS_DIR).filter(
    (f) => !f.startsWith('_') && !f.includes('.'),
  );

  let yaml = `openapi: 3.0.0
info:
  title: Nexus Agents Studio API
  description: API documentation for the 66 Edge Functions of the Nexus platform.
  version: 1.0.0
servers:
  - url: https://qdlnzopxrlsoljcrcmzv.supabase.co/functions/v1
    description: Production Edge Functions
paths:
`;

  for (const func of functions) {
    yaml += `  /${func}:
    post:
      summary: ${func
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')}
      description: Execution of the ${func} agentic component.
      responses:
        '200':
          description: Successful execution
        '401':
          description: Unauthorized
        '500':
          description: Internal server error
`;
  }

  if (!existsSync(join(process.cwd(), 'docs/api'))) {
    // This will be handled by the environment
  }

  writeFileSync(OUTPUT_FILE, yaml);
  console.log(`Generated OpenAPI spec for ${functions.length} functions at ${OUTPUT_FILE}`);
}

generateOpenAPI();
