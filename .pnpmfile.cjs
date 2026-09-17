const version = require("./package.json").dependencies["@deepseek-ai/dsh"];

// Keep the coordinated Harness release together: ^ prerelease ranges would
// otherwise pull plugins from npm's newer "next" channel into the latest build.
module.exports = {
  hooks: {
    readPackage(pkg) {
      for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
        for (const name of Object.keys(pkg[field] ?? {})) {
          if (name === "@deepseek-ai/dsh" || name.startsWith("@deepseek-ai/dsh-")) {
            pkg[field][name] = version;
          }
        }
      }
      return pkg;
    },
  },
};
