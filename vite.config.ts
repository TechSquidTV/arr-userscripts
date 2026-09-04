import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {},
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  run: {
    // Userscript builds embed ARR_ credentials. Never replay a previously
    // configured artifact after the local environment changes.
    cache: {
      scripts: false,
      tasks: true,
    },
  },
});
