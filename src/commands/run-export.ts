import { Notice, TFile, TFolder } from 'obsidian';
import type SimpleExportPlugin from '../main';
import { ExportError, ExportResult, exportFolder, exportNote } from '../utils/exporter';

function report(result: ExportResult): void {
	const parts = [
		`Exported ${result.notes} ${result.notes === 1 ? 'note' : 'notes'}`,
		`${result.attachments} ${result.attachments === 1 ? 'attachment' : 'attachments'}`,
	];
	let message = `${parts.join(' and ')} to ${result.outRoot}`;
	if (result.missing.length > 0) {
		message += `\n${result.missing.length} embedded or linked ${result.missing.length === 1 ? 'file was' : 'files were'} not found. See the developer console for details.`;
		console.warn('Simple Export: missing files', result.missing);
	}
	new Notice(message, 8000);
}

function fail(error: unknown): void {
	if (error instanceof ExportError) {
		new Notice(error.message);
		return;
	}
	console.error('Simple Export failed', error);
	new Notice('Export failed. See the developer console for details.');
}

export async function runExportNote(plugin: SimpleExportPlugin, file: TFile): Promise<void> {
	try {
		report(await exportNote(plugin.app, plugin.settings, file));
	} catch (error) {
		fail(error);
	}
}

export async function runExportFolder(
	plugin: SimpleExportPlugin,
	folder: TFolder,
): Promise<void> {
	try {
		report(await exportFolder(plugin.app, plugin.settings, folder));
	} catch (error) {
		fail(error);
	}
}
