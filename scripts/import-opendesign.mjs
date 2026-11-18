#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  converter,
  formatHex,
  formatRgb,
  interpolateWithPremultipliedAlpha,
  parse,
} from 'culori';
import { Resvg } from '@resvg/resvg-js';

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotDirectory = path.join(projectDirectory, 'design/open-design/final');
const staticDirectory = path.join(projectDirectory, 'uniapp/static');
const stylesDirectory = path.join(projectDirectory, 'uniapp/styles');
const sourceDocuments = ['brand-spec.md', 'design-notes.md', 'interaction-review.md'];
const sourceAudioFiles = ['place.mp3', 'bomb.mp3'];
const resetElements = ['view', 'text', 'button', 'image', 'scroll-view', 'input'];
const tagSelectors = {
  html: 'page',
  body: '.reversi-app',
  div: 'view',
  a: '.link',
  h1: '.h1',
  h2: '.h2',
  h3: '.h3',
  p: '.p',
  strong: '.strong',
  small: '.small-text',
  b: '.b',
  span: '.text',
  i: '.i',
  img: '.image',
  svg: '.app-icon',
  ol: '.list',
  ul: '.list',
  li: '.list-item',
};

// These scanners keep quoted strings, data URLs and nested CSS functions intact.
function stripComments(text) {
  let result = '', quote = '';
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quote) {
      result += character;
      if (character === '\\') result += text[++index] ?? '';
      else if (character === quote) quote = '';
    } else if (character === '"' || character === "'") {
      quote = character; result += character;
    } else if (character === '/' && text[index + 1] === '*') {
      const end = text.indexOf('*/', index + 2);
      if (end < 0) throw new Error('Unclosed CSS comment.');
      result += ' '; index = end + 1;
    } else result += character;
  }
  return result;
}

function splitTopLevel(text, separator) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = '';
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quote) {
      if (character === '\\') index++;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === '(' || character === '[') depth++;
    else if (character === ')' || character === ']') depth--;
    else if (character === separator && depth === 0) {
      parts.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts.filter(Boolean);
}

function closingDelimiter(text, openingIndex, opening, closing) {
  let depth = 1;
  let quote = '';
  for (let index = openingIndex + 1; index < text.length; index++) {
    const character = text[index];
    if (quote) {
      if (character === '\\') index++;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '/' && text[index + 1] === '*') {
      const commentEnd = text.indexOf('*/', index + 2);
      if (commentEnd < 0) throw new Error('Unclosed CSS comment.');
      index = commentEnd + 1;
    } else if (character === '"' || character === "'") quote = character;
    else if (character === opening) depth++;
    else if (character === closing && --depth === 0) return index;
  }
  throw new Error(`Unclosed CSS delimiter ${opening}.`);
}

function replaceFunctions(text, functionName, replacement) {
  const expression = new RegExp(`\\b${functionName}\\s*\\(`, 'gi');
  let result = '';
  let cursor = 0;
  for (let match = expression.exec(text); match; match = expression.exec(text)) {
    const opening = expression.lastIndex - 1;
    const closing = closingDelimiter(text, opening, '(', ')');
    result += text.slice(cursor, match.index) + replacement(text.slice(match.index, closing + 1));
    cursor = closing + 1;
    expression.lastIndex = cursor;
  }
  return result + text.slice(cursor);
}

function declarations(text) {
  return splitTopLevel(text, ';').map((declaration) => {
    const colon = declaration.indexOf(':');
    if (colon < 1) throw new Error(`Invalid CSS declaration: ${declaration}`);
    return [declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim()];
  });
}

