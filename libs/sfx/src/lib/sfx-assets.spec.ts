import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SFX_IDS } from './sfx.model';

const assets = join(__dirname, '../../assets');
const manifest = JSON.parse(
  readFileSync(join(__dirname, '../../../../scripts/sfx/manifest.json'), 'utf8'),
) as { maxBytesPerFile: number; sounds: { id: string }[] };

describe('sfx assets', () => {
  it('SFX_IDS matches the manifest', () => {
    expect([...SFX_IDS].sort()).toEqual(manifest.sounds.map((s) => s.id).sort());
  });

  it.each(SFX_IDS)('%s.mp3 exists and is within the size budget', (id) => {
    const file = join(assets, `${id}.mp3`);
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).size).toBeLessThanOrEqual(manifest.maxBytesPerFile);
  });
});
