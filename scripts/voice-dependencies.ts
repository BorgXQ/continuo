import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

// Preserve native/WASM assets and runtime require() calls that cannot be bundled.
export function copyVoiceDependencies(destination: string): void {
  function copy(name: string, parent: string, target: string, optional = false): void {
    const require = createRequire(join(parent, 'package.json'));
    const source = require.resolve.paths(name)?.map(path => join(path, name)).find(path => existsSync(join(path, 'package.json')));
    if (!source) {
      if (optional) return;
      throw new Error(`Missing voice dependency: ${name}`);
    }
    const directory = join(target, name);
    mkdirSync(directory, { recursive: true });
    cpSync(source, directory, { recursive: true });
    const metadata = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
    for (const dependency of Object.keys(metadata.dependencies ?? {})) {
      if (!dependency.startsWith('@types/')) copy(dependency, source, join(directory, 'node_modules'));
    }
    for (const dependency of Object.keys(metadata.optionalDependencies ?? {})) copy(dependency, source, join(directory, 'node_modules'), true);
  }
  copy('@discordjs/voice', resolve('.'), destination);
  copy('opusscript', resolve('.'), destination);
}