function makeColorResolver(variables) {
  const resolve = (value, stack = []) => {
    const text = value.trim();
    if (text.startsWith('var(')) {
      const [name, fallback] = splitTopLevel(text.slice(4, -1), ',');
      if (stack.includes(name)) throw new Error(`Circular color variable: ${name}`);
      const definition = variables.get(name) ?? fallback;
      if (!definition) throw new Error(`Unknown color variable: ${name}`);
      return resolve(definition, [...stack, name]);
    }
    if (text.startsWith('color-mix(')) {
      const [spaceExpression, firstExpression, secondExpression, ...extra] = splitTopLevel(text.slice(10, -1), ',');
      const spaces = { oklch: 'oklch', oklab: 'oklab', srgb: 'rgb', 'srgb-linear': 'lrgb' };
      const mode = spaces[spaceExpression?.replace(/^in\s+/, '').trim()];
      if (!mode || !firstExpression || !secondExpression || extra.length) {
        throw new Error(`Unsupported color mix: ${text}`);
      }
      const stop = (expression) => {
        const percentage = expression.match(/\s+([\d.]+)%\s*$/);
        return {
          color: resolve(percentage ? expression.slice(0, percentage.index) : expression, stack),
          weight: percentage ? Number(percentage[1]) / 100 : undefined,
        };
      };
      const first = stop(firstExpression);
      const second = stop(secondExpression);
      const firstWeight = first.weight ?? (second.weight === undefined ? 0.5 : 1 - second.weight);
      const secondWeight = second.weight ?? 1 - firstWeight;
      const total = firstWeight + secondWeight;
      if (firstWeight < 0 || secondWeight < 0 || total <= 0) throw new Error(`Invalid color mix weights: ${text}`);
      const convert = converter(mode);
      let left = convert(first.color);
      let right = convert(second.color);
      // CSS transparent contributes opacity, never a black hue. Borrow the other
      // color's channels before premultiplication so polar interpolation agrees.
      if (left.alpha === 0) left = { ...right, alpha: 0 };
      if (right.alpha === 0) right = { ...left, alpha: 0 };
      const mixed = interpolateWithPremultipliedAlpha([left, right], mode)(secondWeight / total);
      mixed.alpha = (mixed.alpha ?? 1) * Math.min(1, total);
      return mixed;
    }
    const color = parse(text);
    if (!color) throw new Error(`Unsupported source color: ${text}`);
    return color;
  };
  return resolve;
}

function rewriteSelectors(header) {
  const selectors = splitTopLevel(header, ',').flatMap((selector) => {
    // Attribute values are opaque; a label containing a tag name is not a selector.
    const attributes = [];
    let rewritten = selector.replace(/\[(?:[^\]"']|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')*\]/g, (attribute) => {
      attributes.push(attribute);
      return `[__ATTRIBUTE_${attributes.length - 1}__]`;
    });
    rewritten = rewritten.replace(/:root\b/g, '.reversi-app').replace(
      /(^|[\s>+~,(])([a-z][\w-]*)(?=[\s>+~.#:[\](),]|$)/gi,
      (match, prefix, tag) => prefix + (tagSelectors[tag.toLowerCase()] ?? tag),
    );
    rewritten = rewritten.replace(/\[__ATTRIBUTE_(\d+)__\]/g, (_, index) => attributes[Number(index)]);
    rewritten = rewritten.replace(/:disabled\b/g, '[disabled]');
    const expanded = rewritten.includes('*')
      ? resetElements.map((element) => rewritten.replace(/\*/g, element))
      : [rewritten];
    // Scope the whole design consistently. Class rules must still outrank base
    // button resets, while uni-app's lazily injected element defaults must not.
    return expanded.map((value) => value === 'page' || value.startsWith('.reversi-app')
      ? value : value.startsWith('.effects-off') ? `.reversi-app${value}` : `.reversi-app ${value}`);
  });
  return [...new Set(selectors)].join(', ');
}

function rewriteRules(css, level = 0, keyframes = false) {
  const rules = [];
  const indentation = '  '.repeat(level);
  let cursor = 0;
  while (cursor < css.length) {
    // The source uses ordinary rules, media/container groups and keyframes.
    // Braces in declaration strings are consumed by closingDelimiter below.
    const opening = css.indexOf('{', cursor);
    if (opening < 0) {
      if (css.slice(cursor).trim()) throw new Error('Unexpected trailing CSS.');
      break;
    }
    const header = css.slice(cursor, opening).trim();
    const closing = closingDelimiter(css, opening, '{', '}');
    const body = css.slice(opening + 1, closing);
    if (header.startsWith('@')) {
      if (!/^@(media|container|supports|layer|(?:-webkit-)?keyframes)\b/i.test(header)) {
        throw new Error(`Unsupported CSS group: ${header}`);
      }
      const group = `${indentation}${header} {\n${rewriteRules(body, level + 1, /keyframes\b/i.test(header))}\n${indentation}}`;
      // WXSS rejects container at-rules. platform.css carries the equivalent
      // narrow-window rules for native screens; H5 retains the source query.
      rules.push(/^@container\b/i.test(header)
        ? `${indentation}/* #ifdef H5 */\n${group}\n${indentation}/* #endif */`
        : group);
    } else {
      const selector = keyframes ? header : rewriteSelectors(header);
      const lines = declarations(body).map(([name, value]) => `${indentation}  ${name}: ${value};`);
      rules.push(`${indentation}${selector} {\n${lines.join('\n')}\n${indentation}}`);
    }
    cursor = closing + 1;
  }
  return rules.join('\n\n');
}

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g)].map((match) => [match[1], match[3]]));
}

