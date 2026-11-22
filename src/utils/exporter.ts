import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
	App,
	FileSystemAdapter,
	TAbstractFile,
	TFile,
	TFolder,
	Vault,
	normalizePath,
} from 'obsidian';
import type { SimpleExportSettings } from '../settings';
import { stripFrontmatter } from './frontmatter';
import { Resolved, transformMarkdown } from './transform';

export class ExportError extends Error {}

export interface ExportResult {
	/** Absolute path of the folder everything was written into. */
	outRoot: string;
	notes: number;
	attachments: number;
	/** Embedded files that could not be found, as "note path → link target". */
	missing: string[];
}

/** Expand `~`, require an absolute path, and refuse anything inside the vault. */
export function resolveOutputDir(app: App, raw: string): string {
	let p = raw.trim();
	if (!p) {
		throw new ExportError(
			'Output folder is not set. Choose one in Settings → Simple Export.',
		);
	}
	if (p === '~' || p.startsWith('~/')) {
		p = path.join(os.homedir(), p.slice(1));
	}
	if (!path.isAbsolute(p)) {
		throw new ExportError('Output folder must be an absolute path.');
	}
	p = path.resolve(p);

	const adapter = app.vault.adapter;
	if (adapter instanceof FileSystemAdapter) {
		const rel = path.relative(path.resolve(adapter.getBasePath()), p);
		const inside =
			rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel));
		if (inside) {
			throw new ExportError('Output folder must be outside the vault.');
		}
	}
	return p;
}

class Exporter {
	private readonly attachmentMap = new Map<string, string>();
	private readonly usedPaths = new Set<string>();
	private pendingCopies: Array<{ file: TFile; dest: string }> = [];
	readonly result: ExportResult;

	constructor(
		private readonly app: App,
		private readonly settings: SimpleExportSettings,
		private readonly outRoot: string,
	) {
		this.result = { outRoot, notes: 0, attachments: 0, missing: [] };
	}

	async exportNote(file: TFile, outFile: string): Promise<void> {
		const raw = await this.app.vault.read(file);
		const outDir = path.dirname(outFile);

		const text = transformMarkdown(stripFrontmatter(raw), {
			stripWikilinks: this.settings.stripWikilinks,
			resolve: (target, kind) => this.resolve(target, kind, file, outDir),
		});

		await fs.promises.mkdir(outDir, { recursive: true });
		await fs.promises.writeFile(outFile, text, 'utf8');
		this.result.notes++;

		await this.flushCopies();
	}

	private resolve(
		target: string,
		kind: 'wiki' | 'md',
		source: TFile,
		outDir: string,
	): Resolved {
		const found = this.findFile(target, kind, source.path);
		if (!found) {
			this.result.missing.push(`${source.path} → ${target}`);
			return { type: 'missing' };
		}
		if (found.extension === 'md') {
			return { type: 'note', name: found.basename };
		}
		const dest = this.attachmentDest(found);
		const relPath = path.relative(outDir, dest).split(path.sep).join('/');
		return { type: 'attachment', relPath };
	}

	private findFile(target: string, kind: 'wiki' | 'md', sourcePath: string): TFile | null {
		let t = target.trim();
		if (kind === 'md') {
			try {
				t = decodeURIComponent(t);
			} catch {
				// keep the raw text if it is not valid percent-encoding
			}
		}
		if (!t) return null;

		const viaLink = this.app.metadataCache.getFirstLinkpathDest(t, sourcePath);
		if (viaLink) return viaLink;

		// Markdown links are relative to the note, e.g. ../images/a.png
		const joined = normalizePath(path.posix.join(path.posix.dirname(sourcePath), t));
		const f = this.app.vault.getAbstractFileByPath(joined);
		return f instanceof TFile ? f : null;
	}

	/** Decide (once per vault file) where an attachment lands inside the export. */
	private attachmentDest(file: TFile): string {
		const known = this.attachmentMap.get(file.path);
		if (known) return known;

		const dir = path.join(this.outRoot, this.settings.attachmentsDirName);
		let candidate = path.join(dir, file.name);
		let n = 1;
		// macOS and Windows file systems are case-insensitive, so compare lower-cased.
		while (this.usedPaths.has(candidate.toLowerCase())) {
			candidate = path.join(dir, `${file.basename}-${n}.${file.extension}`);
			n++;
		}
		this.usedPaths.add(candidate.toLowerCase());
		this.attachmentMap.set(file.path, candidate);
		this.pendingCopies.push({ file, dest: candidate });
		return candidate;
	}

	private async flushCopies(): Promise<void> {
		const copies = this.pendingCopies;
		this.pendingCopies = [];
		for (const { file, dest } of copies) {
			const data = await this.app.vault.readBinary(file);
			await fs.promises.mkdir(path.dirname(dest), { recursive: true });
			await fs.promises.writeFile(dest, Buffer.from(data));
			this.result.attachments++;
		}
	}
}

/** Export one note into `<output folder>/<note name>.md`. */
export async function exportNote(
	app: App,
	settings: SimpleExportSettings,
	file: TFile,
): Promise<ExportResult> {
	const outRoot = resolveOutputDir(app, settings.outputDir);
	const exporter = new Exporter(app, settings, outRoot);
	await exporter.exportNote(file, path.join(outRoot, `${file.basename}.md`));
	return exporter.result;
}

/**
 * Export every note in a folder (sub folders included) into
 * `<output folder>/<folder name>/`, keeping the folder structure.
 */
export async function exportFolder(
	app: App,
	settings: SimpleExportSettings,
	folder: TFolder,
): Promise<ExportResult> {
	const base = resolveOutputDir(app, settings.outputDir);
	const folderName = folder.isRoot() ? app.vault.getName() : folder.name;
	const outRoot = path.join(base, folderName);
	const exporter = new Exporter(app, settings, outRoot);

	const notes: TFile[] = [];
	const collect = (f: TAbstractFile): void => {
		if (f instanceof TFile && f.extension === 'md') notes.push(f);
	};
	// recurseChildren also visits the root itself; collect() ignores folders.
	Vault.recurseChildren(folder, collect);

	if (notes.length === 0) {
		throw new ExportError('This folder has no Markdown notes to export.');
	}

	for (const note of notes) {
		const rel = folder.isRoot() ? note.path : note.path.slice(folder.path.length + 1);
		await exporter.exportNote(note, path.join(outRoot, ...rel.split('/')));
	}
	return exporter.result;
}
