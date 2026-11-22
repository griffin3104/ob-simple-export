import { TFile, TFolder } from 'obsidian';
import type SimpleExportPlugin from '../main';
import { FolderSuggestModal } from '../ui/folder-modal';
import { runExportFolder, runExportNote } from './run-export';

export function registerCommands(plugin: SimpleExportPlugin): void {
	plugin.addCommand({
		id: 'export-current-note',
		name: 'Export current note without frontmatter',
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file || file.extension !== 'md') return false;
			if (!checking) void runExportNote(plugin, file);
			return true;
		},
	});

	plugin.addCommand({
		id: 'export-folder',
		name: 'Export folder without frontmatter',
		callback: () => {
			new FolderSuggestModal(plugin.app, (folder) => {
				void runExportFolder(plugin, folder);
			}).open();
		},
	});

	// Right-click menu in the file explorer.
	plugin.registerEvent(
		plugin.app.workspace.on('file-menu', (menu, abstractFile) => {
			if (abstractFile instanceof TFile && abstractFile.extension === 'md') {
				menu.addItem((item) =>
					item
						.setTitle('Export without frontmatter')
						.setIcon('file-output')
						.onClick(() => void runExportNote(plugin, abstractFile)),
				);
			} else if (abstractFile instanceof TFolder) {
				menu.addItem((item) =>
					item
						.setTitle('Export folder without frontmatter')
						.setIcon('folder-output')
						.onClick(() => void runExportFolder(plugin, abstractFile)),
				);
			}
		}),
	);
}