function decodeImage(url, mime) {
  const match = url.match(new RegExp(`^data:image/${mime};base64,([A-Za-z0-9+/=\\s]+)$`));
  if (!match) throw new Error(`Expected embedded ${mime} image.`);
  const encoded = match[1].replace(/\s/g, '');
  const bytes = Buffer.from(encoded, 'base64');
  if (!bytes.length || bytes.toString('base64') !== encoded) throw new Error(`Invalid embedded ${mime} data.`);
  if (mime === 'png' && !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error('Paper grain is not a PNG.');
  }
  if (mime === 'jpeg' && (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255)) {
    throw new Error('Table illustration is not a JPEG.');
  }
  return bytes;
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--help' || args[0] === '-h') {
    console.log('Usage: node scripts/import-opendesign.mjs [design-directory]\n\nAn explicit directory snapshots index.html and its three design documents.\nWithout an argument, regenerate from design/open-design/final.');
    return;
  }
  if (args.length > 1 || args[0]?.startsWith('-')) throw new Error('Expected at most one positional design directory.');
  const sourceDirectory = args[0] ? path.resolve(args[0]) : snapshotDirectory;
  let sourceBytes;
  try {
    sourceBytes = await readFile(path.join(sourceDirectory, 'index.html'));
  } catch (error) {
    if (!args.length && error.code === 'ENOENT') {
      throw new Error('No final design snapshot exists. Run node scripts/import-opendesign.mjs "<Open Design directory>" first.');
    }
    throw error;
  }
  // Read all requested snapshot files before writing any generated output.
  const documents = args.length
    ? await Promise.all(sourceDocuments.map(async (name) => [name, await readFile(path.join(sourceDirectory, name))]))
    : [];
  const audioFiles = await Promise.all(sourceAudioFiles.map(async (name) => [
    name,
    await readFile(path.join(projectDirectory, 'assets/audio', name)),
  ]));
  const html = sourceBytes.toString('utf8');
  const styleBlocks = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]);
  if (!styleBlocks.length) throw new Error('The source has no inline design stylesheet.');
  const originalCss = stripComments(styleBlocks.join('\n'));
  const root = originalCss.match(/:root\s*\{([\s\S]*?)\}/)?.[1];
  if (!root) throw new Error('The source has no :root design tokens.');
  const variables = new Map(declarations(root));
  const resolveColor = makeColorResolver(variables);
  const grainUrl = variables.get('--grain')?.match(/^url\(\s*(["']?)([\s\S]*?)\1\s*\)$/)?.[2];
  const tableTag = [...html.matchAll(/<img\b[^>]*>/gi)].find((match) => attributes(match[0]).id === 'table-image')?.[0];
  if (!grainUrl || !tableTag) throw new Error('The source must contain --grain and #table-image.');
  const paper = decodeImage(grainUrl, 'png');
  const table = decodeImage(attributes(tableTag).src ?? '', 'jpeg');

  let css = originalCss.replaceAll(grainUrl, '/static/paper-grain.png');
  css = replaceFunctions(css, 'color-mix', (color) => formatRgb(resolveColor(color)));
  css = replaceFunctions(css, 'oklch', (color) => formatRgb(resolveColor(color)));
  css = `/* Generated from Open Design index.html by scripts/import-opendesign.mjs.\n * Color mixes use the original unrounded tokens, with premultiplied alpha.\n * Layout, media/container queries, focus states and animation values are retained.\n */\n\n${rewriteRules(css)}\n`;
  if (/\b(?:oklch|color-mix)\s*\(|data:image\//i.test(css)) throw new Error('Generated CSS still contains unconverted design assets or colors.');

  const tones = {
    ink: '#1d2b25',
    ivory: formatHex(resolveColor('var(--ivory)')),
    muted: formatHex(resolveColor('var(--muted)')),
    felt: formatHex(resolveColor('var(--felt)')),
  };
  const iconFiles = [];
  const iconNames = new Set();
  for (const match of html.matchAll(/<symbol\b([^>]*)>([\s\S]*?)<\/symbol>/gi)) {
    const symbol = attributes(match[1]);
    const name = symbol.id?.replace(/^i-/, '');
    if (!name || !/^[a-z][a-z0-9-]*$/.test(name) || iconNames.has(name)) throw new Error('Invalid or duplicate source icon name.');
    const box = symbol.viewBox?.trim().split(/[\s,]+/).map(Number);
    if (!box || box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) {
      throw new Error(`Invalid viewBox for icon ${name}.`);
    }
    iconNames.add(name);
    const svg = (color, weight = 1.6) => `<svg xmlns="http://www.w3.org/2000/svg" width="${box[2]}" height="${box[3]}" viewBox="${symbol.viewBox}" fill="none" stroke="${color}" stroke-width="${weight}" stroke-linecap="round" stroke-linejoin="round">${match[2]}</svg>\n`;
    iconFiles.push([`${name}.svg`, svg('currentColor')]);
    for (const [tone, color] of Object.entries(tones)) {
      const source = svg(color, tone === 'felt' ? 2 : 1.6);
      const rendered = new Resvg(source, { fitTo: { mode: 'zoom', value: 3 }, font: { loadSystemFonts: false } }).render();
      if (rendered.width !== box[2] * 3 || rendered.height !== box[3] * 3) {
        throw new Error(`Unexpected 3x raster dimensions for icon ${name}.`);
      }
      iconFiles.push([`${name}-${tone}.svg`, source], [`${name}-${tone}.png`, rendered.asPng()]);
    }
  }
  if (!iconNames.size) throw new Error('No source SVG symbols were found.');

  const iconsDirectory = path.join(staticDirectory, 'icons');
  const audioDirectory = path.join(staticDirectory, 'audio');
  await Promise.all([
    mkdir(iconsDirectory, { recursive: true }),
    mkdir(audioDirectory, { recursive: true }),
    mkdir(stylesDirectory, { recursive: true }),
  ]);
  if (args.length) {
    await mkdir(snapshotDirectory, { recursive: true });
    await Promise.all([
      writeFile(path.join(snapshotDirectory, 'index.html'), sourceBytes),
      ...documents.map(([name, bytes]) => writeFile(path.join(snapshotDirectory, name), bytes)),
    ]);
  }
  await Promise.all([
    writeFile(path.join(staticDirectory, 'paper-grain.png'), paper),
    writeFile(path.join(staticDirectory, 'reversi-table.jpg'), table),
    writeFile(path.join(stylesDirectory, 'design.css'), css),
    ...iconFiles.map(([name, bytes]) => writeFile(path.join(iconsDirectory, name), bytes)),
    ...audioFiles.map(([name, bytes]) => writeFile(path.join(audioDirectory, name), bytes)),
  ]);
  console.log(`Imported ${iconNames.size} source icons (${iconFiles.length} SVG/PNG files), ${paper.length}-byte paper PNG and ${table.length}-byte table JPEG.`);
  console.log(`Icon tones: ${Object.entries(tones).map(([name, color]) => `${name}=${color}`).join(', ')}. PNGs are rendered at 3x viewBox dimensions.`);
  console.log(`Copied ${audioFiles.length} original MP3 files from assets/audio/ to uniapp/static/audio/.`);
  console.log(`Generated ${path.relative(projectDirectory, stylesDirectory)}/design.css and ${path.relative(projectDirectory, staticDirectory)}/.`);
  if (args.length) console.log(`Saved byte-identical source and ${documents.length} documents in design/open-design/final/.`);
}

main().catch((error) => {
  console.error(`Open Design import failed: ${error.message}`);
  process.exitCode = 1;
});
