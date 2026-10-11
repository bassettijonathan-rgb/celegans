// Loads the TypeScript fit worker through tsx (worker threads do not inherit the CLI's loader).
import { register } from 'tsx/esm/api';
register();
await import('./worker.ts');
