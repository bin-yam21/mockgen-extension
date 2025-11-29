import { Project, SyntaxKind } from "ts-morph";

const project = new Project({
    tsConfigFilePath: "tsconfig.json", // Your project TS config
    skipAddingFilesFromTsConfig: true, // We'll add files manually
});

// Add all .ts and .js files from workspace folder
project.addSourceFilesAtPaths("**/*.ts");
project.addSourceFilesAtPaths("**/*.js");
