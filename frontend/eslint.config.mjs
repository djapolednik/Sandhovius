import { defineConfig, globalIgnores } from 'eslint/config'
import js from '@eslint/js'
import globals from 'globals'
import nextVitals from 'eslint-config-next/core-web-vitals'

// ESLint (Next.js 16 heeft geen `next lint` meer): `npm run lint`.
// eslint-config-next brengt de regels van React, React Hooks en Next.js;
// js.configs.recommended voegt o.a. no-undef toe, die een vergeten import
// vangt ("useRef is not defined" haalde zo de telefoon, next build zag het
// niet).
export default defineConfig([
  js.configs.recommended,
  ...nextVitals,
  {
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      // Een lege catch is hier een bewuste keuze: localStorage en
      // sessionStorage kunnen falen (privémodus); dan gewoon zonder.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // `const { veld, ...rest } = obj` om een veld weg te laten.
      'no-unused-vars': ['error', { ignoreRestSiblings: true }],
      // Bijna altijd bewust: browser-staat (thema, localStorage, de hash)
      // lezen ná de eerste render, omdat de pagina vooraf op de server
      // gerenderd wordt en de eerste client-render daar gelijk aan moet zijn.
      // Kost een extra render, geen fout: zichtbaar als waarschuwing.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  // Tests en config draaien in Node.
  {
    files: ['**/*.test.js', '*.config.{js,mjs}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
])
