// @ts-check

import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig({
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
    rules: {
        curly: ['error', 'all']
    }
});
