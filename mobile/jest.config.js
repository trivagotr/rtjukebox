module.exports = {
  preset: 'react-native',
  moduleNameMapper: {
    '\\.(gif|jpg|jpeg|png|svg|webp)$': '<rootDir>/__mocks__/fileMock.js',
  },
};
