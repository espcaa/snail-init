#!/usr/bin/env node
import { Command } from "commander";
import Handlebars from "handlebars";
import prompts from "prompts";
import type { PromptObject } from "prompts";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type TemplateContext = {
  pluginName: string;
  pluginDescription: string;
  pluginIcon: string;
  projectName: string;
  projectSlug: string;
};

type PromptAnswers = {
  projectName?: string;
  pluginName?: string;
  pluginDescription?: string;
  pluginIcon?: string;
};

type CreateOptions = {
  directory?: string;
  pluginName?: string;
  description?: string;
  icon?: string;
};

const PROGRAM_NAME = "snail-init";
const PROGRAM_VERSION = "0.1.0";
const DEFAULT_DESCRIPTION = "A new Snail plugin created with snail-init";
const DEFAULT_ICON = "null";
const TEMPLATE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../template/dist",
);

console.log(`
  .----.   @   @
 / .-"-.'.  \\v/
 | | '\\ \\ \\_/ )
,-\\ '-.' /.'  /
'---\`----'----'
`);
console.log("hii O-O, seems like you want to make a plugin?\n");

const program = new Command();
program
  .name(PROGRAM_NAME)
  .description("Scaffold a Snail plugin project from the official template.")
  .version(PROGRAM_VERSION)
  .showHelpAfterError();

program.addCommand(buildCreateCommand(), { isDefault: true });

void program.parseAsync();

function buildCreateCommand(): Command {
  const cmd = new Command("create");
  cmd
    .description("Create a Snail plugin project from the official template.")
    .argument("[project-name]", "Directory name for the new project")
    .option(
      "-d, --directory <directory>",
      "Directory to create the project in (defaults to the project name)",
    )
    .option("--plugin-name <name>", "Display name for your plugin")
    .option("--description <text>", "Description for your plugin")
    .option("--icon <icon>", "Icon URL or asset path for your plugin");

  cmd.action(async function (this: Command, projectName?: string) {
    const options = this.opts<CreateOptions>();
    await runWithHandling(() => createProjectFlow(projectName, options));
  });

  return cmd;
}

async function runWithHandling(task: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ ${message}`);
    process.exit(1);
  }
}

async function createProjectFlow(
  projectNameArg?: string,
  cliOptions: CreateOptions = {},
): Promise<void> {
  ensureTemplateDirectory();
  const questions = buildPromptQuestions(projectNameArg, cliOptions);
  const answers = (
    questions.length > 0
      ? await prompts(questions, {
          onCancel: () => {
            throw new Error("Operation cancelled.");
          },
        })
      : {}
  ) as PromptAnswers;

  const projectName = normalizeProjectName(
    projectNameArg ?? answers.projectName,
  );
  const targetDir = path.resolve(
    process.cwd(),
    cliOptions.directory ?? projectName,
  );
  await ensureDirectoryIsEmpty(targetDir);

  const pluginName =
    cliOptions.pluginName ?? answers.pluginName ?? toDisplayName(projectName);
  const pluginDescription =
    cliOptions.description ?? answers.pluginDescription ?? DEFAULT_DESCRIPTION;
  let pluginIcon = cliOptions.icon ?? answers.pluginIcon ?? DEFAULT_ICON;

  if (pluginIcon.toLowerCase() === "null") {
    pluginIcon = "null";
  }

  const context: TemplateContext = {
    pluginName,
    pluginDescription,
    pluginIcon,
    projectName,
    projectSlug: toSlug(projectName),
  };

  await copyTemplateTree(TEMPLATE_DIR, targetDir, context);
  logSuccess(targetDir, context.projectName);
}

function buildPromptQuestions(
  projectNameArg?: string,
  options: CreateOptions = {},
): PromptObject[] {
  const questions: PromptObject[] = [];
  if (!projectNameArg) {
    questions.push({
      type: "text",
      name: "projectName",
      message: "Project folder name:",
      initial: "snail-plugin",
      validate: (value: string) =>
        value && value.trim() ? true : "Please enter a project name.",
    });
  }

  if (!options.pluginName) {
    questions.push({
      type: "text",
      name: "pluginName",
      message: "Plugin display name:",
      initial: projectNameArg ? toDisplayName(projectNameArg) : undefined,
    });
  }

  if (!options.description) {
    questions.push({
      type: "text",
      name: "pluginDescription",
      message: "Plugin description:",
      initial: DEFAULT_DESCRIPTION,
    });
  }

  if (!options.icon) {
    questions.push({
      type: "text",
      name: "pluginIcon",
      message: "Plugin icon URL:",
      initial: DEFAULT_ICON,
    });
  }

  return questions;
}

function ensureTemplateDirectory(): void {
  if (!existsSync(TEMPLATE_DIR)) {
    throw new Error(`Template directory not found at ${TEMPLATE_DIR}`);
  }
}

function normalizeProjectName(value?: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error("A project name is required.");
  }
  return normalized;
}

async function ensureDirectoryIsEmpty(dir: string): Promise<void> {
  if (!existsSync(dir)) {
    return;
  }
  const stats = await stat(dir);
  if (!stats.isDirectory()) {
    throw new Error(`Path "${dir}" already exists and is not a directory.`);
  }
  const contents = await readdir(dir);
  if (contents.length > 0) {
    throw new Error(`Directory "${dir}" already exists and is not empty.`);
  }
}

async function copyTemplateTree(
  srcDir: string,
  destDir: string,
  context: TemplateContext,
): Promise<void> {
  await mkdir(destDir, { recursive: true });
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".DS_Store") {
      continue;
    }
    const srcPath = path.join(srcDir, entry.name);
    const destinationName = entry.isFile()
      ? entry.name.replace(/\.hbs$/, "")
      : entry.name;
    const destPath = path.join(destDir, destinationName);
    if (entry.isDirectory()) {
      await copyTemplateTree(srcPath, destPath, context);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".hbs")) {
      const templateContent = await readFile(srcPath, "utf8");
      const output = Handlebars.compile(templateContent)(context);
      await writeFile(destPath, output, "utf8");
      continue;
    }
    const fileBuffer = await readFile(srcPath);
    await writeFile(destPath, fileBuffer);
  }
}

function toDisplayName(value: string): string {
  const words = value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (words.length === 0) {
    return "Snail Plugin";
  }
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function toSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "snail-plugin";
}

function logSuccess(targetDir: string, projectName: string): void {
  const relativePath = path.relative(process.cwd(), targetDir) || ".";
  console.log(`\n✨ Created ${projectName} in ${relativePath}`);
  console.log("\nNext steps:\n");
  console.log(`  cd ${relativePath}`);
  console.log("  bun install");
  console.log("  bun run build\n");
}
