import {describe, expect, it} from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('Android MainActivity startup', () => {
  it('starts React Native screens without restoring stale Fragment state', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../android/app/src/main/java/com/radiotedumobile/MainActivity.kt'),
      'utf8',
    );

    expect(source).toContain('import android.os.Bundle');
    expect(source).toContain('override fun onCreate(savedInstanceState: Bundle?)');
    expect(source).toContain('super.onCreate(null)');
  });
});
