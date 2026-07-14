import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('production Study access gate', () => {
  it('locks every hosted production page unless the app bridge is present', () => {
    const source = fs.readFileSync(path.join(dirname, '../src/main.ts'), 'utf8');

    expect(source).toContain(
      "const isHostedProduction = import.meta.env.PROD && window.location.protocol !== 'file:'",
    );
    expect(source).toContain('if (isHostedProduction && !secureBridge)');
    expect(source.indexOf('if (isHostedProduction && !secureBridge)')).toBeLessThan(
      source.indexOf("mode === 'engine-proof'"),
    );
    expect(source).not.toContain(
      "import.meta.env.PROD && parameters.get('embedded') === 'mobile' && !secureBridge",
    );
  });
});
