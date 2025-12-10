async function run() {
  await Bun.build({
    entrypoints: ["./src/index.ts"],
    outdir: "./dist/",
    minify: true,
    target: "browser",
    format: "iife",
    external: ["react", "react-dom"],
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    banner: `const React = window.React;
const { useState, useEffect, useRef, useCallback, useMemo, Fragment, createElement } = React;`,
  });
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
