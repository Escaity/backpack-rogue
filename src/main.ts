import { createRng } from './core/rng';
import { loadProfile } from './core/save';
import { createProfile } from './core/town';
import { App } from './ui/app';

const root = document.getElementById('app');
if (!root) throw new Error('#app not found');
const rng = createRng(Date.now() >>> 0);
const profile = loadProfile(window.localStorage) ?? createProfile(rng);
new App(root, profile, window.localStorage, rng);
