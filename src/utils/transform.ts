/**
 * Rewrites Obsidian-flavoured Markdown into plain Markdown:
 *  - `![[image.png|300]]` and `![alt](path/to/image.png)` become
 *    `![alt](<relative path inside the export>)`
 *  - `![[note]]` (note embeds) are replaced by the content of that note
 *  - `[[note|alias]]` becomes `alias` (optional)
 * Fenced code blocks and inline code are never touched.
 */

export type Resolved =
	| { type: 'attachment'; relPath: string }
	| {
			type: 'note';
			name: string;
			/** Returns the converted content to inline, or null if it cannot be embedded. */
			embed: () => Promise<string | null>;
	  }
	| { type: 'missing' };

/**
 * `section` is the part of a wikilink after the note name, such as `#Heading`
 * or `^block-id`.
 */
export type Resolver = (
	target: string,
	kind: 'wiki' | 'md',
	section?: string,
) => Resolved;

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
	section: string | undefined;
	display: string;
	alias: string | undefined;
}

function parseWiki(inner: string): WikiParts {
	const [left = '', ...rest] = inner.split(/\\?\|/);
	const alias = rest.length > 0 ? rest.join('|').trim() : undefined;
	const target = left.replace(/[#^].*$/, '').trim();
	const section = /[#^].*$/.exec(left)?.[0].trim();
	const heading = section?.replace(/^[#^]+/, '').trim();
	const display = alias || target || heading || left.trim();
	return { target, section, display, alias };
}

/** Escape the characters that would end a Markdown link destination early. */
function encodeDestination(rel: string): string {
	return rel.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
}

/** Like String.replace, but the callback may be async. Runs one match at a time so results are deterministic. */
async function replaceAsync(
	text: string,
	re: RegExp,
	fn: (m: RegExpMatchArray) => Promise<string> | string,
): Promise<string> {
	let out = '';
	let last = 0;
	for (const m of text.matchAll(re)) {
		const index = m.index ?? 0;
		out += text.slice(last, index) + (await fn(m));
		last = index + m[0].length;
	}
	return out + text.slice(last);
}

async function transformSegment(text: string, opts: TransformOptions): Promise<string> {
	return replaceAsync(text, TOKEN, async (m) => {
		const [match, embedInner, mdAlt, mdPath, mdTitle, linkInner] = m;

		if (embedInner !== undefined) {
			const { target, section, display, alias } = parseWiki(embedInner);
			if (!target) return match;
			const res = opts.resolve(target, 'wiki', section);
			if (res.type === 'missing') return match;
			if (res.type === 'note') {
				const content = await res.embed();
				return content ?? res.name;
			}
			const dest = encodeDestination(res.relPath);
			if (IMAGE_EXT.test(res.relPath)) {
				const alt = alias && !SIZE_ALIAS.test(alias) ? alias : '';
				return `![${alt}](${dest})`;
			}
			return `[${alias && !SIZE_ALIAS.test(alias) ? alias : display}](${dest})`;
		}

		if (mdPath !== undefined) {
			const raw =
				mdPath.startsWith('<') && mdPath.endsWith('>') ? mdPath.slice(1, -1) : mdPath;
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
	});
}

async function transformLine(line: string, opts: TransformOptions): Promise<string> {
	// Odd indexes are inline-code spans; leave them alone.
	const parts = line.split(/(`[^`]*`)/);
	const out: string[] = [];
	for (const [i, part] of parts.entries()) {
		out.push(i % 2 === 1 ? part : await transformSegment(part, opts));
	}
	return out.join('');
}

export async function transformMarkdown(
	text: string,
	opts: TransformOptions,
): Promise<string> {
	let fence: { char: string; length: number } | null = null;
	const out: string[] = [];

	for (const line of text.split('\n')) {
		const trimmed = line.trimStart();
		if (fence) {
			const closer = new RegExp(`^${fence.char}{${fence.length},}\\s*$`);
			if (closer.test(trimmed.trimEnd())) fence = null;
			out.push(line);
			continue;
		}
		const open = /^(`{3,}|~{3,})/.exec(trimmed);
		if (open?.[1]) {
			fence = { char: open[1].charAt(0), length: open[1].length };
			out.push(line);
			continue;
		}
		out.push(await transformLine(line, opts));
	}
	return out.join('\n');
}
