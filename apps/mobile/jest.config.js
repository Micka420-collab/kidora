// jest-expo transforms Expo/React-Native modules and provides the RN test env.
// Scope to src/ so we only run our own unit tests (pure logic + mocked storage),
// not anything under node_modules or the native modules/ dirs.
module.exports = {
  preset: "jest-expo",
  roots: ["<rootDir>/src"],
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
};
