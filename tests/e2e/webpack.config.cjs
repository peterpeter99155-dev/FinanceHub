const path = require('node:path');

module.exports = {
  mode: 'development',
  devtool: false,
  entry: path.resolve(__dirname, 'browser-entry.ts'),
  output: {
    clean: true,
    filename: 'bundle.js',
    path: path.resolve(__dirname, '../../.webpack/e2e-browser'),
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
          },
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.ts', '.tsx', '.css'],
  },
};
