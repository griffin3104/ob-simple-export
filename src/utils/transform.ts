/**
 * Rewrites Obsidian-flavoured Markdown into plain Markdown:
 *  - `![[image.png|300]]` and `![alt](path/to/image.png)` become
 *    `![alt](<relative path inside the export>)`
 *  - `![[note]]` (note embeds) become the note title
 *  - `[[note|alias]]` becomes `alias` (optional)
 * Fenced code blocks and inline code are never touched.
 */

export type Resolved =
	| { type: 'attachment'; relPath: string }
	| { type: 'note'; name: string }
	| { type: 'missing' };

export type Resolver = (target: string, kind: 'wiki' | 'md') => Resolved;

export interface TransformOptions {
	stripWikilinks: boolean;
	resolve: Resolver;
}

const IMAGE_EXT = /\.(?:png|jpe?g|gif|webp|svg|bmp|avif)$/i;
const SIZE_ALIAS = /^\d+(?:x\d+)?$/;
const URL_LIKE = /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i;

// 1: ![[embed]]   2-4: ![alt](path "title")   5: [[link]]
const TOKEN =
	/!\[\[([^\]]+)\]\]|!\[([^\]]*)\]\((<[^>]+>|[^)\s]+)(\s+(?:"[^"]*"|'[^']*'))?\)|\[\[([^\]]+)\]\]/g;

interface WikiParts {
	target: string;
	display: string;
	alias: string | undefined;
}

function parseWiki(inner: string): WikiParts {
	const [left = '', ...rest] = inner.split(/\\?\|/);
	const alias = rest.length > 0 ? rest.join('|').trim() : undefined;
	const target = left.replace(/[#^].*$/, '').trim();
	const heading = /[#^](.*)$/.exec(left)?.[1]?.trim();
	const display = alias || target || heading || left.trim();
	return { target, display, alias };
}

/** Escape the characters that would end a Markdown link destination early. */
function encodeDestination(rel: string): string {
	return rel.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
}

function transformSegment(text: string, opts: TransformOptions): string {
	return text.replace(
		TOKEN,
		(
			match: string,
			embedInner: string | undefined,
			mdAlt: string | undefined,
			mdPath: string | undefined,
			mdTitle: string | undefined,
			linkInner: string | undefined,
		) => {
			if (embedInner !== undefined) {
				const { target, display, alias } = parseWiki(embedInner);
				if (!target) return match;
				const res = opts.resolve(target, 'wiki');
				if (res.type === 'missing') return match;
				if (res.type === 'note') return res.name;
				const dest = encodeDestination(res.relPath);
				if (IMAGE_EXT.test(res.relPath)) {
					const alt = alias && !SIZE_ALIAS.test(alias) ? alias : '';
					return `![${alt}](${dest})`;
				}
				return `[${alias && !SIZE_ALIAS.test(alias) ? alias : display}](${dest})`;
			}

			if (mdPath !== undefined) {
				const raw =
					mdPath.startsWith('<') && mdPath.endsWith('>')
						? mdPath.slice(1, -1)
						: mdPath;
				if (URL_LIKE.test(raw)) return match;
				const res = opts.resolve(raw, 'md');
				if (res.type !== 'attachment') return match;
				return `![${mdAlt ?? ''}](${encodeDestination(res.relPath)}${mdTitle ?? ''})`;
			}

			if (linkInner !== undefined) {
				if (!opts.stripWikilinks) return match;
				return parseWiki(linkInner).display;
			}

			return match;
		},
	);
}

function transformLine(line: string, opts: TransformOptions): string {
	// Odd indexes are inline-code spans; leave them alone.
	return line
		.split(/(`[^`]*`)/)
		.map((part, i) => (i % 2 === 1 ? part : transformSegment(part, opts)))
		.join('');
}

export function transformMarkdown(text: string, opts: TransformOptions): string {
	let fence: { char: string; length: number } | null = null;

	return text
		.split('\n')
		.map((line) => {
			const trimmed = line.trimStart();
			if (fence) {
				const closer = new RegExp(`^${fence.char}{${fence.length},}\\s*$`);
				if (closer.test(trimmed.trimEnd())) fence = null;
				return line;
			}
			const open = /^(`{3,}|~{3,})/.exec(trimmed);
			if (open?.[1]) {
				fence = { char: open[1].charAt(0), length: open[1].length };
				return line;
			}
			return transformLine(line, opts);
		})
		.join('\n');
}
