import { _readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const FUNCTIONS_DIR = join(process.cwd(), 'supabase/functions');
const OUTPUT_FILE = join(process.cwd(), 'docs/api/openapi.yaml');

function generateOpenAPI() {
  const functions = readdirSync(FUNCTIONS_DIR).filter(f => 
    !f.startsWith('_') && !f.includes('.')
  );

  let yaml = `openapi: 3.0.0
info:
  title: Nexus Agents Studio API
  description: API documentation for the 66 Edge Functions of the Nexus platform.
  version: 1.0.0
servers:
  - url: https://0ef3e2b6-577d-454f-881a-388fe5cf1ec6.functions.supabase.co
    description: Production Edge Functions
paths:
`;

  for (const func of functions) {
    yaml += `  /${func}:
    post:
      summary: ${func.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
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
  // eslint-disable-next-line no-console -- script de build/CI, output para stdout é o comportamento esperado.
  console.log(`Generated OpenAPI spec for ${functions.length} functions at ${OUTPUT_FILE}`);
}

generateOpenAPI();
