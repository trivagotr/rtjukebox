import {describe, expect, it} from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('page transition visibility', () => {
  it('starts pages visible so a missed focus animation cannot black-screen the app', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/components/PageTransition.tsx'), 'utf8');

    expect(source).toContain('useRef(new Animated.Value(1)).current');
    expect(source).not.toContain('fadeAnim.setValue(0)');
    expect(source).not.toContain('scaleAnim.setValue(0.97)');
  });
});
