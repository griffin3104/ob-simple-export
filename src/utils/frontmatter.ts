import { getFrontMatterInfo } from 'obsidian';

/**
 * Remove the YAML frontmatter block (including tags, aliases and every other
 * property) and the blank lines that follow it. Content without frontmatter is
 * returned unchanged.
 */
export function stripFrontmatter(content: string): string {
	const info = getFrontMatterInfo(content);
	if (!info.exists) return content;
	return content.slice(info.contentStart).replace(/^(?:[ \t]*\r?\n)+/, '');
}
