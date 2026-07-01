import path from 'node:path';

function normalize(inputPath: string): string {
  return path.resolve(inputPath);
}

export function isPathInsideRoots(filePath: string, roots: string[]): boolean {
  if (!filePath || roots.length === 0) {
    return false;
  }

  const target = normalize(filePath);

  return roots.some((root) => {
    const normalizedRoot = normalize(root);
    const relative = path.relative(normalizedRoot, target);

    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  });
}
