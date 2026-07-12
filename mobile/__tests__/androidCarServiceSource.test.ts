import {describe, expect, it} from '@jest/globals';
import fs from 'fs';
import path from 'path';

const serviceSource = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'android',
    'app',
    'src',
    'main',
    'java',
    'com',
    'radiotedumobile',
    'car',
    'RadioTeduCarService.kt',
  ),
  'utf8',
);

describe('Android Auto native car service', () => {
  it('uses scored normalized voice search so Spark/Rock queries do not fall back to the main brand match', () => {
    expect(serviceSource).toContain('private fun normalizeSearchQuery');
    expect(serviceSource).toContain('private fun scoreSearchItem');
    expect(serviceSource).toContain('radiotedu-main');
    expect(serviceSource).toContain('radiotedu-spark');
    expect(serviceSource).toContain('radiotedu-rock');
    expect(serviceSource).toContain('q.contains("spark")');
    expect(serviceSource).toContain('q.contains("rock")');
  });

  it('normalizes Turkish Gemini voice phrases for RadioTEDU, Spark, and Rock playback', () => {
    expect(serviceSource).toContain('replace("ç", "c")');
    expect(serviceSource).toContain('replace("ğ", "g")');
    expect(serviceSource).toContain('replace("ö", "o")');
    expect(serviceSource).toContain('replace("ş", "s")');
    expect(serviceSource).toContain('replace("ü", "u")');
    expect(serviceSource).toContain('q.contains("cal")');
    expect(serviceSource).toContain('q.contains("oynat")');
    expect(serviceSource).toContain('q.contains("rtedu")');
    expect(serviceSource).toContain('q.contains("radyo tedu")');
  });
});
