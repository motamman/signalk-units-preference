import typescript from '@rollup/plugin-typescript'
import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import terser from '@rollup/plugin-terser'

export default [
  // ESM build (for bundlers)
  {
    input: 'src/client/index.ts',
    output: {
      file: 'dist/client/index.esm.js',
      format: 'esm',
      sourcemap: true
    },
    external: ['mathjs', 'date-fns', 'date-fns-tz'],
    plugins: [
      typescript({
        tsconfig: './tsconfig.client.json',
        declaration: true,
        declarationDir: 'dist/client',
        rootDir: 'src/client'
      })
    ]
  },
  // CommonJS build (for Node.js)
  {
    input: 'src/client/index.ts',
    output: {
      file: 'dist/client/index.js',
      format: 'cjs',
      sourcemap: true,
      exports: 'named'
    },
    external: ['mathjs', 'date-fns', 'date-fns-tz'],
    plugins: [
      typescript({
        tsconfig: './tsconfig.client.json'
      })
    ]
  },
  // UMD build (for browsers via script tag)
  {
    input: 'src/client/index.ts',
    output: {
      file: 'dist/client/sk-unit-converter.umd.js',
      format: 'umd',
      name: 'SKUnitConverter',
      sourcemap: true,
      globals: {}
    },
    plugins: [
      typescript({
        tsconfig: './tsconfig.client.json'
      }),
      resolve({
        browser: true
      }),
      commonjs()
    ]
  },
  // UMD build minified (for production)
  {
    input: 'src/client/index.ts',
    output: {
      file: 'dist/client/sk-unit-converter.umd.min.js',
      format: 'umd',
      name: 'SKUnitConverter',
      sourcemap: true,
      globals: {}
    },
    plugins: [
      typescript({
        tsconfig: './tsconfig.client.json'
      }),
      resolve({
        browser: true
      }),
      commonjs(),
      terser()
    ]
  }
]
