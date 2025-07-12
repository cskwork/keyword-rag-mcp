export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        module: 'ESNext',
        target: 'ESNext'
      }
    }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(unified|remark-parse|unist-util-visit|mdast|micromark|decode-named-character-reference|character-entities|property-information|hast-util-property-information|space-separated-tokens|comma-separated-tokens|hast-util-whitespace|@types/mdast|unist-util-is|unist-util-visit-parents|@types/unist|vfile|vfile-message|bail|trough|devlop)/)'
  ],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/__tests__/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 30000
};