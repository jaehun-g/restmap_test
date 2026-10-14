module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
  },
  extends: [
    "@nuxtjs/eslint-config-typescript",
    "plugin:nuxt/recommended",
    "prettier", // 포매팅 충돌 방지를 위해
  ],
  plugins: [],

  rules: {},
};
